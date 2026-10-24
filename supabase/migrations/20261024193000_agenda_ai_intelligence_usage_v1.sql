
-- Usage ledger: isolated from clients; only the trusted server-side service role may read/write.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.estabelecimento(id) on delete cascade,
  request_id uuid not null unique,
  feature text not null check (feature in ('narrative','campaign_draft')),
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_tenant_month_idx on public.ai_usage_events (tenant_id, feature, created_at desc);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from public, anon, authenticated;
grant select, insert, update on public.ai_usage_events to service_role;

-- Atomic quota reservation under a per-tenant-and-feature advisory lock, service-role only.
create or replace function public.ai_reserve_usage(p_tenant uuid, p_request uuid, p_feature text, p_limit integer)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare v_used integer;
begin
  if p_tenant is null or p_request is null or p_feature not in ('narrative','campaign_draft')
      or p_limit < 1 or p_limit > 200 then
    raise exception 'Reserva inválida' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agendaai-intelligence:' || p_tenant::text || ':' || p_feature, 0)
  );
  if exists(select 1 from public.ai_usage_events where request_id = p_request) then
    return false;
  end if;
  select count(*) into v_used from public.ai_usage_events
   where tenant_id = p_tenant and feature = p_feature and status in ('reserved','completed')
     and created_at >= pg_catalog.date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  if v_used >= p_limit then return false; end if;
  insert into public.ai_usage_events (tenant_id, request_id, feature)
   values (p_tenant, p_request, p_feature);
  return true;
end $$;
revoke all on function public.ai_reserve_usage(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.ai_reserve_usage(uuid,uuid,text,integer) to service_role;
