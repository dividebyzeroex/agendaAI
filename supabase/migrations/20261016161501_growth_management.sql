-- Owner-only management operations, optional retention and explicitly linked units.
alter table public.financial_titles add column dre_section text
 check(dre_section in ('other_income','taxes','direct_cost','operating_expense','financial_income','financial_expense','non_operating_income','non_operating_expense'));
alter table public.financial_titles add column exclude_from_dre boolean not null default false;
alter table public.caixa_produtos add column unit_cost_snapshot numeric check(unit_cost_snapshot>=0);
alter table public.produtos add column cost_verified boolean not null default false;
update public.produtos set cost_verified=true where unit_cost>0;
create function private.verify_product_cost() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.cost_verified:=(tg_op='UPDATE' or new.unit_cost>0); return new; end $$;
revoke all on function private.verify_product_cost() from public,anon,authenticated;
create trigger product_cost_verification before insert or update of unit_cost on public.produtos for each row execute function private.verify_product_cost();
create function private.capture_product_cost() returns trigger language plpgsql security definer set search_path='' as $$
begin select case when cost_verified then unit_cost else null end into new.unit_cost_snapshot from public.produtos where id=new.produto_id; return new; end $$;
revoke all on function private.capture_product_cost() from public,anon,authenticated;
create trigger sale_product_cost before insert on public.caixa_produtos for each row execute function private.capture_product_cost();
create table public.connect_refunds(id text primary key,estabelecimento_id uuid not null references public.estabelecimento(id),order_id uuid not null references public.connect_orders(id),amount_cents bigint not null check(amount_cents>0),paid_at timestamptz not null);
create index connect_refunds_tenant_date on public.connect_refunds(estabelecimento_id,paid_at);
alter table public.connect_orders add column refund_pending_cents bigint not null default 0 check(refund_pending_cents>=0);
alter table public.connect_orders add column fee_refunds_checked boolean not null default true;
update public.connect_orders set fee_refunds_checked=false where refunded_cents>0;
create table public.connect_fee_refunds(id text primary key,estabelecimento_id uuid not null references public.estabelecimento(id),order_id uuid not null references public.connect_orders(id),amount_cents bigint not null check(amount_cents>0),paid_at timestamptz not null);
create index connect_fee_refunds_tenant_date on public.connect_fee_refunds(estabelecimento_id,paid_at);
create table public.retention_rules(
 id uuid primary key default gen_random_uuid(),estabelecimento_id uuid not null references public.estabelecimento(id),
 kind text not null check(kind in ('return','renewal','inactive')),days integer not null check(days between 1 and 365),
 title text not null check(length(title) between 2 and 120),message text not null check(length(message) between 5 and 2000),
 enabled boolean not null default false,last_scanned_at timestamptz,created_at timestamptz not null default now(),unique(estabelecimento_id,kind)
);
create index retention_enabled on public.retention_rules(last_scanned_at nulls first,id) where enabled;
alter table public.client_campaigns add column retention_rule_id uuid references public.retention_rules(id);
create table public.retention_enrollments(
 id uuid primary key default gen_random_uuid(),estabelecimento_id uuid not null references public.estabelecimento(id),rule_id uuid not null references public.retention_rules(id),
 cliente_id uuid not null references public.clientes(id),source_id uuid not null,recipient_id uuid not null unique references public.campaign_recipients(id),
 created_at timestamptz not null default now(),unique(rule_id,cliente_id,source_id)
);
create index retention_customer_cadence on public.retention_enrollments(estabelecimento_id,cliente_id,created_at desc);
create table public.business_networks(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),name text not null check(length(name) between 2 and 120),created_at timestamptz not null default now());
create index network_owner on public.business_networks(owner_id);
create table public.network_units(network_id uuid not null references public.business_networks(id),estabelecimento_id uuid not null unique references public.estabelecimento(id),created_at timestamptz not null default now(),primary key(network_id,estabelecimento_id));
create table public.stock_transfers(
 id uuid primary key default gen_random_uuid(),network_id uuid not null references public.business_networks(id),
 source_unit uuid not null references public.estabelecimento(id),target_unit uuid not null references public.estabelecimento(id),
 source_product uuid not null references public.produtos(id),target_product uuid not null references public.produtos(id),
 quantity integer not null check(quantity between 1 and 100000),unit_cost numeric not null check(unit_cost>=0),
 status text not null default 'in_transit' check(status in ('in_transit','received','cancelled')),
 request_key uuid not null,created_by uuid not null references auth.users(id),received_by uuid references auth.users(id),received_at timestamptz,cancelled_at timestamptz,created_at timestamptz not null default now(),
 unique(network_id,request_key),check(source_unit<>target_unit),check(source_product<>target_product)
);
create index stock_transfers_network on public.stock_transfers(network_id,created_at desc);
alter table public.inventory_movements add column transfer_id uuid references public.stock_transfers(id);
alter table public.inventory_movements add column cost_known boolean not null default false;
create function private.capture_movement_cost() returns trigger language plpgsql security definer set search_path='' as $$
begin select cost_verified into new.cost_known from public.produtos where id=new.produto_id; return new; end $$;
revoke all on function private.capture_movement_cost() from public,anon,authenticated;
create trigger movement_cost_verification before insert on public.inventory_movements for each row execute function private.capture_movement_cost();
alter table public.comissoes add column cancelled_at timestamptz;
create function private.capture_commission_reversal() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.status='cancelado' and old.status<>'cancelado' then new.cancelled_at:=now(); end if; return new; end $$;
revoke all on function private.capture_commission_reversal() from public,anon,authenticated;
create trigger commission_reversal_date before update of status on public.comissoes for each row execute function private.capture_commission_reversal();
create table public.network_audit(id uuid primary key default gen_random_uuid(),network_id uuid not null references public.business_networks(id),actor_id uuid not null references auth.users(id),action text not null,details jsonb not null,created_at timestamptz not null default now());
create index network_audit_recent on public.network_audit(network_id,created_at desc);
create function public.owns_network(p_network uuid) returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.business_networks where id=p_network and owner_id=auth.uid())$$;
revoke all on function public.owns_network(uuid) from public,anon;
grant execute on function public.owns_network(uuid) to authenticated;
alter table public.business_networks enable row level security;
revoke all on public.business_networks from anon,authenticated;
grant select on public.business_networks to authenticated;
grant all on public.business_networks to service_role;
create policy network_owner_read on public.business_networks for select to authenticated using(owner_id=(select auth.uid()));
do $$ declare n text; begin
 foreach n in array array['connect_refunds','connect_fee_refunds','retention_rules','retention_enrollments','network_units','stock_transfers','network_audit'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from anon,authenticated',n);
  execute format('grant select on public.%I to authenticated',n);
  execute format('grant all on public.%I to service_role',n);
  if n in ('network_units','stock_transfers','network_audit') then
   execute format('create policy network_read on public.%I for select to authenticated using(public.owns_network(network_id))',n);
  else execute format('create policy owner_read on public.%I for select to authenticated using(public.business_owner(estabelecimento_id))',n);
  end if;
 end loop;
end $$;

create function private.growth_operation(t uuid,action text,d jsonb,k uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; network public.business_networks; transfer public.stock_transfers; source public.produtos; target public.produtos; bundle public.service_bundles; club public.club_contracts; n uuid; role_name text; rowitem record;
begin
 if auth.uid() is null or k is null or not public.business_owner(t) then raise exception 'Ação exclusiva do dono com acesso ativo' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('growth:'||t::text,0));
 if action='deposit-settings' then
  if coalesce((d->>'percent')::int,0)>0 and not exists(select 1 from public.connect_accounts where estabelecimento_id=t and enabled and charges_enabled and payouts_enabled and fee_cents=100) then raise exception 'Vincule e ative o Stripe Connect em Recebimentos'; end if;
  insert into public.business_settings(estabelecimento_id,deposit_percent) values(t,(d->>'percent')::int) on conflict(estabelecimento_id) do update set deposit_percent=excluded.deposit_percent,updated_at=now() returning to_jsonb(business_settings.*) into result;
 elsif action='club-create' then
  select * into club from public.club_contracts where estabelecimento_id=t and request_key=k;
  if found then return to_jsonb(club)-'customer_id'-'payment_method_id'; end if;
  select * into bundle from public.service_bundles where id=(d->>'bundle_id')::uuid and estabelecimento_id=t and active and kind='membership';
  if not found or bundle.price<2 then raise exception 'Escolha uma oferta de clube ativa, de pelo menos R$ 2'; end if;
  if not exists(select 1 from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t) then raise exception 'Cliente indisponível'; end if;
  select account_id::text into role_name from public.connect_accounts where estabelecimento_id=t and enabled and charges_enabled and payouts_enabled and fee_cents=100;
  if role_name is null then raise exception 'Ative os recebimentos online'; end if;
  insert into public.club_contracts(estabelecimento_id,cliente_id,bundle_id,servico_id,title,price,sessions,account_id,request_key)
  values(t,(d->>'cliente_id')::uuid,bundle.id,bundle.servico_id,bundle.title,round(bundle.price,2),bundle.sessions,role_name,k) returning to_jsonb(club_contracts.*)-'customer_id'-'payment_method_id' into result;
 elsif action='club-cancel' then
  update public.club_contracts set renew_enabled=false,cancelled_at=now(),status='cancelled' where estabelecimento_id=t and id=(d->>'id')::uuid returning to_jsonb(club_contracts.*)-'customer_id'-'payment_method_id' into result;
 elsif action='title-classify' then
  if (d->>'section' in ('other_income','financial_income','non_operating_income')) is distinct from (select kind='receivable' from public.financial_titles where estabelecimento_id=t and id=(d->>'id')::uuid) then raise exception 'Classificação incompatível com o título'; end if;
  update public.financial_titles set dre_section=d->>'section',exclude_from_dre=coalesce((d->>'exclude')::boolean,false) where estabelecimento_id=t and id=(d->>'id')::uuid returning to_jsonb(financial_titles.*) into result;
 elsif action='retention-save' then
  insert into public.retention_rules(estabelecimento_id,kind,days,title,message,enabled) values(t,d->>'kind',(d->>'days')::integer,trim(d->>'title'),trim(d->>'message'),coalesce((d->>'enabled')::boolean,false))
  on conflict(estabelecimento_id,kind) do update set days=excluded.days,title=excluded.title,message=excluded.message,enabled=excluded.enabled returning to_jsonb(retention_rules.*) into result;
  if not (result->>'enabled')::boolean then
   update public.client_campaigns set status='cancelled' where retention_rule_id=(result->>'id')::uuid and status in ('ready','scheduled','paused');
   update public.campaign_recipients set status='suppressed' where estabelecimento_id=t and status='pending' and campaign_id in (select id from public.client_campaigns where retention_rule_id=(result->>'id')::uuid);
  end if;
 elsif action='network-create' then
  select * into network from public.business_networks where owner_id=auth.uid() and id in(select network_id from public.network_units where estabelecimento_id=t);
  if found then return to_jsonb(network); end if;
  insert into public.business_networks(owner_id,name) values(auth.uid(),trim(d->>'name')) returning * into network;
  insert into public.network_units(network_id,estabelecimento_id) values(network.id,t);
  result:=to_jsonb(network);
 elsif action='network-unit-create' then
  n:=(d->>'network_id')::uuid;
  if not public.owns_network(n) or length(trim(d->>'name')) not between 2 and 120 then raise exception 'Confira a rede e o nome da unidade'; end if;
  perform pg_advisory_xact_lock(hashtextextended('network:'||n::text,0));
  select jsonb_build_object('id',e.id) into result from public.estabelecimento e where e.user_id=auth.uid() and e.metadata->>'network_creation_key'=k::text;
  if result is not null then return result; end if;
  insert into public.estabelecimento(user_id,nome,slug,segmento,cidade,metadata)
  values(auth.uid(),trim(d->>'name'),'unidade-'||replace(gen_random_uuid()::text,'-',''),coalesce(nullif(d->>'segment',''),'barbearia'),left(d->>'city',120),jsonb_build_object('network_creation_key',k::text)) returning jsonb_build_object('id',id) into result;
  insert into public.network_units(network_id,estabelecimento_id) values(n,(result->>'id')::uuid);
  insert into public.network_audit(network_id,actor_id,action,details) values(n,auth.uid(),action,result);
 elsif action='network-link' then
  n:=(d->>'network_id')::uuid;
  if not exists(select 1 from public.business_networks where id=n and owner_id=auth.uid()) or not public.business_owner((d->>'unit_id')::uuid) then raise exception 'Vincule somente unidades próprias com acesso ativo'; end if;
  insert into public.network_units(network_id,estabelecimento_id) values(n,(d->>'unit_id')::uuid) on conflict(estabelecimento_id) do nothing;
  if not exists(select 1 from public.network_units where network_id=n and estabelecimento_id=(d->>'unit_id')::uuid) then raise exception 'A unidade já está em outra rede'; end if;
  insert into public.network_audit(network_id,actor_id,action,details) values(n,auth.uid(),action,d);
  result:=jsonb_build_object('network_id',n);
 elsif action='unit-role' then
  n:=(d->>'network_id')::uuid;
  if not public.owns_network(n) or not exists(select 1 from public.network_units where network_id=n and estabelecimento_id=t) then raise exception 'Unidade fora da sua rede'; end if;
  role_name:=d->>'role';
  if role_name not in ('barbeiro','financeiro','recepcionista') then raise exception 'Escolha atendimento, financeiro ou recepção'; end if;
  update public.profissionais set role=(case when role_name='recepcionista' then 'secretaria' else role_name end)::public.user_role,ativo=(d->>'active')::boolean where id=(d->>'professional_id')::uuid and estabelecimento_id=t returning to_jsonb(profissionais.*) into result;
  insert into public.network_audit(network_id,actor_id,action,details) values(n,auth.uid(),action,d);
 elsif action='transfer-send' then
  n:=(d->>'network_id')::uuid;
  if not public.owns_network(n) then raise exception 'Rede indisponível'; end if;
  select * into transfer from public.stock_transfers where network_id=n and request_key=k;
  if found then return to_jsonb(transfer); end if;
  if not exists(select 1 from public.network_units where network_id=n and estabelecimento_id=t)
   or not exists(select 1 from public.network_units where network_id=n and estabelecimento_id=(d->>'target_unit')::uuid) or not public.business_owner((d->>'target_unit')::uuid) then raise exception 'Unidades fora da sua rede ou sem acesso ativo'; end if;
  -- Lock product rows in a stable order, including opposing transfers.
  perform 1 from public.produtos where id in ((d->>'source_product')::uuid,(d->>'target_product')::uuid) order by id for update;
  select * into source from public.produtos where id=(d->>'source_product')::uuid and estabelecimento_id=t and ativo;
  select * into target from public.produtos where id=(d->>'target_product')::uuid and estabelecimento_id=(d->>'target_unit')::uuid and ativo;
  if source.id is null or target.id is null or (d->>'quantity')::integer<1 or source.estoque<(d->>'quantity')::integer then raise exception 'Confira os produtos e o saldo de origem'; end if;
  if not source.cost_verified then raise exception 'Informe o custo do produto de origem em Estoque antes de transferir'; end if;
  insert into public.stock_transfers(network_id,source_unit,target_unit,source_product,target_product,quantity,unit_cost,request_key,created_by)
  values(n,t,target.estabelecimento_id,source.id,target.id,(d->>'quantity')::integer,source.unit_cost,k,auth.uid()) returning * into transfer;
  update public.produtos set estoque=estoque-transfer.quantity where id=source.id;
  insert into public.inventory_movements(estabelecimento_id,produto_id,quantity,unit_cost,reason,request_key,transfer_id) values(t,source.id,-transfer.quantity,source.unit_cost,'Transferência enviada',k,transfer.id);
  insert into public.network_audit(network_id,actor_id,action,details) values(n,auth.uid(),action,jsonb_build_object('transfer_id',transfer.id));
  result:=to_jsonb(transfer);
 elsif action in ('transfer-receive','transfer-cancel') then
  select st.* into transfer from public.stock_transfers st join public.business_networks bn on bn.id=st.network_id where st.id=(d->>'id')::uuid and bn.owner_id=auth.uid() for update of st;
  if not found or t not in (transfer.source_unit,transfer.target_unit) then raise exception 'Transferência indisponível'; end if;
  if not exists(select 1 from public.estabelecimento where id=transfer.source_unit and user_id=auth.uid()) or not exists(select 1 from public.estabelecimento where id=transfer.target_unit and user_id=auth.uid()) then raise exception 'A titularidade de uma unidade mudou. Confira a transferência'; end if;
  if (action='transfer-receive' and transfer.status='received') or (action='transfer-cancel' and transfer.status='cancelled') then return to_jsonb(transfer); end if;
  if transfer.status<>'in_transit' then raise exception 'Transferência já encerrada'; end if;
  if action='transfer-receive' then
   if not public.business_owner(transfer.target_unit) then raise exception 'Destino indisponível'; end if;
   select * into target from public.produtos where id=transfer.target_product for update;
   update public.produtos set unit_cost=round((estoque*unit_cost+transfer.quantity*transfer.unit_cost)/(estoque+transfer.quantity),4),estoque=estoque+transfer.quantity where id=target.id;
   insert into public.inventory_movements(estabelecimento_id,produto_id,quantity,unit_cost,reason,request_key,transfer_id) values(transfer.target_unit,target.id,transfer.quantity,transfer.unit_cost,'Transferência recebida',k,transfer.id);
   update public.stock_transfers set status='received',received_at=now(),received_by=auth.uid() where id=transfer.id returning to_jsonb(stock_transfers.*) into result;
  else
   update public.produtos set unit_cost=round((estoque*unit_cost+transfer.quantity*transfer.unit_cost)/(estoque+transfer.quantity),4),estoque=estoque+transfer.quantity where id=transfer.source_product;
   insert into public.inventory_movements(estabelecimento_id,produto_id,quantity,unit_cost,reason,request_key,transfer_id) values(transfer.source_unit,transfer.source_product,transfer.quantity,transfer.unit_cost,'Transferência cancelada',k,transfer.id);
   update public.stock_transfers set status='cancelled',cancelled_at=now() where id=transfer.id returning to_jsonb(stock_transfers.*) into result;
  end if;
  insert into public.network_audit(network_id,actor_id,action,details) values(transfer.network_id,auth.uid(),action,d);
 else raise exception 'Ação indisponível'; end if;
 if result is null then raise exception 'Registro indisponível'; end if;
 return result;
end $$;
revoke all on function private.growth_operation(uuid,text,jsonb,uuid) from public,anon;
grant execute on function private.growth_operation(uuid,text,jsonb,uuid) to authenticated;
create function public.growth_operation(p_tenant uuid,p_action text,p_data jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$select private.growth_operation(p_tenant,p_action,p_data,p_key)$$;
revoke all on function public.growth_operation(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.growth_operation(uuid,text,jsonb,uuid) to authenticated;

create function public.unit_access_role(p_tenant uuid) returns text language sql stable security invoker set search_path='' as $$
 select case when e.user_id=auth.uid() then 'dono' else (select case when p.role::text='secretaria' then 'recepcionista' else p.role::text end from public.profissionais p where p.estabelecimento_id=e.id and p.user_id=auth.uid() and p.ativo limit 1) end
 from public.estabelecimento e where e.id=p_tenant and (e.user_id=auth.uid() or (e.active and greatest(e.trial_ends_at,e.plano_expires_at)>now()));
$$;
revoke all on function public.unit_access_role(uuid) from public,anon;
grant execute on function public.unit_access_role(uuid) to authenticated;
create function public.list_accessible_units() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'segmento',e.segmento,'logo_url',e.logo_url,'onboarding_completo',e.onboarding_completo,'trial_ends_at',e.trial_ends_at,'plano_expires_at',e.plano_expires_at,'plano',e.plano,'role',public.unit_access_role(e.id)) order by e.nome),'[]')
 from public.estabelecimento e where (e.user_id=auth.uid() or e.id in(select public.get_meus_estabelecimentos())) and public.unit_access_role(e.id) is not null;
