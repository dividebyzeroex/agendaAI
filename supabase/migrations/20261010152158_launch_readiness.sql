alter table public.estabelecimento add column if not exists stripe_livemode boolean not null default false;
alter table public.commercial_payments add column if not exists livemode boolean not null default false;
create or replace function private.protect_subscription_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='INSERT' then
   if new.user_id is distinct from auth.uid() then raise exception 'Invalid owner'; end if;
   new.trial_ends_at:=coalesce((select min(created_at) from public.estabelecimento where user_id=auth.uid()),now())+interval '30 days'; new.plano:='starter'; new.plano_expires_at:=null;
   new.stripe_customer_id:=null; new.stripe_subscription_id:=null; new.stripe_subscription_status:=null;
   new.stripe_current_period_end:=null; new.stripe_mrr_cents:=0; new.stripe_livemode:=false;
  elsif new.active is distinct from old.active or new.user_id is distinct from old.user_id or new.trial_ends_at is distinct from old.trial_ends_at
   or new.plano is distinct from old.plano or new.plano_expires_at is distinct from old.plano_expires_at
   or new.stripe_customer_id is distinct from old.stripe_customer_id or new.stripe_subscription_id is distinct from old.stripe_subscription_id
   or new.stripe_subscription_status is distinct from old.stripe_subscription_status
   or new.stripe_livemode is distinct from old.stripe_livemode or new.stripe_current_period_end is distinct from old.stripe_current_period_end or new.stripe_mrr_cents is distinct from old.stripe_mrr_cents then
    raise exception 'Billing fields are server managed';
  end if;
 end if;
 return new;
end; $$;
create or replace function public.get_platform_metrics() returns json language plpgsql security definer set search_path='' as $$
begin
 if not private.is_platform_owner() then raise exception 'Unauthorized' using errcode='42501'; end if;
 return json_build_object(
 'totalTenants',(select count(*) from public.estabelecimento),
 'activeTenants',(select count(*) from public.estabelecimento where active and (trial_ends_at>now() or plano_expires_at>now())),
 'trialTenants',(select count(*) from public.estabelecimento where active and trial_ends_at>now() and (plano_expires_at is null or plano_expires_at<=now())),
 'payingTenants',(select count(*) from public.estabelecimento where stripe_livemode and stripe_subscription_status in ('active','canceled_at_period_end') and plano_expires_at>now()),
 'totalMrr',(select coalesce(sum(stripe_mrr_cents),0)/100.0 from public.estabelecimento where stripe_livemode and stripe_subscription_status='active' and plano_expires_at>now()),
 'totalAppointments',(select count(*) from public.agenda_events),
 'aiMessagesSent',(select count(*) from public.chatbot_messages),
 'prospects',(select count(*) from public.commercial_prospects),
 'revenueMonth',(select coalesce(sum(amount_cents),0)/100.0 from public.commercial_payments where livemode and currency='brl' and status='paid' and paid_at>=date_trunc('month',now())),
 'commercialSent',(select count(*) from public.commercial_messages where status='sent'));
end; $$;

-- Resolve legacy invoker functions against a fixed schema, retaining their RLS enforcement.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not p.prosecdef and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
  execute format('alter function %s set search_path = public, extensions, pg_temp',f.signature);
 end loop;
end $$;
create or replace function private.enforce_professional_limit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.ativo then
  perform pg_advisory_xact_lock(hashtextextended(new.estabelecimento_id::text,0));
  if exists(select 1 from public.estabelecimento where id=new.estabelecimento_id and plano in ('starter','basico')) and
    (select count(*) from public.profissionais where estabelecimento_id=new.estabelecimento_id and ativo and id<>new.id)>=5 then
   raise exception 'O plano permite até cinco profissionais ativos.' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create trigger enforce_professional_limit before insert or update on public.profissionais for each row execute function private.enforce_professional_limit();
-- Owner authority derives from the explicitly designated, verified account only.
create or replace function private.bootstrap_verified_platform_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(new.email)='joao.almeida.msbrasil@gmail.com' and new.email_confirmed_at is not null then
  insert into private.platform_owners(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.bootstrap_verified_platform_owner() from public,anon,authenticated;
create trigger bootstrap_verified_platform_owner after insert or update of email_confirmed_at on auth.users for each row execute function private.bootstrap_verified_platform_owner();
insert into private.platform_owners(user_id) select id from auth.users where lower(email)='joao.almeida.msbrasil@gmail.com' and email_confirmed_at is not null on conflict do nothing;

CREATE OR REPLACE FUNCTION public.create_profissional_safe(p_data jsonb)
 RETURNS profissionais
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = public, extensions, pg_temp
AS $function$
declare
  v_res public.profissionais;
begin
  insert into public.profissionais (estabelecimento_id, nome, cargo, bio, email, telefone, ativo, role, foto_url, cor_agenda, comissao_padrao)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'nome',
    p_data->>'cargo',
    p_data->>'bio',
    p_data->>'email',
    p_data->>'telefone',
    coalesce((p_data->>'ativo')::boolean, true), coalesce((p_data->>'role')::public.user_role, 'barbeiro'::public.user_role), p_data->>'foto_url', coalesce(p_data->>'cor_agenda','#4f46e5'), coalesce((p_data->>'comissao_padrao')::numeric,0)
  ) returning * into v_res;
  return v_res;
end; $function$
;
