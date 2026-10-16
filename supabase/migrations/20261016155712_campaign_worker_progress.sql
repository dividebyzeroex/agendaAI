-- Add lifecycle states without rewriting existing campaigns or sending any messages.
alter table public.client_campaigns drop constraint client_campaigns_status_check;
alter table public.client_campaigns add constraint client_campaigns_status_check
  check(status in ('draft','ready','scheduled','paused','completed','cancelled'));
create index client_campaigns_due_email on public.client_campaigns(due_at,id)
  where status='scheduled' and channel='email';
create index campaign_recipients_pending on public.campaign_recipients(campaign_id,id)
  where status='pending';

-- Counts cover the full selected campaigns, independent of the UI's recent-row limit.
-- SECURITY INVOKER retains the existing owner-only RLS policies.
create function public.campaign_progress(p_tenant uuid,p_campaigns uuid[])
returns table(campaign_id uuid,total bigint,pending bigint,sending bigint,sent bigint,failed bigint,suppressed bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.business_owner(p_tenant) then
    raise exception 'Ação exclusiva do dono' using errcode='42501';
  end if;
  if coalesce(cardinality(p_campaigns),0)>500 then
    raise exception 'Selecione até 500 campanhas';
  end if;
  return query
  select c.id,count(r.id),
    count(r.id) filter(where r.status='pending'),
    count(r.id) filter(where r.status='sending'),
    count(r.id) filter(where r.status='sent'),
    count(r.id) filter(where r.status='failed'),
    count(r.id) filter(where r.status='suppressed')
  from public.client_campaigns c
  left join public.campaign_recipients r on r.campaign_id=c.id and r.estabelecimento_id=p_tenant
  where c.estabelecimento_id=p_tenant and c.id=any(p_campaigns)
  group by c.id;
end $$;
revoke all on function public.campaign_progress(uuid,uuid[]) from public,anon;
grant execute on function public.campaign_progress(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