$$;
revoke all on function public.list_accessible_units() from public,anon;
grant execute on function public.list_accessible_units() to authenticated;
create function public.unit_context(p_tenant uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'segmento',e.segmento,'telefone',e.telefone,'cidade',e.cidade,'logo_url',e.logo_url,'cor_primaria',e.cor_primaria,'onboarding_completo',e.onboarding_completo,'trial_ends_at',e.trial_ends_at,'plano_expires_at',e.plano_expires_at,'plano',e.plano,'active',e.active,'cnpj',e.cnpj,'endereco',e.endereco,'endereco_completo',e.endereco_completo,'descricao',e.descricao,'config_fidelidade',e.config_fidelidade,'role',public.unit_access_role(e.id))
 from public.estabelecimento e where e.id=p_tenant and public.unit_access_role(e.id) is not null;
$$;
revoke all on function public.unit_context(uuid) from public,anon;
grant execute on function public.unit_context(uuid) to authenticated;

-- Eligibility is checked both when preparing and immediately before claiming an automatic message.
create function public.retention_recipient_eligible(p_recipient uuid) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare en public.retention_enrollments; rule public.retention_rules; last_event public.agenda_events; pass public.customer_passes;
begin
 select * into en from public.retention_enrollments where recipient_id=p_recipient;
 if not found then return true; end if;
 select * into rule from public.retention_rules where id=en.rule_id and enabled;
 if not found then return false; end if;
 if rule.kind='renewal' then
  select * into pass from public.customer_passes where id=en.source_id and estabelecimento_id=en.estabelecimento_id and cliente_id=en.cliente_id and status='active' and remaining>0 and expires_at>now() and expires_at<=now()+make_interval(days=>rule.days);
  return found and not exists(select 1 from public.club_cycles where pass_id=pass.id);
 end if;
 select * into last_event from public.agenda_events where estabelecimento_id=en.estabelecimento_id and cliente_id=en.cliente_id and status='concluido' order by start desc limit 1;
 return last_event.id=en.source_id and last_event.start<=now()-make_interval(days=>rule.days)
 and not exists(select 1 from public.agenda_events where estabelecimento_id=en.estabelecimento_id and cliente_id=en.cliente_id and status in ('pendente','confirmado','em_atendimento') and start>=now());
