-- AgendaAI Growth: tenant-isolated marketing attribution. No automated outbound messages.
create table if not exists public.growth_social_campaigns(
 id uuid primary key default gen_random_uuid(),
 estabelecimento_id uuid not null references public.estabelecimento(id) on delete cascade,
 servico_id uuid not null references public.servicos(id),
 profissional_id uuid not null references public.profissionais(id),
 slot_start timestamptz not null,
 title text not null check(length(title) between 3 and 120),
 caption text not null check(length(caption) between 10 and 2500),
 tracking_code uuid not null unique default gen_random_uuid(),
 status text not null default 'draft' check(status in ('draft','ready','published','paused')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists growth_social_campaign_tenant_idx
 on public.growth_social_campaigns(estabelecimento_id,created_at desc);
create index if not exists growth_social_campaign_active_idx
 on public.growth_social_campaigns(estabelecimento_id,slot_start)
 where status in ('ready','published');
create table if not exists public.growth_social_visits(
 campaign_id uuid not null references public.growth_social_campaigns(id) on delete cascade,
 visit_day date not null,
 clicks integer not null default 0 check (clicks >= 0 and clicks <= 10000),
 primary key(campaign_id,visit_day)
);
create table if not exists public.growth_social_bookings(
 event_id uuid primary key references public.agenda_events(id) on delete cascade,
 campaign_id uuid not null references public.growth_social_campaigns(id) on delete cascade,
 estabelecimento_id uuid not null references public.estabelecimento(id) on delete cascade,
 recorded_at timestamptz not null default now()
);
create index if not exists growth_social_bookings_campaign_idx
 on public.growth_social_bookings(campaign_id,recorded_at desc);
alter table public.growth_social_campaigns enable row level security;
alter table public.growth_social_visits enable row level security;
alter table public.growth_social_bookings enable row level security;
revoke all on public.growth_social_campaigns,public.growth_social_visits,public.growth_social_bookings from public,anon,authenticated;
grant select,insert,update on public.growth_social_campaigns to authenticated;
grant select on public.growth_social_visits,public.growth_social_bookings to authenticated;
grant select,insert,update,delete on public.growth_social_campaigns,public.growth_social_visits,public.growth_social_bookings to service_role;
create policy growth_campaign_owner_select on public.growth_social_campaigns for select to authenticated
 using (public.business_owner(estabelecimento_id));
create policy growth_campaign_owner_insert on public.growth_social_campaigns for insert to authenticated
 with check (public.business_owner(estabelecimento_id) and created_by=(select auth.uid())
  and exists(select 1 from public.servicos s where s.id=servico_id and s.estabelecimento_id=estabelecimento_id and s.ativo)
  and exists(select 1 from public.profissionais p where p.id=profissional_id and p.estabelecimento_id=estabelecimento_id and p.ativo));
create policy growth_campaign_owner_update on public.growth_social_campaigns for update to authenticated
 using(public.business_owner(estabelecimento_id))
 with check (public.business_owner(estabelecimento_id) and created_by=(select auth.uid())
  and exists(select 1 from public.servicos s where s.id=servico_id and s.estabelecimento_id=estabelecimento_id and s.ativo)
  and exists(select 1 from public.profissionais p where p.id=profissional_id and p.estabelecimento_id=estabelecimento_id and p.ativo));
create policy growth_visit_owner_read on public.growth_social_visits for select to authenticated
 using(exists(select 1 from public.growth_social_campaigns c
 where c.id=campaign_id and public.business_owner(c.estabelecimento_id)));
create policy growth_booking_owner_read on public.growth_social_bookings for select to authenticated
 using(public.business_owner(estabelecimento_id));

-- A strictly bounded, read-only availability suggestion. Booking server retains final authority.
create or replace function public.growth_open_slots(p_tenant uuid,p_day date,p_service uuid,p_professional uuid)
returns table(slot_start timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare duration_minutes int;
begin
 if auth.uid() is null or not public.business_owner(p_tenant) then
  raise exception 'Somente o proprietário pode ver oportunidades' using errcode='42501';
 end if;
 if p_day < (now() at time zone 'America/Sao_Paulo')::date
  or p_day > (now() at time zone 'America/Sao_Paulo')::date + 14 then
  raise exception 'Escolha um dia dos próximos 14 dias';
 end if;
 select greatest(15,least(s.duracao_min,240)) into duration_minutes
 from public.servicos s where s.id=p_service and s.estabelecimento_id=p_tenant and s.ativo;
 if duration_minutes is null or not exists(
   select 1 from public.profissionais p where p.id=p_professional and p.estabelecimento_id=p_tenant and p.ativo
 ) then raise exception 'Serviço ou profissional não disponível'; end if;
 return query
 select ((p_day + h.abre + (g.tick * interval '30 minutes')) at time zone 'America/Sao_Paulo') as slot_start
 from public.horarios_funcionamento h
 cross join lateral generate_series(0,47) as g(tick)
 where h.estabelecimento_id=p_tenant and h.ativo and h.dia_semana=extract(dow from p_day)::int
 and (p_day + h.abre + (g.tick * interval '30 minutes') + make_interval(mins=>duration_minutes)) <= (p_day + h.fecha)
 and ((p_day + h.abre + (g.tick * interval '30 minutes')) at time zone 'America/Sao_Paulo') > now()+interval '1 hour'
 and not exists(
  select 1 from public.agenda_events a
  where a.estabelecimento_id=p_tenant
   and (a.profissional_id=p_professional or a.profissional_id is null)
   and a.status not in ('cancelado','noshow')
   and a.start < ((p_day + h.abre + (g.tick * interval '30 minutes')) at time zone 'America/Sao_Paulo')+make_interval(mins=>duration_minutes)
   and a."end" > ((p_day + h.abre + (g.tick * interval '30 minutes')) at time zone 'America/Sao_Paulo')
 ) order by 1 limit 40;
end $$;
revoke all on function public.growth_open_slots(uuid,date,uuid,uuid) from public,anon;
grant execute on function public.growth_open_slots(uuid,date,uuid,uuid) to authenticated;

-- Contact counts only; private names, phones and addresses never enter the Growth dashboard.
create or replace function public.growth_retention_counts(p_tenant uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare output jsonb;
begin
 if auth.uid() is null or not public.business_owner(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 select jsonb_build_object(
  'inactive30',count(*) filter(where c.ultima_visita < current_date-30),
  'inactive60',count(*) filter(where c.ultima_visita < current_date-60),
  'email_opt_in30',count(*) filter(where c.ultima_visita < current_date-30 and coalesce(pref.consent,false)),
  'total_clients',count(*)
 ) into output from public.clientes c
 left join public.client_contact_preferences pref on pref.estabelecimento_id=p_tenant
 and pref.cliente_id=c.id and pref.channel='email'
 where c.estabelecimento_id=p_tenant;
 return output;
end $$;
revoke all on function public.growth_retention_counts(uuid) from public,anon;
grant execute on function public.growth_retention_counts(uuid) to authenticated;

-- This public endpoint only increments capped aggregate counters. No visitor PII is stored.
create or replace function public.growth_record_visit(p_tenant uuid,p_code uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_campaign uuid;
begin
 select c.id into v_campaign from public.growth_social_campaigns c
 where c.tracking_code=p_code and c.estabelecimento_id=p_tenant
 and c.status in ('ready','published')
 and c.slot_start>now()-interval '48 hours';
 if v_campaign is null then return false; end if;
 insert into public.growth_social_visits(campaign_id,visit_day,clicks)
 values(v_campaign,current_date,1)
 on conflict(campaign_id,visit_day) do update
 set clicks=least(10000,public.growth_social_visits.clicks+1);
 return true;
end $$;
revoke all on function public.growth_record_visit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.growth_record_visit(uuid,uuid) to anon,authenticated;

-- Called exclusively by the verified public-booking server after a real event exists.
create or replace function public.growth_attribute_booking(p_tenant uuid,p_code uuid,p_event uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_campaign uuid;
begin
 select c.id into v_campaign from public.growth_social_campaigns c
 join public.agenda_events e on e.id=p_event and e.estabelecimento_id=p_tenant
 where c.tracking_code=p_code and c.estabelecimento_id=p_tenant
 and c.status in ('ready','published') and c.slot_start > now()-interval '48 hours'
 and e.created_at >= now()-interval '10 minutes'
 and e.servico_id=c.servico_id and e.profissional_id=c.profissional_id;
 if v_campaign is null then return false; end if;
 insert into public.growth_social_bookings(event_id,campaign_id,estabelecimento_id)
 values(p_event,v_campaign,p_tenant) on conflict (event_id) do nothing;
 return true;
end $$;
revoke all on function public.growth_attribute_booking(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.growth_attribute_booking(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
