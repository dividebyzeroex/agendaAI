-- Multiple staff and service lines share a single parent appointment.
-- Additional appointments reserve the actual staff slots in agenda_events,
-- keeping the established agenda/calendar, cancellation and availability model.
-- All mutations require the tenant's authenticated cashier permission.
create or replace function public.create_multi_service_booking(
  p_tenant uuid, p_customer uuid, p_items jsonb, p_key uuid
) returns setof public.agenda_events
language plpgsql security definer set search_path to ''
as $fn$
declare x jsonb; n int; idx int:=0; root_id uuid; next_id uuid;
  srv public.servicos; professional public.profissionais;
  from_time timestamptz; to_time timestamptz; pro_id uuid; svc_id uuid;
  booking_status text; already uuid;
begin
 if auth.uid() is null or not public.can_operate_cash(p_tenant)
    then raise exception 'Sem permissão para reservar horários' using errcode='42501'; end if;
 if p_key is null or p_customer is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 2 and 8
    then raise exception 'Selecione entre 2 e 8 serviços'; end if;
 if not exists(select 1 from public.clientes where id=p_customer and estabelecimento_id=p_tenant)
    then raise exception 'Cliente não pertence ao estabelecimento'; end if;
 perform pg_advisory_xact_lock(hashtextextended('multi-service:'||p_tenant::text,0));
 select e.id into already from public.agenda_events e where e.estabelecimento_id=p_tenant
   and e.metadata->>'multi_key'=p_key::text and not (e.metadata ? 'parent_event_id') limit 1;
 if already is not null then
    return query select e.* from public.agenda_events e
      where e.id=already or (e.estabelecimento_id=p_tenant and e.metadata->>'parent_event_id'=already::text)
      order by e.start,e.id;
    return;
 end if;
 root_id:=gen_random_uuid();
 for x in select value from jsonb_array_elements(p_items) loop
   idx:=idx+1;
   pro_id:=(x->>'profissional_id')::uuid; svc_id:=(x->>'servico_id')::uuid;
   from_time:=(x->>'start')::timestamptz; to_time:=(x->>'end')::timestamptz;
   booking_status:=coalesce(x->>'status','confirmado');
   if booking_status not in ('pendente','confirmado') then raise exception 'Status inválido'; end if;
   select * into srv from public.servicos where id=svc_id and estabelecimento_id=p_tenant and ativo;
   select * into professional from public.profissionais where id=pro_id and estabelecimento_id=p_tenant and ativo;
   if srv.id is null or professional.id is null then raise exception 'Serviço ou profissional indisponível'; end if;
   if from_time is null or to_time is null
      or from_time < now()-interval '1 hour' or from_time > now()+interval '365 days'
      or abs(extract(epoch from (to_time-from_time))/60-srv.duracao_min)>0.01
      then raise exception 'Horário ou duração do serviço inválido'; end if;
   if exists(select 1 from public.agenda_events e where e.estabelecimento_id=p_tenant
     and e.profissional_id=pro_id and e.status not in ('cancelado','noshow')
     and e.start<to_time and e."end">from_time)
     then raise exception 'Profissional ocupado: escolha horários distintos para serviços sequenciais'; end if;
   next_id:=case when idx=1 then root_id else gen_random_uuid() end;
   insert into public.agenda_events(
     id,estabelecimento_id,cliente_id,servico_id,profissional_id,title,profissional_nome,
     start,"end",status,"allDay",metadata
   ) values (
     next_id,p_tenant,p_customer,svc_id,pro_id,
     left(coalesce(x->>'title','Atendimento'),800),
     left(coalesce(x->>'profissional_nome',''),800),
     from_time,to_time,booking_status,false,
     jsonb_build_object('group_id',root_id,'multi_key',p_key,'multi_index',idx)
       ||case when idx=1 then '{}'::jsonb else jsonb_build_object('parent_event_id',root_id) end
   );
 end loop;
 return query select e.* from public.agenda_events e where e.id=root_id
   or (e.estabelecimento_id=p_tenant and e.metadata->>'parent_event_id'=root_id::text)
   order by e.start,e.id;
end; $fn$;

create or replace function public.add_attendance_service(
  p_tenant uuid,p_root uuid,p_service uuid,p_professional uuid,p_start timestamptz,
  p_mode text,p_title text,p_professional_name text,p_key uuid
) returns public.agenda_events
language plpgsql security definer set search_path to ''
as $fn$
declare root_event public.agenda_events; child public.agenda_events;
  svc public.servicos; prof public.profissionais; finish_time timestamptz; last_end timestamptz;