end $$;
revoke all on function public.retention_recipient_eligible(uuid) from public,anon,authenticated;
grant execute on function public.retention_recipient_eligible(uuid) to service_role;

create function public.prepare_retention_campaigns(p_limit integer default 10) returns integer language plpgsql security invoker set search_path='' as $$
declare rule public.retention_rules; candidate record; tenant public.estabelecimento; campaign uuid; recipient uuid; prepared integer:=0;
begin
 for rule in select r.* from public.retention_rules r where r.enabled and coalesce(r.last_scanned_at,'epoch')<now()-interval '20 hours' order by r.last_scanned_at nulls first,r.id limit least(greatest(p_limit,1),20) for update skip locked loop
  update public.retention_rules set last_scanned_at=now() where id=rule.id;
  select * into tenant from public.estabelecimento where id=rule.estabelecimento_id and active and greatest(trial_ends_at,plano_expires_at)>now();
  if not found then continue; end if;
  campaign:=null;
  for candidate in
   select c.id cliente_id,case when rule.kind='renewal' then p.id else a.id end source_id
   from public.clientes c join public.client_contact_preferences pref on pref.estabelecimento_id=c.estabelecimento_id and pref.cliente_id=c.id and pref.channel='email' and pref.consent
   left join lateral(select id,start from public.agenda_events where estabelecimento_id=c.estabelecimento_id and cliente_id=c.id and status='concluido' order by start desc limit 1)a on true
   left join lateral(select id from public.customer_passes where estabelecimento_id=c.estabelecimento_id and cliente_id=c.id and status='active' and remaining>0 and expires_at>now() and expires_at<=now()+make_interval(days=>rule.days) and not exists(select 1 from public.club_cycles where pass_id=customer_passes.id) order by expires_at limit 1)p on true
   where c.estabelecimento_id=rule.estabelecimento_id and c.email is not null
   and ((rule.kind='renewal' and p.id is not null) or (rule.kind in ('return','inactive') and a.start<=now()-make_interval(days=>rule.days) and not exists(select 1 from public.agenda_events where estabelecimento_id=c.estabelecimento_id and cliente_id=c.id and status in ('pendente','confirmado','em_atendimento') and start>=now())))
   and not exists(select 1 from public.retention_enrollments e where e.rule_id=rule.id and e.cliente_id=c.id and e.source_id=case when rule.kind='renewal' then p.id else a.id end)
   and not exists(select 1 from public.retention_enrollments e where e.estabelecimento_id=c.estabelecimento_id and e.cliente_id=c.id and e.created_at>now()-interval '7 days')
   order by c.id limit 100
  loop
   if campaign is null then
    insert into public.client_campaigns(estabelecimento_id,title,segment,channel,message,due_at,status,retention_rule_id)
    values(rule.estabelecimento_id,rule.title,'all','email',rule.message,now(),'scheduled',rule.id) returning id into campaign;
    prepared:=prepared+1;
   end if;
   insert into public.campaign_recipients(estabelecimento_id,campaign_id,cliente_id) values(rule.estabelecimento_id,campaign,candidate.cliente_id) returning id into recipient;
   insert into public.retention_enrollments(estabelecimento_id,rule_id,cliente_id,source_id,recipient_id) values(rule.estabelecimento_id,rule.id,candidate.cliente_id,candidate.source_id,recipient);
  end loop;
 end loop;
 return prepared;
