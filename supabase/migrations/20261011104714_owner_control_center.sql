create table public.app_error_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id),
 page_path text not null check(length(page_path)<=300 and page_path not like '%?%'),
 error_code text not null check(error_code in ('runtime_error','unhandled_rejection')),
 created_at timestamptz not null default now()
);
create index app_error_events_created on public.app_error_events(created_at desc);
create index app_error_events_user on public.app_error_events(user_id);
alter table public.app_error_events enable row level security;
revoke all on public.app_error_events from anon,authenticated;
grant insert(page_path,error_code) on public.app_error_events to authenticated;
grant select on public.app_error_events to authenticated;
create policy error_submit on public.app_error_events for insert to authenticated with check(user_id=(select auth.uid()));
create policy error_owner_read on public.app_error_events for select to authenticated using((select private.is_platform_owner()));
create or replace function public.owner_control_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not private.is_platform_owner() then raise exception 'Acesso restrito ao proprietário' using errcode='42501'; end if;
 return jsonb_build_object('checked_at',now(), 'usage',public.owner_tenant_usage(),
 'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'created_at',e.created_at,'trial_ends_at',e.trial_ends_at,'subscription_status',e.stripe_subscription_status,'livemode',e.stripe_livemode,
 'cash_records',(select count(*) from caixa_itens c where c.estabelecimento_id=e.id),
 'cash_recorded',(select coalesce(sum(c.valor_total),0) from caixa_itens c where c.estabelecimento_id=e.id),
 'last_record_at',(select max(t) from (select max(created_at) t from clientes where estabelecimento_id=e.id union all select max(created_at) from servicos where estabelecimento_id=e.id union all select max(created_at) from profissionais where estabelecimento_id=e.id union all select max(created_at) from agenda_events where estabelecimento_id=e.id union all select max(created_at) from caixa_itens where estabelecimento_id=e.id) a))) from estabelecimento e),'[]'),
 'timeline',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select * from (
 select id::text as record_id,id::text as tenant_id,created_at,'Estabelecimento cadastrado'::text as label from estabelecimento
 union all select id::text,estabelecimento_id::text,created_at,'Cliente cadastrado' from clientes
 union all select id::text,estabelecimento_id::text,created_at,'Serviço cadastrado' from servicos
 union all select id::text,estabelecimento_id::text,created_at,'Produto cadastrado' from produtos
 union all select id::text,estabelecimento_id::text,created_at,'Profissional cadastrado' from profissionais
 union all select id::text,estabelecimento_id::text,created_at,'Agendamento criado' from agenda_events
 union all select id::text,estabelecimento_id::text,created_at,'Movimentação de caixa registrada' from caixa_itens
 union all select id::text,estabelecimento_id::text,created_at,'Atendimento aberto' from support_messages
 union all select id::text,estabelecimento_id::text,paid_at,'Pagamento real confirmado' from commercial_payments where livemode=true and status='paid' and paid_at is not null
 ) events order by created_at desc limit 300
 ) t),'[]'),
 'origins',coalesce((select jsonb_agg(to_jsonb(o)) from (
 select coalesce(nullif(segment,''),'Sem segmento') as segment,coalesce(nullif(split_part(source_id,':',1),''),'Sem origem') as origin,count(*) as prospects,
 count(*) filter(where last_contact_at is not null) as contacted,
 count(*) filter(where status in ('replied','trial','won')) as progressed,
 count(*) filter(where estabelecimento_id is not null) as linked,
 count(*) filter(where exists(select 1 from commercial_payments cp where cp.estabelecimento_id=p.estabelecimento_id and cp.livemode=true and cp.status='paid')) as paid
 from commercial_prospects p group by 1,2) o),'[]'));
end $$;
revoke all on function public.owner_control_snapshot() from public,anon;
grant execute on function public.owner_control_snapshot() to authenticated;
