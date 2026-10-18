alter table public.commercial_prospects add column if not exists objection text;
alter table public.commercial_prospects add column if not exists qualification_note text;
-- Owner-only cross-tenant aggregates. Authorization is checked before reading auth data.
create table if not exists private.app_activity (
 user_id uuid not null references auth.users(id) on delete cascade,
 estabelecimento_id uuid not null references public.estabelecimento(id) on delete cascade,
 last_seen_at timestamptz not null default now(), page_path text not null default '',
 primary key(user_id,estabelecimento_id)
);
alter table private.app_activity enable row level security;
revoke all on private.app_activity from public,anon,authenticated;
grant all on private.app_activity to service_role;
create or replace function public.record_app_activity(p_estabelecimento_id uuid,p_page text default '/admin') returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.get_meus_estabelecimentos() x where x=p_estabelecimento_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
 insert into private.app_activity(user_id,estabelecimento_id,page_path) values(auth.uid(),p_estabelecimento_id,left(split_part(coalesce(p_page,'/admin'), '?',1),200))
 on conflict(user_id,estabelecimento_id) do update set last_seen_at=now(),page_path=excluded.page_path;
end $$;
revoke all on function public.record_app_activity(uuid,text) from public,anon;
grant execute on function public.record_app_activity(uuid,text) to authenticated;

create index if not exists owner_messages_prospect_status on public.commercial_messages(prospect_id,status);
create index if not exists owner_events_tenant_created on public.agenda_events(estabelecimento_id,created_at);
create index if not exists owner_clients_tenant on public.clientes(estabelecimento_id);
create index if not exists owner_payments_real_date on public.commercial_payments(paid_at) where livemode and status='paid';