end $$;
revoke all on function public.prepare_retention_campaigns(integer) from public,anon,authenticated;
grant execute on function public.prepare_retention_campaigns(integer) to service_role;

create function public.retention_summary(p_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.business_owner(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x),'[]') from(select r.id,count(e.id) total,count(e.id) filter(where cr.status='sent') sent,count(e.id) filter(where cr.status='pending') pending,count(e.id) filter(where cr.status in ('sending','failed')) review from public.retention_rules r left join public.retention_enrollments e on e.rule_id=r.id left join public.campaign_recipients cr on cr.id=e.recipient_id where r.estabelecimento_id=p_tenant group by r.id)x);
end $$;
revoke all on function public.retention_summary(uuid) from public,anon;
grant execute on function public.retention_summary(uuid) to authenticated;

create function private.network_summary(p_network uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; since timestamptz:=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
 if not public.owns_network(p_network) then raise exception 'Acesso negado' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.nome,'clients',(select count(*) from public.clientes where estabelecimento_id=e.id),
 'received',coalesce((select sum(valor_total) from public.caixa_itens where estabelecimento_id=e.id and pago_em>=since),0)-coalesce((select sum(amount_cents)/100.0 from public.connect_refunds where estabelecimento_id=e.id and paid_at>=since),0)-coalesce((select sum(valor_total) from public.caixa_itens where estabelecimento_id=e.id and payment_provider is distinct from 'stripe_connect' and refunded_at>=since),0),
 'pending',coalesce((select sum(amount_cents)/100.0 from public.connect_orders where estabelecimento_id=e.id and status='pending'),0),
 'appointments',(select count(*) from public.agenda_events where estabelecimento_id=e.id and start>=since and status='concluido'),
 'clubs',(select count(*) from public.club_contracts where estabelecimento_id=e.id and status='active'),
 'active',e.active and greatest(e.trial_ends_at,e.plano_expires_at)>now()) order by e.nome),'[]') into result
 from public.network_units u join public.estabelecimento e on e.id=u.estabelecimento_id where u.network_id=p_network and e.user_id=auth.uid();
 return result;
