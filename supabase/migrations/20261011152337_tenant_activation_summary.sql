-- Invoker privileges retain existing row-level tenant authorization.
create or replace function public.tenant_activation_summary(p_estabelecimento_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.estabelecimento%rowtype; since_at timestamptz; during_trial boolean;
begin
 if auth.uid() is null then raise exception 'Não autenticado' using errcode='42501'; end if;
 select * into e from public.estabelecimento where id=p_estabelecimento_id;
 if not found then raise exception 'Estabelecimento indisponível' using errcode='42501'; end if;
 during_trial := e.trial_ends_at>now() and not coalesce(e.plano_expires_at>now(),false);
 since_at := case when during_trial then e.created_at else now()-interval '30 days' end;
 return jsonb_build_object(
 'period_start',since_at,'period_end',now(),'during_trial',coalesce(during_trial,false),
 'services_ready',exists(select 1 from public.servicos s where s.estabelecimento_id=e.id and s.ativo and s.duracao_min>0),
 'staff_ready',exists(select 1 from public.profissionais p where p.estabelecimento_id=e.id and p.ativo),
 'schedule_ready',exists(
   select 1 from public.profissionais p
   join public.profissional_servicos ps on ps.profissional_id=p.id and ps.estabelecimento_id=e.id
   join public.servicos s on s.id=ps.servico_id and s.estabelecimento_id=e.id and s.ativo and s.duracao_min>0
   join public.profissional_disponibilidades d on d.profissional_id=p.id and d.estabelecimento_id=e.id and d.ativo
   join public.horarios_funcionamento h on h.estabelecimento_id=e.id and h.dia_semana=d.dia_semana and h.ativo
   cross join lateral generate_series((extract(epoch from h.abre)/60)::int,(extract(epoch from h.fecha)/60)::int-s.duracao_min,15) slot(minute)
   where p.estabelecimento_id=e.id and p.ativo
   and slot.minute >= extract(epoch from d.hora_inicio)/60
   and slot.minute+s.duracao_min <= extract(epoch from d.hora_fim)/60
   and (d.intervalo_inicio is null or d.intervalo_fim is null
     or slot.minute+s.duracao_min <= extract(epoch from d.intervalo_inicio)/60
     or slot.minute >= extract(epoch from d.intervalo_fim)/60)),
 'first_booking',exists(select 1 from public.agenda_events a where a.estabelecimento_id=e.id and a.status<>'cancelado' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'appointments',(select count(*) from public.agenda_events a where a.estabelecimento_id=e.id and a.created_at>=since_at and a.created_at<=now() and a.status<>'cancelado' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'completed',(select count(*) from public.agenda_events a where a.estabelecimento_id=e.id and a.created_at>=since_at and a.created_at<=now() and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'public_bookings',(select count(*) from public.agenda_events a where a.estabelecimento_id=e.id and a.created_at>=since_at and a.created_at<=now() and a.status<>'cancelado' and a.metadata->>'origin'='public_booking' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'clients',(select count(*) from public.clientes c where c.estabelecimento_id=e.id and c.created_at>=since_at and c.created_at<=now()),
 'cash_records',(select count(*) from public.caixa_itens c where c.estabelecimento_id=e.id and c.created_at>=since_at and c.created_at<=now())
 );
end $$;
revoke all on function public.tenant_activation_summary(uuid) from public,anon;
grant execute on function public.tenant_activation_summary(uuid) to authenticated;