create or replace function public.owner_business_snapshot(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant_rows jsonb; since_at timestamptz; result jsonb;
begin
 if auth.uid() is null or not private.is_platform_owner() then raise exception 'Acesso exclusivo ao Owner' using errcode='42501'; end if;
 if p_days not in (7,30,90) then raise exception 'Período inválido'; end if;
 since_at:=now()-make_interval(days=>p_days);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into tenant_rows from (
 select e.id,e.nome,e.slug,e.segmento,e.user_id,e.active,e.created_at,e.trial_ends_at,e.plano_expires_at,e.plano,
 e.stripe_subscription_status as subscription_status,e.stripe_livemode,e.stripe_mrr_cents,u.email,u.email_confirmed_at,u.last_sign_in_at,u.banned_until,
 exists(select 1 from private.platform_owners o where o.user_id=e.user_id) as internal,
 (select max(a.last_seen_at) from private.app_activity a where a.estabelecimento_id=e.id) as last_seen_at,
 (select count(*) from public.servicos s where s.estabelecimento_id=e.id and s.ativo and s.duracao_min>0) as services,
 (select count(*) from public.profissionais p where p.estabelecimento_id=e.id and p.ativo) as professionals,
 (select count(*) from public.clientes c where c.estabelecimento_id=e.id) as clients,
 (select count(*) from public.agenda_events a where a.estabelecimento_id=e.id and a.status<>'cancelado' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true') as bookings,
 (select count(*) from public.agenda_events a where a.estabelecimento_id=e.id and a.created_at>=since_at and a.status<>'cancelado' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true') as bookings_period,
 (select max(a.created_at) from public.agenda_events a where a.estabelecimento_id=e.id) as last_booking_at,
 exists(select 1 from public.profissionais p
 join public.profissional_servicos ps on ps.profissional_id=p.id and ps.estabelecimento_id=e.id
 join public.servicos s on s.id=ps.servico_id and s.estabelecimento_id=e.id and s.ativo and s.duracao_min>0
 join public.profissional_disponibilidades d on d.profissional_id=p.id and d.estabelecimento_id=e.id and d.ativo
 join public.horarios_funcionamento h on h.estabelecimento_id=e.id and h.dia_semana=d.dia_semana and h.ativo
 cross join lateral generate_series((extract(epoch from h.abre)/60)::int,(extract(epoch from h.fecha)/60)::int-s.duracao_min,15) slot(minute)
 where p.estabelecimento_id=e.id and p.ativo and slot.minute>=extract(epoch from d.hora_inicio)/60 and slot.minute+s.duracao_min<=extract(epoch from d.hora_fim)/60
 and (d.intervalo_inicio is null or d.intervalo_fim is null or slot.minute+s.duracao_min<=extract(epoch from d.intervalo_inicio)/60 or slot.minute>=extract(epoch from d.intervalo_fim)/60)) as booking_ready,
 exists(select 1 from public.commercial_payments cp where cp.estabelecimento_id=e.id and cp.livemode and cp.status='paid' and cp.paid_at is not null) as paid_evidence,
 (select coalesce(sum(cp.amount_cents),0) from public.commercial_payments cp where cp.estabelecimento_id=e.id and cp.livemode and cp.status='paid' and cp.currency='brl' and cp.paid_at is not null) as received_cents
 from public.estabelecimento e left join auth.users u on u.id=e.user_id
 ) t;
 with tenants as (select * from jsonb_to_recordset(tenant_rows) as t(id uuid,internal boolean,active boolean,user_id uuid,email_confirmed_at timestamptz,trial_ends_at timestamptz,plano_expires_at timestamptz,stripe_livemode boolean,subscription_status text,stripe_mrr_cents bigint,bookings bigint,booking_ready boolean,last_seen_at timestamptz,paid_evidence boolean)),
 paying as (select * from tenants where not internal and stripe_livemode and subscription_status in ('active','canceled_at_period_end') and plano_expires_at>now() and paid_evidence)
 select jsonb_build_object(
 'checked_at',now(),'period_days',p_days,'period_start',since_at,'tenants',tenant_rows,
 'totals',jsonb_build_object(
 'workspaces',(select count(*) from tenants),'customers',(select count(*) from tenants where not internal and user_id is not null and email_confirmed_at is not null),
 'internal',(select count(*) from tenants where internal),'unowned',(select count(*) from tenants where user_id is null),
 'trials',(select count(*) from tenants where not internal and active and email_confirmed_at is not null and trial_ends_at>now() and not coalesce(plano_expires_at>now(),false)),
 'subscribers',(select count(*) from paying),'licensed',(select count(*) from tenants where not internal and active and plano_expires_at>now() and not coalesce(stripe_livemode,false)),
 'mrr_cents',(select coalesce(sum(stripe_mrr_cents),0) from paying where subscription_status='active'),
 'received_cents',(select coalesce(sum(amount_cents),0) from public.commercial_payments where livemode and currency='brl' and status='paid' and paid_at>=since_at),
 'activated',(select count(*) from tenants where not internal and user_id is not null and bookings>0),
 'ready',(select count(*) from tenants where not internal and user_id is not null and booking_ready),
 'active_7d',(select count(*) from tenants where not internal and last_seen_at>now()-interval '7 days')),
 'acquisition',jsonb_build_object(
 'prospects',(select count(*) from public.commercial_prospects),
 'contacted',(select count(distinct prospect_id) from public.commercial_messages where provider_id is not null and sent_at is not null),
 'sent',(select count(*) from public.commercial_messages where provider_id is not null and sent_at is not null),
 'failed',(select count(*) from public.commercial_messages where status='failed'),
 'queued',(select count(*) from public.commercial_messages where status='queued'),
 'replied',(select count(*) from public.commercial_prospects where status='replied'),
 'linked',(select count(*) from public.commercial_prospects where estabelecimento_id is not null),
 'status_without_evidence',(select count(*) from public.commercial_prospects p where p.status in ('contacted','replied','trial','won') and not exists(select 1 from public.commercial_messages m where m.prospect_id=p.id and m.provider_id is not null and m.sent_at is not null)),
 'period_sent',(select count(*) from public.commercial_messages where provider_id is not null and sent_at>=since_at)),
 'users',coalesce((select jsonb_agg(to_jsonb(u)) from (select a.id,a.email,a.email_confirmed_at,a.created_at,a.last_sign_in_at,a.banned_until,
 exists(select 1 from private.platform_owners o where o.user_id=a.id) as is_owner,
 (select max(v.last_seen_at) from private.app_activity v where v.user_id=a.id) as last_seen_at,
 (select count(*) from public.estabelecimento e where e.user_id=a.id) as workspaces
 from auth.users a order by a.created_at desc limit 200) u),'[]'::jsonb),
 'segments',coalesce((select jsonb_agg(to_jsonb(s)) from (select coalesce(nullif(p.segment,''),'outro') as segment,count(*) as prospects,
 count(*) filter(where exists(select 1 from public.commercial_messages m where m.prospect_id=p.id and m.provider_id is not null and m.sent_at is not null)) as contacted,
 count(*) filter(where p.status='replied') as replied,count(*) filter(where p.estabelecimento_id is not null) as linked from public.commercial_prospects p group by 1) s),'[]'::jsonb),
 'revenue',coalesce((select jsonb_agg(to_jsonb(r) order by r.month) from (
 select to_char(d,'YYYY-MM') as month,coalesce((select sum(cp.amount_cents) from public.commercial_payments cp where cp.livemode and cp.currency='brl' and cp.status='paid' and date_trunc('month',cp.paid_at at time zone 'America/Sao_Paulo')=d),0) as amount_cents
 from generate_series(date_trunc('month',now() at time zone 'America/Sao_Paulo')-interval '5 months',date_trunc('month',now() at time zone 'America/Sao_Paulo'),interval '1 month') d) r),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(p)) from (select id,estabelecimento_id,amount_cents,currency,status,paid_at,created_at from public.commercial_payments where livemode order by created_at desc limit 100) p),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(m)) from (select m.id,m.prospect_id,p.business_name,p.email,p.segment,p.objection,p.qualification_note,m.subject,m.status,m.provider_id,m.sent_at,m.due_at,m.error,m.stage,m.body from public.commercial_messages m join public.commercial_prospects p on p.id=m.prospect_id order by m.created_at desc limit 200) m),'[]'::jsonb),
 'health',jsonb_build_object('database','reachable','errors_period',(select count(*) from public.app_error_events where created_at>=since_at),
 'support_open',(select count(*) from public.support_messages where status in ('aberto','em_analise')),
 'oldest_queue_at',(select min(due_at) from public.commercial_messages where status='queued'),
 'last_automation_at',(select max(created_at) from public.commercial_agent_runs where agent in ('queue-producer','commercial_followup','finance_monitor')),
 'recent_errors',coalesce((select jsonb_agg(to_jsonb(e)) from (select page_path,error_code,created_at from public.app_error_events order by created_at desc limit 20)e),'[]'::jsonb),
 'telemetry_since',(select min(last_seen_at) from private.app_activity)),
 'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select agent,status,summary,created_at from public.commercial_agent_runs where agent='owner' order by created_at desc limit 20)a),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.owner_business_snapshot(integer) from public,anon;
