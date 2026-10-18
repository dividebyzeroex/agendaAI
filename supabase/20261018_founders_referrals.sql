-- AgendaAI Founders Club + Indica+ — initial pilot, 2026-10-18.
-- Additive migration. No existing subscription or tenant is changed by applying it.
-- Private tables are intentionally NOT exposed via PostgREST.
create schema if not exists private;

create table if not exists private.partner_program_settings (
  singleton boolean primary key default true check (singleton),
  founder_pilot_capacity integer not null default 3 check (founder_pilot_capacity between 0 and 10),
  founder_absolute_capacity integer not null default 10 check (founder_absolute_capacity between 1 and 10),
  reward_cents integer not null default 5000 check (reward_cents between 0 and 10000),
  qualifying_first_payment_cents integer not null default 7900 check (qualifying_first_payment_cents >= 0),
  refund_review_days integer not null default 30 check (refund_review_days between 1 and 90)
);
insert into private.partner_program_settings(singleton) values (true) on conflict do nothing;

create table if not exists private.founder_invitations (
  id uuid primary key default gen_random_uuid(),
  code uuid not null unique default gen_random_uuid(),
  estabelecimento_id uuid not null unique references public.estabelecimento(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  redeem_by timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  granted_until timestamptz,
  terms_version text,
  status text not null default 'pending' check (status in ('pending','active','cancelled')),
  check ((status = 'active' and accepted_at is not null and granted_until is not null) or status <> 'active')
);
create index if not exists founder_invites_status_idx on private.founder_invitations(status);

create table if not exists private.referral_links (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null unique references public.estabelecimento(id) on delete restrict,
  code uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  terms_accepted_at timestamptz not null,
  active boolean not null default true
);

create table if not exists private.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referral_link_id uuid not null references private.referral_links(id) on delete restrict,
  referrer_estabelecimento_id uuid not null references public.estabelecimento(id) on delete restrict,
  referred_estabelecimento_id uuid not null unique references public.estabelecimento(id) on delete restrict,
  captured_at timestamptz not null default now(),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','pending_review','approved','paid','void')),
  qualifying_invoice_id text unique,
  first_paid_at timestamptz,
  review_after timestamptz,
  reward_cents integer not null default 5000 check (reward_cents >= 0),
  approved_at timestamptz,
  paid_at timestamptz,
  payout_reference text,
  void_reason text,
  check (referrer_estabelecimento_id <> referred_estabelecimento_id),
  check (status <> 'paid' or (paid_at is not null and payout_reference is not null))
);
create index if not exists referral_attributions_referrer_idx on private.referral_attributions(referrer_estabelecimento_id,captured_at desc);
create index if not exists referral_attributions_pending_idx on private.referral_attributions(review_after) where status='pending_review';

create table if not exists private.referral_invoice_events (
  stripe_event_id text primary key,
  stripe_invoice_id text not null,
  referred_estabelecimento_id uuid not null references public.estabelecimento(id),
  amount_paid_cents integer not null,
  received_at timestamptz not null default now()
);

-- Isolate relations even if schemas exposed later. No direct client access.
revoke all on all tables in schema private from anon, authenticated;