end $$;
revoke all on function private.network_summary(uuid) from public,anon;
grant execute on function private.network_summary(uuid) to authenticated;
create function public.network_summary(p_network uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.network_summary(p_network)$$;
revoke all on function public.network_summary(uuid) from public,anon;
grant execute on function public.network_summary(uuid) to authenticated;

create function private.pass_value_at(p_pass uuid,p_at timestamptz) returns numeric language sql stable security invoker set search_path='' as $$
 select greatest(0,p.price-coalesce((select sum(f.amount_cents)/100.0 from public.connect_refunds f where f.order_id=p.receipt_id and f.paid_at<=p_at),0)-case when c.payment_provider is distinct from 'stripe_connect' and c.refunded_at<=p_at then p.price else 0 end)
 from public.customer_passes p join public.caixa_itens c on c.id=p.receipt_id where p.id=p_pass;
$$;
revoke all on function private.pass_value_at(uuid,timestamptz) from public,anon;
grant execute on function private.pass_value_at(uuid,timestamptz) to authenticated;
create function public.finance_report(p_tenant uuid,p_month date,p_opening numeric default 0) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date:=date_trunc('month',p_month)::date; next_month date:=(date_trunc('month',p_month)+interval '1 month')::date;
 since timestamptz:=first_day::timestamp at time zone 'America/Sao_Paulo'; until_at timestamptz:=next_month::timestamp at time zone 'America/Sao_Paulo';
 result jsonb; gross numeric; discounts numeric; refunds numeric; package_revenue numeric; expired_revenue numeric; manual_income numeric; taxes numeric; direct numeric; operating numeric; finance_income numeric; finance_expense numeric; other_income numeric; other_expense numeric; commissions numeric; fees numeric; product_cost numeric; supply_cost numeric; net numeric;
begin
 if not public.business_owner(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if first_day is null or first_day<date '2000-01-01' or first_day>current_date+interval '1 year' or abs(p_opening)>1000000000 then raise exception 'Período ou saldo inicial inválido'; end if;
 select coalesce(sum(c.valor_total+c.prepaid_amount+coalesce(c.desconto,0)),0),coalesce(sum(c.desconto),0)
 into gross,discounts from public.caixa_itens c left join public.agenda_events a on a.id=c.agenda_event_id
 where c.estabelecimento_id=p_tenant and c.pago_em is not null and coalesce(c.origem,'') not in ('pacote','sinal','resgate') and coalesce(a.start,c.created_at)>=since and coalesce(a.start,c.created_at)<until_at;
 select coalesce(sum(private.pass_value_at(p.id,r.created_at)/p.sessions),0) into package_revenue from public.pass_redemptions r join public.customer_passes p on p.id=r.pass_id where r.estabelecimento_id=p_tenant and r.created_at>=since and r.created_at<until_at;
 select package_revenue-coalesce(sum(private.pass_value_at(p.id,r.reversed_at)/p.sessions),0) into package_revenue from public.pass_redemptions r join public.customer_passes p on p.id=r.pass_id where r.estabelecimento_id=p_tenant and r.reversed_at>=since and r.reversed_at<until_at and r.reversed_at<p.expires_at;
 select coalesce(sum(private.pass_value_at(p.id,p.expires_at)*greatest(0,1-coalesce((select count(*)::numeric/p.sessions from public.pass_redemptions r where r.pass_id=p.id and r.created_at<p.expires_at and (r.reversed_at is null or r.reversed_at>=p.expires_at)),0))),0) into expired_revenue from public.customer_passes p join public.caixa_itens c on c.id=p.receipt_id where p.estabelecimento_id=p_tenant and c.pago_em is not null and p.expires_at>=since and p.expires_at<until_at;
 -- Refunds retain their own provider date; advances and unused package credits are liabilities.
 select coalesce(sum(x.amount),0) into refunds from(
  select f.amount_cents/100.0*case when c.origem='pacote' then coalesce((select case when p.expires_at<=f.paid_at then 1 else (select count(*)::numeric/p.sessions from public.pass_redemptions r where r.pass_id=p.id and r.created_at<=f.paid_at and (r.reversed_at is null or r.reversed_at>f.paid_at)) end from public.customer_passes p where p.receipt_id=c.id),0)
   when c.origem='sinal' and not exists(select 1 from public.booking_deposits d join public.caixa_itens final on final.agenda_event_id=d.event_id where d.receipt_id=c.id and final.pago_em is not null) then 0 else 1 end amount
  from public.connect_refunds f join public.caixa_itens c on c.id=f.order_id where f.estabelecimento_id=p_tenant and f.paid_at>=since and f.paid_at<until_at
  union all select valor_total from public.caixa_itens where estabelecimento_id=p_tenant and payment_provider is distinct from 'stripe_connect' and coalesce(origem,'') not in ('pacote','sinal','resgate') and refunded_at>=since and refunded_at<until_at
  union all select p.price from public.customer_passes p join public.caixa_itens c on c.id=p.receipt_id where p.estabelecimento_id=p_tenant and c.payment_provider is distinct from 'stripe_connect' and c.refunded_at>=since and c.refunded_at<until_at and p.expires_at<=c.refunded_at
 )x;
 select coalesce(sum(amount) filter(where kind='receivable' and coalesce(dre_section,'other_income')='other_income'),0),coalesce(sum(amount) filter(where dre_section='taxes'),0),coalesce(sum(amount) filter(where dre_section='direct_cost'),0),
 coalesce(sum(amount) filter(where kind='payable' and coalesce(dre_section,'operating_expense')='operating_expense'),0),coalesce(sum(amount) filter(where dre_section='financial_income'),0),coalesce(sum(amount) filter(where dre_section='financial_expense'),0),coalesce(sum(amount) filter(where dre_section='non_operating_income'),0),coalesce(sum(amount) filter(where dre_section='non_operating_expense'),0)
 into manual_income,taxes,direct,operating,finance_income,finance_expense,other_income,other_expense from public.financial_titles where estabelecimento_id=p_tenant and not cancelled and not exclude_from_dre and competence>=first_day and competence<next_month;
 select coalesce(sum(valor_comissao) filter(where created_at>=since and created_at<until_at and (status<>'cancelado' or cancelled_at is not null)),0)-coalesce(sum(valor_comissao) filter(where cancelled_at>=since and cancelled_at<until_at),0) into commissions from public.comissoes where estabelecimento_id=p_tenant;
 select coalesce(sum(coalesce(stripe_fee_cents,0)+fee_cents),0)/100.0 into fees from public.connect_orders where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at;
 select fees-coalesce(sum(amount_cents),0)/100.0 into fees from public.connect_fee_refunds where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at;
 select coalesce(sum(cp.quantidade*cp.unit_cost_snapshot),0) into product_cost from public.caixa_produtos cp join public.caixa_itens c on c.id=cp.caixa_item_id left join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=p_tenant and c.pago_em is not null and coalesce(a.start,c.created_at)>=since and coalesce(a.start,c.created_at)<until_at and c.status_caixa<>'cancelado';
 select coalesce(-sum(quantity*unit_cost),0) into supply_cost from public.inventory_movements where estabelecimento_id=p_tenant and event_id is not null and quantity<0 and transfer_id is null and created_at>=since and created_at<until_at;
 net:=gross-discounts+package_revenue+expired_revenue+manual_income-refunds-taxes;
 result:=jsonb_build_object('month',first_day,'checked_at',now(),'dre',jsonb_build_array(
  jsonb_build_object('label','Receita de vendas e serviços','amount',gross),jsonb_build_object('label','Sessões de pacotes e clubes consumidas','amount',package_revenue),jsonb_build_object('label','Créditos vencidos sem consumo','amount',expired_revenue),
  jsonb_build_object('label','Outras receitas operacionais','amount',manual_income),jsonb_build_object('label','Descontos','amount',-discounts),jsonb_build_object('label','Devoluções e reembolsos reconhecidos','amount',-refunds),
  jsonb_build_object('label','Impostos sobre receita','amount',-taxes),jsonb_build_object('label','Receita líquida','amount',net,'subtotal',true),
  jsonb_build_object('label','Produtos, insumos e outros custos diretos','amount',-(product_cost+supply_cost+direct)),jsonb_build_object('label','Lucro bruto','amount',net-product_cost-supply_cost-direct,'subtotal',true),
  jsonb_build_object('label','Comissões','amount',-commissions),jsonb_build_object('label','Despesas operacionais','amount',-operating),jsonb_build_object('label','Resultado operacional','amount',net-product_cost-supply_cost-direct-commissions-operating,'subtotal',true),
  jsonb_build_object('label','Receitas financeiras','amount',finance_income),jsonb_build_object('label','Despesas financeiras e taxas de recebimento','amount',-(finance_expense+fees)),jsonb_build_object('label','Outros resultados','amount',other_income-other_expense),
  jsonb_build_object('label','Resultado gerencial','amount',net-product_cost-supply_cost-direct-commissions-operating+finance_income-finance_expense-fees+other_income-other_expense,'subtotal',true)),
 'warnings',jsonb_build_object(
  'pending_refunds',(select count(*) from public.connect_orders where estabelecimento_id=p_tenant and refund_pending_cents>0),
  'unclassified_titles',(select count(*) from public.financial_titles where estabelecimento_id=p_tenant and not cancelled and not exclude_from_dre and dre_section is null and competence>=first_day and competence<next_month),
  'unknown_product_cost',(select count(*) from public.caixa_produtos cp join public.caixa_itens c on c.id=cp.caixa_item_id where c.estabelecimento_id=p_tenant and c.pago_em>=since and c.pago_em<until_at and cp.unit_cost_snapshot is null),
  'unknown_supply_cost',(select count(*) from public.inventory_movements where estabelecimento_id=p_tenant and event_id is not null and quantity<0 and not cost_known and created_at>=since and created_at<until_at),
  'unknown_stripe_fee',(select count(*) from public.connect_orders where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at and stripe_fee_cents is null),
  'fee_refunds_pending',(select count(*) from public.connect_orders where estabelecimento_id=p_tenant and refunded_cents>0 and not fee_refunds_checked),
  'unreconciled_refunds',(select count(*) from public.connect_orders o where o.estabelecimento_id=p_tenant and o.refunded_cents>coalesce((select sum(amount_cents) from public.connect_refunds where order_id=o.id),0))),
 'advances',coalesce((select sum(amount) from public.booking_deposits d where d.estabelecimento_id=p_tenant and d.status='paid' and not exists(select 1 from public.caixa_itens c where c.agenda_event_id=d.event_id and c.pago_em is not null)),0),
 'unconsumed_packages',coalesce((select sum(private.pass_value_at(id,now())*remaining/sessions) from public.customer_passes where estabelecimento_id=p_tenant and status in ('active','refund_pending') and expires_at>now()),0),
 'projection',(select jsonb_agg(jsonb_build_object('days',h,'receivable',receivable,'payable',payable,'balance',p_opening+receivable-payable)) from(select h,
 coalesce((select sum(amount-settled) from public.financial_titles where estabelecimento_id=p_tenant and not cancelled and kind='receivable' and due_date<=(now() at time zone 'America/Sao_Paulo')::date+h),0) receivable,
 coalesce((select sum(amount-settled) from public.financial_titles where estabelecimento_id=p_tenant and not cancelled and kind='payable' and due_date<=(now() at time zone 'America/Sao_Paulo')::date+h),0) payable from unnest(array[30,60,90]) h)x),
 'reconciliation',jsonb_build_object('paid',coalesce((select sum(amount_cents)/100.0 from public.connect_orders where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at),0),
 'fees',fees,'net',coalesce((select sum(net_cents)/100.0 from public.connect_orders where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at),0),
 'refunds',coalesce((select sum(amount_cents)/100.0 from public.connect_refunds where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at),0),
 'fee_refunds',coalesce((select sum(amount_cents)/100.0 from public.connect_fee_refunds where estabelecimento_id=p_tenant and paid_at>=since and paid_at<until_at),0),
 'mismatches',(select count(*) from public.connect_orders o join public.caixa_itens c on c.id=o.id where o.estabelecimento_id=p_tenant and o.created_at>=since and o.created_at<until_at and (round(c.valor_total*100)<>o.amount_cents or (o.status in ('paid','disputed') and c.status_caixa<>'pago') or (o.status in ('refunded','expired') and c.status_caixa<>'cancelado') or (o.status='pending' and c.status_caixa<>'pendente'))),
 'pending',coalesce((select sum(amount_cents)/100.0 from public.connect_orders where estabelecimento_id=p_tenant and status='pending'),0)));
 return result;
end $$;
revoke all on function public.finance_report(uuid,date,numeric) from public,anon;
grant execute on function public.finance_report(uuid,date,numeric) to authenticated;
notify pgrst,'reload schema';

create index retention_last_visit on public.agenda_events(estabelecimento_id,cliente_id,start desc) where status='concluido';
create index retention_upcoming on public.agenda_events(estabelecimento_id,cliente_id,start) where status in ('pendente','confirmado','em_atendimento');
create index retention_expiry on public.customer_passes(estabelecimento_id,expires_at) where status='active';