grant execute on function public.owner_business_snapshot(integer) to authenticated;

-- First-use setup is explicit, atomic and limited to a tenant with no active staff.
create or replace function public.tenant_quick_start(p_id uuid,p_staff_name text,p_services jsonb,p_days integer[],p_open time,p_close time)
returns uuid language plpgsql security invoker set search_path='' as $$
declare staff_id uuid; sid uuid; s jsonb; d integer;
begin
 perform 1 from public.estabelecimento where id=p_id and user_id=auth.uid() and active for update;
 if auth.uid() is null or not found then raise exception 'Acesso negado' using errcode='42501'; end if;
 if coalesce(length(trim(p_staff_name)),0) not between 2 and 120 or jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services) not between 1 and 20
 or p_open is null or p_close is null or p_open>=p_close or coalesce(cardinality(p_days),0) not between 1 and 7 then raise exception 'Confira serviços, profissional e horários'; end if;
 if exists(select 1 from public.profissionais where estabelecimento_id=p_id and ativo) then raise exception 'Sua equipe já existe. Continue nas configurações.'; end if;
 insert into public.profissionais(estabelecimento_id,nome,ativo) values(p_id,trim(p_staff_name),true) returning id into staff_id;
 for s in select value from jsonb_array_elements(p_services) loop
  if jsonb_typeof(s) is distinct from 'object' or nullif(s->>'preco','') is null or nullif(s->>'duracao_min','') is null or nullif(trim(s->>'titulo'),'') is null or length(s->>'titulo')>120 or (s->>'preco')::numeric not between 0 and 100000 or (s->>'duracao_min')::int not between 5 and 600 then raise exception 'Serviço inválido'; end if;
  select id into sid from public.servicos where estabelecimento_id=p_id and lower(trim(titulo))=lower(trim(s->>'titulo')) and ativo limit 1;
  if sid is null then insert into public.servicos(estabelecimento_id,titulo,descricao,preco,duracao_min,ativo) values(p_id,trim(s->>'titulo'),'Configurado no início guiado',(s->>'preco')::numeric,(s->>'duracao_min')::int,true) returning id into sid; end if;
  insert into public.profissional_servicos(estabelecimento_id,profissional_id,servico_id) values(p_id,staff_id,sid);
 end loop;
 foreach d in array p_days loop
  if d not between 0 and 6 then raise exception 'Dia inválido'; end if;
  update public.horarios_funcionamento set abre=p_open,fecha=p_close,ativo=true where estabelecimento_id=p_id and dia_semana=d and not coalesce(ativo,false);
  insert into public.horarios_funcionamento(estabelecimento_id,dia_semana,dia_nome,abre,fecha,ativo)
  select p_id,d,(array['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'])[d+1],p_open,p_close,true
  where not exists(select 1 from public.horarios_funcionamento where estabelecimento_id=p_id and dia_semana=d);
  insert into public.profissional_disponibilidades(estabelecimento_id,profissional_id,dia_semana,dia_nome,hora_inicio,hora_fim,ativo)
  select p_id,staff_id,d,(array['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'])[d+1],p_open,p_close,true
  where not exists(select 1 from public.profissional_disponibilidades where profissional_id=staff_id and dia_semana=d);
 end loop;
 return staff_id;