begin
 if auth.uid() is null or not public.can_operate_cash(p_tenant)
   then raise exception 'Sem permissão para modificar atendimento' using errcode='42501'; end if;
 if p_key is null or p_mode not in ('paralelo','sequencial')
   then raise exception 'Modo de atendimento inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('multi-service:'||p_tenant::text,0));
 select * into root_event from public.agenda_events where id=p_root
   and estabelecimento_id=p_tenant for update;
 if not found or root_event.metadata ? 'parent_event_id'
   or root_event.status not in ('confirmado','em_atendimento','concluido')
   or root_event.cobranca_enviada then raise exception 'Atendimento indisponível para adicionar serviços'; end if;
 if exists(select 1 from public.caixa_itens
   where agenda_event_id=p_root and status_caixa<>'cancelado')
   then raise exception 'Comanda já emitida. Não altere os serviços de uma cobrança existente'; end if;
 select * into child from public.agenda_events
   where estabelecimento_id=p_tenant and metadata->>'multi_add_key'=p_key::text limit 1;
 if found then return child; end if;
 if (select count(*) from public.agenda_events e where e.id=p_root or
   (e.estabelecimento_id=p_tenant and e.metadata->>'parent_event_id'=p_root::text))>=8
   then raise exception 'Limite de oito serviços por atendimento'; end if;
 select * into svc from public.servicos where id=p_service and estabelecimento_id=p_tenant and ativo;
 select * into prof from public.profissionais where id=p_professional and estabelecimento_id=p_tenant and ativo;
 if svc.id is null or prof.id is null then raise exception 'Serviço ou profissional não disponível'; end if;
 if p_start is null or p_start<now()-interval '1 hour' or p_start>now()+interval '365 days'
   then raise exception 'Início do serviço fora do período permitido'; end if;
 finish_time:=p_start + make_interval(mins=>svc.duracao_min);
 select max(e."end") into last_end from public.agenda_events e
   where e.id=p_root or (e.estabelecimento_id=p_tenant and e.metadata->>'parent_event_id'=p_root::text);
 if p_mode='sequencial' and p_start<last_end
   then raise exception 'Para atendimento sequencial selecione um horário após o último serviço'; end if;
 if exists(select 1 from public.agenda_events e where e.estabelecimento_id=p_tenant
   and e.profissional_id=p_professional and e.status not in ('cancelado','noshow')
   and e.start<finish_time and e."end">p_start)
   then raise exception 'Profissional ocupado nesse horário'; end if;
 insert into public.agenda_events(
   estabelecimento_id,cliente_id,servico_id,profissional_id,title,profissional_nome,
   start,"end",status,metadata
 ) values (
   p_tenant,root_event.cliente_id,p_service,p_professional,
   left(p_title,800),left(p_professional_name,800),
   p_start,finish_time,'em_atendimento',
   jsonb_build_object('parent_event_id',p_root,'group_id',p_root,'multi_add_key',p_key,'mode',p_mode)
 ) returning * into child;
 return child;
end; $fn$;

create or replace function public.remove_attendance_service(
  p_tenant uuid,p_root uuid,p_child uuid
) returns void language plpgsql security definer set search_path to ''
as $fn$
declare root_event public.agenda_events;
begin
 if auth.uid() is null or not public.can_operate_cash(p_tenant)
   then raise exception 'Sem permissão para alterar serviços' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('multi-service:'||p_tenant::text,0));
 select * into root_event from public.agenda_events where id=p_root
   and estabelecimento_id=p_tenant for update;
 if not found or root_event.cobranca_enviada
   or exists(select 1 from public.caixa_itens where agenda_event_id=p_root and status_caixa<>'cancelado')
   then raise exception 'Não é permitido remover serviços de cobrança emitida'; end if;
 delete from public.agenda_events where id=p_child and estabelecimento_id=p_tenant
   and metadata->>'parent_event_id'=p_root::text and cobranca_enviada=false;
 if not found then raise exception 'Serviço adicional não encontrado ou indisponível'; end if;
end; $fn$;

revoke all on function public.create_multi_service_booking(uuid,uuid,jsonb,uuid) from public,anon;
revoke all on function public.add_attendance_service(uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid) from public,anon;
revoke all on function public.remove_attendance_service(uuid,uuid,uuid) from public,anon;
grant execute on function public.create_multi_service_booking(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.add_attendance_service(uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid) to authenticated;
grant execute on function public.remove_attendance_service(uuid,uuid,uuid) to authenticated;
