-- Licenças Hotmart independentes das assinaturas Stripe.
create table if not exists public.hotmart_licenses (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  product_id text not null,
  buyer_email text not null,
  buyer_name text,
  purchase_at timestamptz not null default now(),
  status text not null check (status in ('approved','revoked')),
  event_id text,
  estabelecimento_id uuid references public.estabelecimento(id),
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hotmart_licenses_email_idx on public.hotmart_licenses (lower(buyer_email));
create index if not exists hotmart_licenses_estab_idx on public.hotmart_licenses(estabelecimento_id);
alter table public.hotmart_licenses enable row level security;
revoke all on public.hotmart_licenses from anon, authenticated;
-- Internal atomic redemption; callable only with service_role.
create or replace function public.redeem_hotmart_license(p_transaction text, p_email text, p_estabelecimento uuid)
returns table(expires_at timestamptz, redeemed boolean)
language plpgsql security definer set search_path = public
as $$
declare v_license public.hotmart_licenses%rowtype;
declare v_expires timestamptz;
begin
  select * into v_license from public.hotmart_licenses
    where transaction_id=p_transaction and lower(buyer_email)=lower(p_email)
    for update;
  if not found or v_license.status <> 'approved' then
    raise exception 'Licença indisponível';
  end if;
  if v_license.estabelecimento_id is not null and v_license.estabelecimento_id <> p_estabelecimento then
    raise exception 'Licença vinculada a outro estabelecimento';
  end if;
  if v_license.activated_at is null then
    v_expires := now() + interval '12 months';
    update public.hotmart_licenses set estabelecimento_id=p_estabelecimento, activated_at=now(), expires_at=v_expires,updated_at=now()
      where id=v_license.id;
  else
    v_expires := v_license.expires_at;
  end if;
  -- Never shorten a valid paid Stripe or other license period.
  update public.estabelecimento set plano_expires_at=greatest(coalesce(plano_expires_at,'-infinity'::timestamptz),v_expires),
     active=true where id=p_estabelecimento;
  return query select v_expires, v_license.activated_at is null;
end $$;
revoke all on function public.redeem_hotmart_license(text,text,uuid) from public,anon,authenticated;
grant execute on function public.redeem_hotmart_license(text,text,uuid) to service_role;
