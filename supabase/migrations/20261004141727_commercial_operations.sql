-- Commercial operations use real ledger data; browser roles cannot modify billing.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
create table if not exists private.platform_owners (user_id uuid primary key references auth.users(id));
alter table private.platform_owners enable row level security;
insert into private.platform_owners(user_id)
select id from auth.users where lower(email)='joao.almeida_msbrasil@outlook.com' and email_confirmed_at is not null
on conflict do nothing;
create or replace function private.is_platform_owner() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.platform_owners where user_id=auth.uid());
$$;
revoke all on function private.is_platform_owner() from public,anon;
grant execute on function private.is_platform_owner() to authenticated,service_role;
create or replace function public.is_platform_owner() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_platform_owner(); $$;
revoke all on function public.is_platform_owner() from public,anon;
grant execute on function public.is_platform_owner() to authenticated,service_role;

alter table public.estabelecimento alter column trial_ends_at set default (now()+interval '30 days');
alter table public.estabelecimento add column if not exists stripe_subscription_status text;
alter table public.estabelecimento add column if not exists stripe_current_period_end timestamptz;
alter table public.estabelecimento add column if not exists stripe_mrr_cents bigint not null default 0;

create table public.commercial_prospects (
 id uuid primary key default gen_random_uuid(), business_name text not null check(length(business_name) between 2 and 160),
 email text unique, source_id text unique, segment text not null default 'servicos', source_url text,
 status text not null default 'new' check(status in ('new','qualified','contacted','replied','trial','won','lost','unsubscribed')),
 consent_at timestamptz, consent_source text, unsubscribed_at timestamptz,
 estabelecimento_id uuid references public.estabelecimento(id) on delete set null,
 created_at timestamptz not null default now(), last_contact_at timestamptz,
 check(email is null or (email=lower(email) and length(email)<=254))
);
create table public.commercial_messages (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.commercial_prospects(id),
 stage text not null, subject text not null, body text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','suppressed')),
 due_at timestamptz not null default now(), locked_at timestamptz, sent_at timestamptz,
 provider_id text, error text, attempts integer not null default 0, created_at timestamptz not null default now(),
 unique(prospect_id,stage)
);
create index commercial_messages_due on public.commercial_messages(status,due_at);
create table public.commercial_agent_runs (
 id uuid primary key default gen_random_uuid(), agent text not null, status text not null,
 summary jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.commercial_payments (
 id text primary key, estabelecimento_id uuid references public.estabelecimento(id),
 amount_cents bigint not null, currency text not null, status text not null,
 paid_at timestamptz, created_at timestamptz not null default now()
);
create table public.commercial_terms_acceptances (
 user_id uuid not null references auth.users(id), version text not null,
 accepted_at timestamptz not null default now(), marketing_consent boolean not null default false,
 primary key(user_id,version)
);
create table private.commercial_locks (name text primary key, locked_until timestamptz not null);

alter table public.commercial_prospects enable row level security;
alter table public.commercial_messages enable row level security;
alter table public.commercial_agent_runs enable row level security;
alter table public.commercial_payments enable row level security;
alter table public.commercial_terms_acceptances enable row level security;
alter table private.commercial_locks enable row level security;
revoke all on public.commercial_prospects,public.commercial_messages,public.commercial_agent_runs,public.commercial_payments,public.commercial_terms_acceptances from anon,authenticated;
grant select on public.commercial_prospects,public.commercial_messages,public.commercial_agent_runs,public.commercial_payments to authenticated;
grant all on public.commercial_prospects,public.commercial_messages,public.commercial_agent_runs,public.commercial_payments,public.commercial_terms_acceptances,private.commercial_locks to service_role;
create policy owner_prospects on public.commercial_prospects for select to authenticated using((select private.is_platform_owner()));
create policy owner_messages on public.commercial_messages for select to authenticated using((select private.is_platform_owner()));
create policy owner_runs on public.commercial_agent_runs for select to authenticated using((select private.is_platform_owner()));
create policy owner_payments on public.commercial_payments for select to authenticated using((select private.is_platform_owner()));

create or replace function public.commercial_acquire_lock() returns boolean language sql security invoker set search_path='' as $$
 with lease as (
 insert into private.commercial_locks(name,locked_until) values('worker',now()+interval '5 minutes')
 on conflict(name) do update set locked_until=excluded.locked_until where private.commercial_locks.locked_until<now()
 returning name) select exists(select 1 from lease);
$$;
revoke all on function public.commercial_acquire_lock() from public,anon,authenticated;
grant execute on function public.commercial_acquire_lock() to service_role;
create or replace function public.commercial_release_lock() returns void language sql security invoker set search_path='' as $$
 update private.commercial_locks set locked_until=now() where name='worker';
$$;
revoke all on function public.commercial_release_lock() from public,anon,authenticated;
grant execute on function public.commercial_release_lock() to service_role;

create or replace function private.protect_subscription_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='INSERT' then
   if new.user_id is distinct from auth.uid() then raise exception 'Invalid owner'; end if;
   new.trial_ends_at:=coalesce((select min(created_at) from public.estabelecimento where user_id=auth.uid()),now())+interval '30 days'; new.plano:='starter'; new.plano_expires_at:=null;
   new.stripe_customer_id:=null; new.stripe_subscription_id:=null; new.stripe_subscription_status:=null;
   new.stripe_current_period_end:=null; new.stripe_mrr_cents:=0;
  elsif new.active is distinct from old.active or new.user_id is distinct from old.user_id or new.trial_ends_at is distinct from old.trial_ends_at
   or new.plano is distinct from old.plano or new.plano_expires_at is distinct from old.plano_expires_at
   or new.stripe_customer_id is distinct from old.stripe_customer_id or new.stripe_subscription_id is distinct from old.stripe_subscription_id
   or new.stripe_subscription_status is distinct from old.stripe_subscription_status
   or new.stripe_current_period_end is distinct from old.stripe_current_period_end or new.stripe_mrr_cents is distinct from old.stripe_mrr_cents then
    raise exception 'Billing fields are server managed';
  end if;
 end if;
 return new;
end; $$;
create trigger protect_subscription_fields before insert or update on public.estabelecimento for each row execute function private.protect_subscription_fields();

create or replace function public.get_platform_metrics() returns json language plpgsql security definer set search_path='' as $$
begin
 if not private.is_platform_owner() then raise exception 'Unauthorized' using errcode='42501'; end if;
 return json_build_object(
 'totalTenants',(select count(*) from public.estabelecimento),
 'activeTenants',(select count(*) from public.estabelecimento where active and (trial_ends_at>now() or plano_expires_at>now())),
 'trialTenants',(select count(*) from public.estabelecimento where active and trial_ends_at>now() and (plano_expires_at is null or plano_expires_at<=now())),
 'payingTenants',(select count(*) from public.estabelecimento where stripe_subscription_status in ('active','canceled_at_period_end') and plano_expires_at>now()),
 'totalMrr',(select coalesce(sum(stripe_mrr_cents),0)/100.0 from public.estabelecimento where stripe_subscription_status='active' and plano_expires_at>now()),
 'totalAppointments',(select count(*) from public.agenda_events),
 'aiMessagesSent',(select count(*) from public.chatbot_messages),
 'prospects',(select count(*) from public.commercial_prospects),
 'revenueMonth',(select coalesce(sum(amount_cents),0)/100.0 from public.commercial_payments where currency='brl' and status='paid' and paid_at>=date_trunc('month',now())),
 'commercialSent',(select count(*) from public.commercial_messages where status='sent'));
end; $$;
revoke all on function public.get_platform_metrics() from public,anon;
grant execute on function public.get_platform_metrics() to authenticated;
create or replace function public.get_platform_tenants() returns json language plpgsql security definer set search_path='' as $$
declare result json;
begin
 if not private.is_platform_owner() then raise exception 'Unauthorized' using errcode='42501'; end if;
 select coalesce(json_agg(json_build_object('id',id,'nome',nome,'slug',slug,'status',case when not active then 'blocked' when plano_expires_at>now() then 'paid' when trial_ends_at>now() then 'trial' else 'expired' end,'plano',plano,'created_at',created_at,'trial_ends_at',trial_ends_at) order by created_at desc),'[]'::json) into result from public.estabelecimento;
 return result;
end; $$;
revoke all on function public.get_platform_tenants() from public,anon;
grant execute on function public.get_platform_tenants() to authenticated;
drop policy "Acesso Estabelecimento RBAC" on public.estabelecimento;
create policy establishment_member_read on public.estabelecimento for select to authenticated using(id in (select public.get_meus_estabelecimentos()));
create policy establishment_owner_update on public.estabelecimento for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy establishment_owner_delete on public.estabelecimento for delete to authenticated using(user_id=(select auth.uid()));