create or replace function public.partner_owner_issue_founder_invite(p_estabelecimento_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.partner_program_settings%rowtype;
        e public.estabelecimento%rowtype;
        new_inv private.founder_invitations%rowtype;
        occupied integer;
begin
 if not private.is_platform_owner() then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into s from private.partner_program_settings where singleton for update;
 select * into e from public.estabelecimento where id=p_estabelecimento_id for update;
 if not found then raise exception 'Estabelecimento não encontrado'; end if;
 if not e.active then raise exception 'Estabelecimento bloqueado'; end if;
 if e.stripe_subscription_id is not null or e.stripe_subscription_status in ('active','trialing','past_due') then
   raise exception 'Este estabelecimento já possui assinatura Stripe. Não é elegível sem revisão manual';
 end if;
 if exists (select 1 from private.founder_invitations where estabelecimento_id=e.id) then
   raise exception 'Este estabelecimento já possui convite fundador';
 end if;
 select count(*) into occupied from private.founder_invitations
 where status='active' or (status='pending' and redeem_by>now());
 if occupied>=s.founder_pilot_capacity then raise exception 'Vagas do piloto esgotadas'; end if;
 insert into private.founder_invitations(estabelecimento_id,created_by)
 values(e.id,auth.uid()) returning * into new_inv;
 return jsonb_build_object('id',new_inv.id,'code',new_inv.code,'redeem_by',new_inv.redeem_by,'status',new_inv.status);
end $$;

create or replace function public.partner_accept_founder_invite(p_code uuid,p_accept_terms boolean)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare inv private.founder_invitations%rowtype;
        e public.estabelecimento%rowtype;
        deadline timestamptz;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
 if not p_accept_terms then raise exception 'Aceite dos termos obrigatório'; end if;
 select * into inv from private.founder_invitations where code=p_code for update;
 if not found then raise exception 'Convite não encontrado'; end if;
 select * into e from public.estabelecimento where id=inv.estabelecimento_id for update;
 if e.user_id is distinct from auth.uid() then raise exception 'Somente o proprietário pode aceitar' using errcode='42501'; end if;
 if inv.status='active' then return jsonb_build_object('status','active','granted_until',inv.granted_until); end if;
 if inv.status<>'pending' or inv.redeem_by<now() then raise exception 'Convite inválido ou expirado'; end if;
 if not e.active or e.stripe_subscription_id is not null or e.stripe_subscription_status in ('active','trialing','past_due') then
   raise exception 'Conta com assinatura existente ou bloqueada: entre em contato com suporte';
 end if;
 deadline := now() + interval '365 days';
 update private.founder_invitations
 set status='active',accepted_at=now(),granted_until=deadline,terms_version='founders-2026-10-v1'
 where id=inv.id;
 -- Works with current entitlement functions (which examine trial_ends_at).
 -- Do not write Stripe subscription columns or create an automatic renewal.
 update public.estabelecimento
 set trial_ends_at=greatest(coalesce(trial_ends_at,now()),deadline),
     plano='completo'
 where id=e.id;
 return jsonb_build_object('status','active','granted_until',deadline);
end $$;

create or replace function public.partner_ensure_referral_link(p_estabelecimento_id uuid,p_accept_terms boolean)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare code_found uuid;
begin
 if auth.uid() is null or not exists(
  select 1 from public.estabelecimento e
  where e.id=p_estabelecimento_id and e.user_id=auth.uid() and e.active
 ) then raise exception 'Somente o proprietário do estabelecimento pode aderir' using errcode='42501'; end if;
 select code into code_found from private.referral_links where estabelecimento_id=p_estabelecimento_id;
 if code_found is null then
  if not p_accept_terms then raise exception 'É necessário aceitar os termos do Indica+'; end if;
  insert into private.referral_links(estabelecimento_id,terms_accepted_at)
  values(p_estabelecimento_id,now())
  on conflict(estabelecimento_id) do nothing;
  select code into code_found from private.referral_links where estabelecimento_id=p_estabelecimento_id;
 end if;
 return jsonb_build_object('code',code_found,'status','active');
end $$;

create or replace function public.partner_claim_referral(p_estabelecimento_id uuid,p_code uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare link private.referral_links%rowtype;
        e public.estabelecimento%rowtype;
        attributed_id uuid;
        reward integer;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
 select * into e from public.estabelecimento where id=p_estabelecimento_id for update;
 if not found or e.user_id is distinct from auth.uid() or not e.active then raise exception 'Conta não autorizada' using errcode='42501'; end if;
 if e.created_at < now()-interval '14 days' then raise exception 'Indicação deve ser registrada nos primeiros 14 dias'; end if;
 if e.stripe_subscription_id is not null then raise exception 'Indicação deve anteceder a contratação'; end if;
 select * into link from private.referral_links where code=p_code and active;
 if not found then raise exception 'Código de indicação inválido'; end if;
 if link.estabelecimento_id=e.id then raise exception 'Autoindicação não permitida'; end if;
 if exists(select 1 from private.referral_attributions where referred_estabelecimento_id=e.id) then
   raise exception 'Este estabelecimento já tem uma indicação';
 end if;
 select reward_cents into reward from private.partner_program_settings where singleton;
 insert into private.referral_attributions(referral_link_id,referrer_estabelecimento_id,referred_estabelecimento_id,reward_cents)
 values(link.id,link.estabelecimento_id,e.id,reward) returning id into attributed_id;
 return jsonb_build_object('id',attributed_id,'status','awaiting_payment');
end $$;

create or replace function public.partner_get_overview(p_estabelecimento_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare link private.referral_links%rowtype;
        inv private.founder_invitations%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.estabelecimento e
 where e.id=p_estabelecimento_id and e.user_id=auth.uid()) then
 raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into link from private.referral_links where estabelecimento_id=p_estabelecimento_id;
 select * into inv from private.founder_invitations where estabelecimento_id=p_estabelecimento_id;
 return jsonb_build_object(
  'referral_code',link.code,
  'founder_status',inv.status,
  'founder_until',inv.granted_until,
  'total_indications',(select count(*) from private.referral_attributions where referrer_estabelecimento_id=p_estabelecimento_id),
  'pending_count',(select count(*) from private.referral_attributions where referrer_estabelecimento_id=p_estabelecimento_id and status in ('awaiting_payment','pending_review')),
  'eligible_balance_cents',(select coalesce(sum(reward_cents),0) from private.referral_attributions where referrer_estabelecimento_id=p_estabelecimento_id and status in ('approved','paid')),
  'referrals',(select coalesce(jsonb_agg(jsonb_build_object(
   'date',a.captured_at,'status',a.status,'reward_cents',a.reward_cents,'paid_at',a.paid_at,
   'review_after',a.review_after) order by a.captured_at desc),'[]'::jsonb)
   from private.referral_attributions a where a.referrer_estabelecimento_id=p_estabelecimento_id)
 );
end $$;

create or replace function public.partner_owner_program_overview()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare s private.partner_program_settings%rowtype;
begin
 if not private.is_platform_owner() then raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into s from private.partner_program_settings where singleton;
 return jsonb_build_object(
 'pilot_capacity',s.founder_pilot_capacity,'absolute_capacity',s.founder_absolute_capacity,
 'reward_cents',s.reward_cents,
 'founders',(select coalesce(jsonb_agg(jsonb_build_object(
    'estabelecimento_id',f.estabelecimento_id,
    'nome',e.nome,'status',f.status,'code',f.code,'redeem_by',f.redeem_by,
    'granted_until',f.granted_until) order by f.created_at desc),'[]'::jsonb)
    from private.founder_invitations f join public.estabelecimento e on e.id=f.estabelecimento_id),
 'commissions',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'referrer',r.nome,'referred',d.nome,'status',a.status,
    'reward_cents',a.reward_cents,'first_paid_at',a.first_paid_at,
    'review_after',a.review_after,'payout_reference',a.payout_reference
  ) order by a.captured_at desc),'[]'::jsonb)
  from private.referral_attributions a join public.estabelecimento r on r.id=a.referrer_estabelecimento_id
  join public.estabelecimento d on d.id=a.referred_estabelecimento_id)
 );