end $$;
revoke all on function public.tenant_quick_start(uuid,text,jsonb,integer[],time,time) from public,anon;
grant execute on function public.tenant_quick_start(uuid,text,jsonb,integer[],time,time) to authenticated;

create or replace function public.import_clients_csv(p_id uuid,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; phone text; mail text; inserted_count integer:=0; skipped_count integer:=0;
begin
 perform 1 from public.estabelecimento where id=p_id and user_id=auth.uid() and active for update;
 if auth.uid() is null or not found then raise exception 'Acesso negado' using errcode='42501'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Importe de 1 a 500 clientes por arquivo'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  phone:=regexp_replace(coalesce(r->>'telefone',''),'[^0-9]','','g');mail:=lower(trim(coalesce(r->>'email','')));
  if length(trim(coalesce(r->>'nome',''))) not between 2 and 160 or length(phone)>15 or (phone='' and mail='') or (phone<>'' and length(phone)<10) or (mail<>'' and (length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Linha inválida. Confira nome, telefone e e-mail.'; end if;
  if length(phone) in (10,11) then phone:='55'||phone; end if;
  if exists(select 1 from public.clientes c where c.estabelecimento_id=p_id and ((phone<>'' and regexp_replace(coalesce(c.telefone,''),'[^0-9]','','g') in (phone,substring(phone from 3))) or (mail<>'' and lower(c.email)=mail))) then skipped_count:=skipped_count+1;
  else insert into public.clientes(estabelecimento_id,nome,telefone,email,observacoes,metadata) values(p_id,trim(r->>'nome'),nullif(phone,''),nullif(mail,''),left(r->>'observacoes',2000),jsonb_build_object('imported_from','csv'));inserted_count:=inserted_count+1; end if;
 end loop;
 return jsonb_build_object('inserted',inserted_count,'skipped',skipped_count);
end $$;
revoke all on function public.import_clients_csv(uuid,jsonb) from public,anon;
grant execute on function public.import_clients_csv(uuid,jsonb) to authenticated;
create or replace function public.platform_is_protected_user(p_id uuid) returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from private.platform_owners where user_id=p_id);
$$;
revoke all on function public.platform_is_protected_user(uuid) from public,anon,authenticated;
grant execute on function public.platform_is_protected_user(uuid) to service_role;

alter table public.commercial_messages add column if not exists channel text not null default 'resend';