end $$;

-- Callable ONLY with the service-role token; the Stripe webhook must validate
-- signatures and confirm this is the customer's first REAL paid subscription invoice.
create or replace function public.partner_record_first_paid_invoice(
 p_event_id text,p_invoice_id text,p_referred_id uuid,p_amount_cents integer,p_currency text,p_livemode boolean
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare min_amount int; days int; changed int;
begin
 if current_user<>'service_role' then raise exception 'Service role only' using errcode='42501'; end if;
 if not p_livemode or lower(p_currency)<>'brl' or p_invoice_id is null or p_event_id is null then return false; end if;
 select qualifying_first_payment_cents,refund_review_days into min_amount,days
 from private.partner_program_settings where singleton;
 if p_amount_cents<min_amount then return false; end if;
 insert into private.referral_invoice_events(stripe_event_id,stripe_invoice_id,referred_estabelecimento_id,amount_paid_cents)
 values(p_event_id,p_invoice_id,p_referred_id,p_amount_cents) on conflict do nothing;
 if not found then return false; end if;
 update private.referral_attributions set
  status='pending_review',qualifying_invoice_id=p_invoice_id,first_paid_at=now(),
  review_after=now()+make_interval(days=>days)
 where referred_estabelecimento_id=p_referred_id and status='awaiting_payment';
 get diagnostics changed=row_count;
 return changed=1;
end $$;

create or replace function public.partner_owner_approve_commission(p_attribution_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare changed int;
begin
 if not private.is_platform_owner() then raise exception 'Sem permissão' using errcode='42501'; end if;
 update private.referral_attributions set status='approved',approved_at=now()
 where id=p_attribution_id and status='pending_review' and review_after<=now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;

create or replace function public.partner_owner_record_payout(p_attribution_id uuid,p_pix_receipt text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare changed int;
begin
 if not private.is_platform_owner() then raise exception 'Sem permissão' using errcode='42501'; end if;
 if length(trim(coalesce(p_pix_receipt,'')))<6 then raise exception 'Identificador do comprovante exigido'; end if;
 update private.referral_attributions set status='paid',paid_at=now(),payout_reference=trim(p_pix_receipt)
 where id=p_attribution_id and status='approved' and review_after<=now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;

-- New public RPCs are explicitly restricted (not anonymously executable).
revoke all on function public.partner_owner_issue_founder_invite(uuid) from public,anon;
revoke all on function public.partner_accept_founder_invite(uuid,boolean) from public,anon;
revoke all on function public.partner_ensure_referral_link(uuid,boolean) from public,anon;
revoke all on function public.partner_claim_referral(uuid,uuid) from public,anon;
revoke all on function public.partner_get_overview(uuid) from public,anon;
revoke all on function public.partner_owner_program_overview() from public,anon;
revoke all on function public.partner_owner_approve_commission(uuid) from public,anon;
revoke all on function public.partner_owner_record_payout(uuid,text) from public,anon;
revoke all on function public.partner_record_first_paid_invoice(text,text,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.partner_owner_issue_founder_invite(uuid) to authenticated;
grant execute on function public.partner_accept_founder_invite(uuid,boolean) to authenticated;
grant execute on function public.partner_ensure_referral_link(uuid,boolean) to authenticated;
grant execute on function public.partner_claim_referral(uuid,uuid) to authenticated;
grant execute on function public.partner_get_overview(uuid) to authenticated;
grant execute on function public.partner_owner_program_overview() to authenticated;
grant execute on function public.partner_owner_approve_commission(uuid) to authenticated;
grant execute on function public.partner_owner_record_payout(uuid,text) to authenticated;
grant execute on function public.partner_record_first_paid_invoice(text,text,uuid,integer,text,boolean) to service_role;
