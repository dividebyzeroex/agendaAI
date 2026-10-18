-- Optional reservation deposits and monthly card mandates. No existing customer is charged.
alter table public.business_settings add column deposit_percent integer not null default 0
 check(deposit_percent=0 or deposit_percent between 10 and 50);
alter table public.caixa_itens add column prepaid_amount numeric not null default 0 check(prepaid_amount>=0);
alter table public.caixa_itens add column refunded_at timestamptz;
alter table public.connect_orders add column purpose text not null default 'checkout'
 check(purpose in ('checkout','deposit','club'));
alter table public.connect_orders add column reconciled_at timestamptz;
alter table public.connect_orders add column refunded_at timestamptz;
alter table public.connect_orders add column checkout_attempt integer not null default 0 check(checkout_attempt>=0);
alter table public.connect_orders add column checkout_epoch timestamptz;

create table public.booking_deposits(
 id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id),
 event_id uuid not null unique references public.agenda_events(id), receipt_id uuid not null unique references public.caixa_itens(id),
 amount numeric not null check(amount>=2), status text not null default 'pending' check(status in ('pending','paid','expired','refund_pending','refunded')),
 approval_required boolean not null, request_key uuid not null, fingerprint text not null,
 created_at timestamptz not null default now(), unique(estabelecimento_id,request_key)
);
create index booking_deposits_tenant on public.booking_deposits(estabelecimento_id,created_at desc);
create table public.club_contracts(
 id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id),
 cliente_id uuid not null references public.clientes(id), bundle_id uuid not null references public.service_bundles(id),
 servico_id uuid not null references public.servicos(id), title text not null, price numeric not null check(price>=2 and price<=100000),
 sessions integer not null check(sessions between 1 and 100), account_id text not null,
 token uuid not null unique default gen_random_uuid(), request_key uuid not null,
 status text not null default 'pending' check(status in ('pending','active','past_due','cancelled')),
 renew_enabled boolean not null default false, consent_at timestamptz, terms_version text,
 customer_id text, payment_method_id text, next_due date, anchor_day integer check(anchor_day between 1 and 31),
 current_cycle_id uuid, cancelled_at timestamptz, created_at timestamptz not null default now(),
 unique(estabelecimento_id,request_key)
);
create unique index club_active_customer_offer on public.club_contracts(estabelecimento_id,cliente_id,bundle_id) where status<>'cancelled';
create index club_due on public.club_contracts(next_due,id) where renew_enabled and status in ('active','past_due');
create table public.club_cycles(
 id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id),
 contract_id uuid not null references public.club_contracts(id), due_date date not null,
 receipt_id uuid not null unique references public.caixa_itens(id), pass_id uuid unique references public.customer_passes(id),
 debit_claimed_at timestamptz, created_at timestamptz not null default now(), unique(contract_id,due_date)
);
create index club_cycles_contract on public.club_cycles(contract_id,created_at desc);
alter table public.club_contracts add constraint club_current_cycle foreign key(current_cycle_id) references public.club_cycles(id);
do $$ declare n text; begin
 foreach n in array array['booking_deposits','club_contracts','club_cycles'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from anon,authenticated',n);
  execute format('grant select on public.%I to authenticated',n);
  execute format('grant all on public.%I to service_role',n);
  execute format('create policy tenant_read on public.%I for select to authenticated using(public.%s(estabelecimento_id))',n,case when n='booking_deposits' then 'can_operate_cash' else 'business_owner' end);
 end loop;
end $$;

create or replace function public.business_public_page(p_tenant uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('headline',s.headline,'gallery',s.gallery,'approval_required',s.approval_required,'deposit_percent',s.deposit_percent)
 from public.business_settings s join public.estabelecimento e on e.id=s.estabelecimento_id
 where e.id=p_tenant and e.active and greatest(e.trial_ends_at,e.plano_expires_at)>now();
$$;
revoke all on function public.business_public_page(uuid) from public;
grant execute on function public.business_public_page(uuid) to anon,authenticated;

create function public.reserve_with_deposit(p_data jsonb,p_key uuid,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t uuid:=(p_data->>'estabelecimento_id')::uuid; dep public.booking_deposits; cfg public.business_settings;
 ev public.agenda_events; c public.caixa_itens; svc public.servicos; linked public.connect_accounts; price numeric; amount numeric;
begin
 if p_key is null or length(p_fingerprint)<>64 then raise exception 'Reserva inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation:'||t::text||p_key::text,0));
 select * into dep from public.booking_deposits where estabelecimento_id=t and request_key=p_key;
 if found then
  if dep.fingerprint<>p_fingerprint then raise exception 'A tentativa pertence a outra reserva'; end if;
  select * into ev from public.agenda_events where id=dep.event_id;
  select * into c from public.caixa_itens where id=dep.receipt_id;
  return jsonb_build_object('event',jsonb_build_object('id',ev.id,'start',ev.start,'end',ev."end",'status',ev.status),'deposit_token',c.token_publico,'amount',dep.amount,'receipt_id',c.id);
 end if;
 select * into cfg from public.business_settings where estabelecimento_id=t and deposit_percent>0;
 if not found or not exists(select 1 from public.estabelecimento where id=t and active and greatest(trial_ends_at,plano_expires_at)>now()) then raise exception 'Sinal indisponível'; end if;
 select * into svc from public.servicos where id=(p_data->>'servico_id')::uuid and estabelecimento_id=t and ativo;
 if not found then raise exception 'Serviço indisponível'; end if;
 price:=coalesce((select valor_proprio from public.profissional_servicos where estabelecimento_id=t and profissional_id=nullif(p_data->>'profissional_id','')::uuid and servico_id=svc.id),svc.preco);
 amount:=round(least(price/2,greatest(2,price*cfg.deposit_percent/100.0)),2);
 if amount<2 or (p_data->>'start')::timestamptz<now()+interval '45 minutes'
 or (p_data->>'end')::timestamptz-(p_data->>'start')::timestamptz<>make_interval(mins=>svc.duracao_min) then raise exception 'Reserve com pelo menos 45 minutos de antecedência'; end if;
 if not exists(select 1 from public.clientes where id=(p_data->>'cliente_id')::uuid and estabelecimento_id=t) then raise exception 'Cliente indisponível'; end if;
 select * into linked from public.connect_accounts where estabelecimento_id=t and enabled and charges_enabled and payouts_enabled;
 if not found or linked.fee_cents<>100 then raise exception 'Recebimentos online indisponíveis'; end if;
 insert into public.agenda_events(estabelecimento_id,cliente_id,servico_id,profissional_id,title,start,"end",status,metadata,observacoes)
 values(t,(p_data->>'cliente_id')::uuid,svc.id,nullif(p_data->>'profissional_id','')::uuid,left(p_data->>'title',300),(p_data->>'start')::timestamptz,(p_data->>'end')::timestamptz,'pendente',coalesce(p_data->'metadata','{}'),left(p_data->>'observacoes',2000)) returning * into ev;
 insert into public.caixa_itens(estabelecimento_id,cliente_id,cliente_nome,servicos,valor_total,status_caixa,forma_pagamento,origem,payment_provider)
 values(t,ev.cliente_id,'Reserva com sinal',jsonb_build_array(jsonb_build_object('titulo','Sinal · '||svc.titulo,'preco',amount)),amount,'pendente','cartao_credito','sinal','stripe_connect') returning * into c;
 insert into public.booking_deposits(estabelecimento_id,event_id,receipt_id,amount,approval_required,request_key,fingerprint)
 values(t,ev.id,c.id,amount,cfg.approval_required,p_key,p_fingerprint);
 insert into public.connect_orders(id,estabelecimento_id,account_id,amount_cents,fee_cents,purpose)
 values(c.id,t,linked.account_id,round(amount*100),100,'deposit');
 return jsonb_build_object('event',jsonb_build_object('id',ev.id,'start',ev.start,'end',ev."end",'status',ev.status),'deposit_token',c.token_publico,'amount',amount,'receipt_id',c.id);
end $$;
revoke all on function public.reserve_with_deposit(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_with_deposit(jsonb,uuid,text) to service_role;

create function private.next_club_date(p_date date,p_anchor integer) returns date language sql immutable set search_path='' as $$
 select (date_trunc('month',p_date)+interval '1 month')::date+least(p_anchor,extract(day from date_trunc('month',p_date)+interval '2 months - 1 day')::integer)-1;
$$;
revoke all on function private.next_club_date(date,integer) from public,anon,authenticated;

create function public.claim_club_cycle(p_contract uuid,p_accept boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare club public.club_contracts; cycle public.club_cycles; receipt public.caixa_itens; due date; claim boolean:=false;
begin
 select * into club from public.club_contracts where id=p_contract for update;
 if not found or club.status='cancelled' or not exists(select 1 from public.estabelecimento where id=club.estabelecimento_id and active and greatest(trial_ends_at,plano_expires_at)>now()) then raise exception 'Clube indisponível'; end if;
 if not exists(select 1 from public.connect_accounts where estabelecimento_id=club.estabelecimento_id and account_id=club.account_id and enabled and charges_enabled and payouts_enabled and fee_cents=100) then raise exception 'Recebimentos online indisponíveis'; end if;
 if p_accept then
  if club.consent_at is null then update public.club_contracts set consent_at=now(),terms_version='club-monthly-2026-10-16-v1',renew_enabled=true where id=club.id returning * into club; end if;
 elsif not club.renew_enabled or club.consent_at is null or club.customer_id is null or club.payment_method_id is null then raise exception 'Renovação não autorizada';
 end if;
 due:=coalesce(club.next_due,(now() at time zone 'America/Sao_Paulo')::date);
 if due>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'O próximo ciclo ainda não venceu'; end if;
 -- An unresolved cycle is never bypassed with another debit.
 select cc.* into cycle from public.club_cycles cc join public.caixa_itens c on c.id=cc.receipt_id where cc.contract_id=club.id and c.status_caixa='pendente' order by cc.created_at limit 1;
 if not found then
  select * into cycle from public.club_cycles where contract_id=club.id and due_date=due;
 end if;
 if cycle.id is null then
  insert into public.caixa_itens(estabelecimento_id,cliente_id,cliente_nome,servicos,valor_total,status_caixa,forma_pagamento,origem,payment_provider)
  values(club.estabelecimento_id,club.cliente_id,'Cliente do clube',jsonb_build_array(jsonb_build_object('titulo',club.title||' · ciclo mensal','preco',club.price)),club.price,'pendente','cartao_credito','pacote','stripe_connect') returning * into receipt;
  insert into public.club_cycles(estabelecimento_id,contract_id,due_date,receipt_id,debit_claimed_at)
  values(club.estabelecimento_id,club.id,due,receipt.id,case when p_accept then null else now() end) returning * into cycle;
  insert into public.connect_orders(id,estabelecimento_id,account_id,amount_cents,fee_cents,purpose)
  values(receipt.id,club.estabelecimento_id,club.account_id,round(club.price*100),100,'club');
  claim:=not p_accept;
 end if;
 select * into receipt from public.caixa_itens where id=cycle.receipt_id;
 return jsonb_build_object('claimed',claim,'cycle_id',cycle.id,'order_id',cycle.receipt_id,'receipt_token',receipt.token_publico,'customer_id',club.customer_id,'payment_method_id',club.payment_method_id,'account_id',club.account_id);
end $$;
revoke all on function public.claim_club_cycle(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_club_cycle(uuid,boolean) to service_role;

create function public.bind_club_card(p_order uuid,p_customer text,p_method text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_customer !~ '^cus_[A-Za-z0-9]+$' or p_method !~ '^pm_[A-Za-z0-9]+$' then raise exception 'Cartão não confirmado'; end if;
 update public.club_contracts c set customer_id=p_customer,payment_method_id=p_method
 from public.club_cycles cy join public.caixa_itens r on r.id=cy.receipt_id
 where cy.receipt_id=p_order and c.id=cy.contract_id and c.current_cycle_id=cy.id and c.consent_at is not null and r.status_caixa='pago'
 and (c.customer_id is null or c.customer_id=p_customer);
end $$;
revoke all on function public.bind_club_card(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bind_club_card(uuid,text,text) to service_role;

create function private.sync_growth_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare dep public.booking_deposits; cy public.club_cycles; club public.club_contracts; pass public.customer_passes; paid_date date; end_date date;
begin
 if new.status_caixa is not distinct from old.status_caixa then return new; end if;
 select * into dep from public.booking_deposits where receipt_id=new.id for update;
 if found then
  if new.status_caixa='pago' then
   update public.booking_deposits set status='paid' where id=dep.id;
   update public.agenda_events set status=case when dep.approval_required then 'pendente' else 'confirmado' end where id=dep.event_id and status='pendente';
  elsif new.status_caixa='cancelado' then
   update public.booking_deposits set status=case when dep.status in ('paid','refund_pending') then 'refunded' else 'expired' end where id=dep.id;
   update public.agenda_events set status='cancelado' where id=dep.event_id and status in ('pendente','confirmado');
  end if;
 end if;
 select * into cy from public.club_cycles where receipt_id=new.id for update;
 if found then
  select * into club from public.club_contracts where id=cy.contract_id for update;
  if new.status_caixa='pago' and cy.pass_id is null then
   if club.consent_at is null then raise exception 'Clube sem autorização do cliente'; end if;
   paid_date:=greatest(cy.due_date,(new.pago_em at time zone 'America/Sao_Paulo')::date);
   if club.anchor_day is null or paid_date>cy.due_date then club.anchor_day:=extract(day from paid_date); end if;
   end_date:=private.next_club_date(paid_date,club.anchor_day);
   insert into public.customer_passes(estabelecimento_id,cliente_id,bundle_id,servico_id,title,kind,sessions,remaining,price,validity_days,status,expires_at,receipt_id,request_key)
   values(club.estabelecimento_id,club.cliente_id,club.bundle_id,club.servico_id,club.title,'membership',club.sessions,club.sessions,club.price,end_date-paid_date,'active',(end_date::timestamp+interval '8 hours') at time zone 'America/Sao_Paulo',new.id,cy.id) returning * into pass;
   update public.club_cycles set pass_id=pass.id where id=cy.id;
   update public.club_contracts set status=case when status='cancelled' then status else 'active' end,next_due=end_date,anchor_day=club.anchor_day,current_cycle_id=cy.id where id=club.id;
  elsif new.status_caixa='cancelado' then
   if old.status_caixa='pago' or cy.pass_id is not null then
    update public.club_contracts set renew_enabled=false,status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where id=club.id;
   else update public.club_contracts set status='past_due' where id=club.id and status<>'cancelled'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.sync_growth_receipt() from public,anon,authenticated;
create trigger growth_receipt_settlement after update of status_caixa on public.caixa_itens for each row execute function private.sync_growth_receipt();

create function private.guard_deposit_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare dep public.booking_deposits;
begin
 select * into dep from public.booking_deposits where event_id=old.id;
 if tg_op='DELETE' then
  if found then raise exception 'Reservas com sinal mantêm histórico. Cancele ou reembolse em Recebimentos'; end if;
  return old;
 end if;
 if found then
  if dep.status in ('pending','refund_pending') and new.status not in ('pendente','cancelado') then raise exception 'Confirme o sinal antes de aprovar ou concluir'; end if;
  -- Auth identity is retained through SECURITY DEFINER calls. Provider settlement updates the deposit first.
  if dep.status in ('pending','paid','refund_pending') and (new.status='cancelado' or (new.start,new."end",new.profissional_id,new.servico_id,new.cliente_id) is distinct from (old.start,old."end",old.profissional_id,old.servico_id,old.cliente_id)) then
   raise exception 'Cancele ou reembolse o sinal em Recebimentos antes de alterar a reserva';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_deposit_booking() from public,anon,authenticated;
create trigger deposit_booking_guard before update or delete on public.agenda_events for each row execute function private.guard_deposit_booking();

create function public.prepare_growth_refund(p_receipt uuid) returns void language plpgsql security invoker set search_path='' as $$
declare dep public.booking_deposits;
begin
 select * into dep from public.booking_deposits where receipt_id=p_receipt for update;
 if found then
  if exists(select 1 from public.caixa_itens where agenda_event_id=dep.event_id and status_caixa='pago') then raise exception 'Reembolse o saldo final antes do sinal'; end if;
  if dep.status not in ('paid','refund_pending') then raise exception 'Sinal indisponível para reembolso'; end if;
  update public.booking_deposits set status='refund_pending' where id=dep.id;
 end if;
 perform public.prepare_pass_refund(p_receipt);
 update public.club_contracts set renew_enabled=false,status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where id in(select contract_id from public.club_cycles where receipt_id=p_receipt);
end $$;
revoke all on function public.prepare_growth_refund(uuid) from public,anon,authenticated;
grant execute on function public.prepare_growth_refund(uuid) to service_role;

-- Called only after the backend verifies that the previous provider attempt cannot settle.
create function public.restart_club_checkout(p_order uuid,p_session text,p_intent text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.connect_orders;
begin
 select * into o from public.connect_orders where id=p_order for update;
 if not found or o.purpose<>'club' or o.status not in ('pending','expired') or o.session_id is distinct from p_session or o.payment_intent_id is distinct from p_intent then raise exception 'Tentativa de pagamento alterada. Atualize a página'; end if;
 if not exists(select 1 from public.club_cycles cy join public.club_contracts c on c.id=cy.contract_id where cy.receipt_id=o.id and cy.pass_id is null and c.status<>'cancelled' and c.consent_at is not null) then raise exception 'Ciclo indisponível'; end if;
 update public.connect_orders set status='pending',session_id=null,payment_intent_id=null,checkout_attempt=checkout_attempt+1,checkout_epoch=now() where id=o.id returning * into o;
 update public.caixa_itens set status_caixa='pendente' where id=o.id and pago_em is null;
 return to_jsonb(o);
end $$;
revoke all on function public.restart_club_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.restart_club_checkout(uuid,text,text) to service_role;

-- A prepaid balance is derived by the server; browsers cannot manufacture credit.
create function private.guard_prepaid_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare dep public.booking_deposits;
begin
 if new.agenda_event_id is not null then
  select * into dep from public.booking_deposits where event_id=new.agenda_event_id;
  if found and (dep.status<>'paid' or new.origem='resgate') then raise exception 'O sinal deve estar confirmado e ser abatido no caixa'; end if;
 end if;
 if new.prepaid_amount<>(case when dep.id is not null then dep.amount else 0 end) then raise exception 'Abatimento do sinal divergente'; end if;
 if tg_op='UPDATE' and new.status_caixa='cancelado' and old.status_caixa='pago' then new.refunded_at:=coalesce(new.refunded_at,now()); end if;
 return new;
end $$;
revoke all on function private.guard_prepaid_receipt() from public,anon,authenticated;
create trigger prepaid_receipt_guard before insert or update on public.caixa_itens for each row execute function private.guard_prepaid_receipt();

create function private.checkout_with_deposit(p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 t uuid:=(p_data->>'estabelecimentoId')::uuid; ev uuid:=nullif(p_data->>'eventId','')::uuid;
 c public.caixa_itens; s public.caixa_sessoes; a public.agenda_events; service public.servicos; prod public.produtos;
 rule public.profissional_servicos; item jsonb; services jsonb:='[]'; total numeric:=0; discount numeric:=0; commission numeric:=0;
 online boolean:=coalesce((p_data->>'online')::boolean,false); connected public.connect_accounts;
 dep public.booking_deposits; prepaid numeric:=0;
 customer uuid:=(p_data->>'clienteId')::uuid; pro uuid; sid uuid; qty int; cfg jsonb; visits int;
begin
 if not public.can_operate_cash(t) or p_key is null then raise exception 'Acesso ao caixa não autorizado' using errcode='42501'; end if;
 -- Lock per tenant before both retry lookup and event lookup, including across tabs.
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||t::text,0));
 select * into c from public.caixa_itens where estabelecimento_id=t and checkout_key=p_key;
 if found then return to_jsonb(c); end if;
 if ev is not null then
 select * into dep from public.booking_deposits where event_id=ev and estabelecimento_id=t for update;
 if found then
  if dep.status<>'paid' then raise exception 'Confirme o sinal antes de receber o saldo'; end if;
  prepaid:=dep.amount;
 end if;
 select * into a from public.agenda_events where id=ev and estabelecimento_id=t for update;
 if not found or a.status not in ('concluido','em_atendimento','confirmado') then raise exception 'Atendimento indisponível'; end if;
 select * into c from public.caixa_itens where agenda_event_id=ev and status_caixa<>'cancelado' order by created_at limit 1;
 if found then
 if c.payment_provider='stripe_connect' and not online and c.status_caixa='pendente' then raise exception 'Há uma cobrança online pendente. Cancele o link antes de receber presencialmente.'; end if;
 return to_jsonb(c); end if;
 if a.cobranca_enviada then raise exception 'Atendimento já registrado. Confira a comanda existente.'; end if;
 pro:=a.profissional_id; sid:=a.servico_id;
 if customer is distinct from a.cliente_id then raise exception 'Cliente diferente do atendimento'; end if;
 end if;
 if online then
 select * into connected from public.connect_accounts where estabelecimento_id=t and enabled and charges_enabled and payouts_enabled;
 if not found then raise exception 'Vincule e ative sua conta Stripe antes de cobrar online'; end if;
 end if;
 select * into s from public.caixa_sessoes where id=(p_data->>'sessaoId')::uuid and estabelecimento_id=t for update;
 if not found or s.status<>'aberto' then raise exception 'Abra um caixa antes de receber'; end if;
 if not exists(select 1 from public.clientes where id=customer and estabelecimento_id=t) then raise exception 'Cliente não pertence ao negócio'; end if;
 if coalesce(p_data->>'formaPagamento','') not in ('dinheiro','pix','cartao_credito','cartao_debito') then raise exception 'Forma de pagamento inválida'; end if;
 if sid is not null then
 select * into service from public.servicos where id=sid and estabelecimento_id=t;
 if not found then raise exception 'Serviço indisponível'; end if;
 total:=service.preco;
 select * into rule from public.profissional_servicos where profissional_id=pro and servico_id=sid and estabelecimento_id=t;
 if rule.valor_proprio is not null then total:=rule.valor_proprio; end if;
 if abs(total-coalesce((p_data->'servicoPrincipal'->>'preco')::numeric,-1))>0.01 then raise exception 'Preço atualizado. Reabra o atendimento para conferir.'; end if;
 services:=jsonb_build_array(jsonb_build_object('titulo',service.titulo,'preco',total));
 end if;
 if jsonb_array_length(coalesce(p_data->'servicosExtras','[]'))>0 then raise exception 'Inclua serviços adicionais na agenda antes de receber'; end if;
 discount:=coalesce((p_data->>'fidelidadeDesconto')::numeric,0);
 if discount<0 or discount>total then raise exception 'Desconto inválido'; end if;
 if online and discount>0 then raise exception 'Resgate a fidelidade no recebimento presencial'; end if;
 if discount>0 then
 select config_fidelidade into cfg from public.estabelecimento where id=t;
 select count(*) into visits from public.agenda_events where estabelecimento_id=t and cliente_id=customer and status='concluido' and coalesce(fidelidade_resgatada,false)=false;
 if not coalesce((cfg->>'ativo')::boolean,false) or visits<coalesce((cfg->>'visitas_meta')::int,10)
 or round(total*coalesce((cfg->>'desconto_percentual')::numeric,0)/100,2)<>round(discount,2) then raise exception 'Benefício de fidelidade indisponível'; end if;
 update public.agenda_events set fidelidade_resgatada=true where estabelecimento_id=t and cliente_id=customer and status='concluido' and coalesce(fidelidade_resgatada,false)=false;
 end if;
 commission:=case when rule.tipo_comissao='fixo' then coalesce(rule.taxa_comissao,0) else round((total-discount)*coalesce(rule.taxa_comissao,0)/100,2) end;
 total:=total-discount-prepaid;
 if total<0 then raise exception 'O desconto ultrapassa o saldo após o sinal'; end if;
 insert into public.caixa_itens(estabelecimento_id,checkout_key,agenda_event_id,cliente_id,cliente_nome,servicos,valor_total,profissional,status_caixa,forma_pagamento,pago_em,desconto,sessao_id,origem,comanda_fisica,email_cliente,prepaid_amount)
 values(t,p_key,ev,customer,left(p_data->>'clienteNome',200),services,total,left(p_data->>'profissional',200),case when online then 'pendente' else 'pago' end,p_data->>'formaPagamento',case when online then null else now() end,discount,s.id,case when ev is null then 'avulso' else 'agenda' end,left(p_data->>'comandaFisica',100),left(p_data->>'emailCliente',254),prepaid) returning * into c;
 for item in select value from jsonb_array_elements(coalesce(p_data->'produtos','[]')) order by value->>'id' loop
 qty:=(item->>'quantidade')::int;
 if qty is null or qty<=0 or qty>1000 then raise exception 'Quantidade inválida'; end if;
 select * into prod from public.produtos where id=(item->>'id')::uuid and estabelecimento_id=t and ativo for update;
 if not found or prod.estoque<qty then raise exception 'Estoque insuficiente ou produto indisponível'; end if;
 if prod.preco<>(item->>'preco')::numeric then raise exception 'Preço de produto atualizado. Confira a comanda.'; end if;
 perform public.add_produto_comanda(c.id,prod.id,qty);
 end loop;
 select * into c from public.caixa_itens where id=c.id;
 if c.valor_total<=0 then raise exception 'A comanda deve ter valor maior que zero'; end if;
 if p_data->>'formaPagamento'='dinheiro' and coalesce((p_data->>'valorRecebido')::numeric,0) not between c.valor_total and 100000000 then raise exception 'Valor recebido insuficiente'; end if;
 if not online then
 insert into public.caixa_movimentacoes(sessao_id,caixa_item_id,tipo,forma_pagamento,valor,descricao,operador_nome)
 values(s.id,c.id,'venda',c.forma_pagamento,c.valor_total,'Venda registrada',s.operador_nome);
 end if;
 if ev is not null then
 update public.agenda_events set status='concluido',cobranca_enviada=true,cobranca_enviada_at=now(),valor_total=c.valor_total where id=ev;
 if not online and pro is not null and sid is not null then
 insert into public.comissoes(estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,taxa_aplicada,tipo_comissao,valor_comissao,status)
 values(t,ev,pro,sid,coalesce((services->0->>'preco')::numeric,0)-discount,coalesce(rule.taxa_comissao,0),coalesce(rule.tipo_comissao,'percentual'),commission,'pendente');
 end if; end if;
 if online then
 if round(c.valor_total*100)<=connected.fee_cents or round(c.valor_total*100)>99999999 then raise exception 'Valor insuficiente para a taxa da plataforma'; end if;
 update public.caixa_itens set payment_provider='stripe_connect' where id=c.id;
 perform public.register_connect_order(c.id);
 end if;
 return to_jsonb(c);
end $$;

revoke all on function private.checkout_with_deposit(jsonb,uuid) from public,anon;
grant execute on function private.checkout_with_deposit(jsonb,uuid) to authenticated;
create or replace function public.checkout_atomic(p_data jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$select private.checkout_with_deposit(p_data,p_key)$$;
revoke all on function public.checkout_atomic(jsonb,uuid) from public,anon;
grant execute on function public.checkout_atomic(jsonb,uuid) to authenticated;

create function public.quote_booking(p_tenant uuid,p_service uuid,p_pro uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('price',coalesce(r.valor_proprio,s.preco),'percent',coalesce(cfg.deposit_percent,0),'deposit',case when coalesce(cfg.deposit_percent,0)>0 and coalesce(r.valor_proprio,s.preco)>=4 then round(least(coalesce(r.valor_proprio,s.preco)/2,greatest(2,coalesce(r.valor_proprio,s.preco)*cfg.deposit_percent/100.0)),2) else 0 end)
 from public.servicos s join public.estabelecimento e on e.id=s.estabelecimento_id
 left join public.business_settings cfg on cfg.estabelecimento_id=e.id
 left join public.profissional_servicos r on r.estabelecimento_id=e.id and r.servico_id=s.id and r.profissional_id=p_pro
 where s.id=p_service and e.id=p_tenant and s.ativo and e.active and greatest(e.trial_ends_at,e.plano_expires_at)>now()
 and (p_pro is null or exists(select 1 from public.profissionais where id=p_pro and estabelecimento_id=e.id and ativo));
$$;
revoke all on function public.quote_booking(uuid,uuid,uuid) from public;
grant execute on function public.quote_booking(uuid,uuid,uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_comanda_digital(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public,pg_temp
AS $function$
DECLARE
  v_comanda record;
  v_produtos json;
  v_estabelecimento record;
BEGIN
  -- Busca a comanda pelo token
  SELECT * INTO v_comanda FROM public.caixa_itens WHERE token_publico = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada';
  END IF;

  -- Busca detalhes dos produtos associados
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', cp.id,
      'produto_id', p.id,
      'nome', p.nome,
      'quantidade', cp.quantidade,
      'valor_unitario', cp.valor_unitario,
      'subtotal', cp.quantidade * cp.valor_unitario
    )
  ), '[]') INTO v_produtos
  FROM public.caixa_produtos cp
  JOIN public.produtos p ON p.id = cp.produto_id
  WHERE cp.caixa_item_id = v_comanda.id;

  -- Busca estabelecimento
  SELECT * INTO v_estabelecimento FROM public.estabelecimento WHERE id = v_comanda.estabelecimento_id;

  RETURN json_build_object(
    'id', v_comanda.id,
    'cliente_nome', v_comanda.cliente_nome,
    'servicos', v_comanda.servicos,
    'produtos', v_produtos,
    'valor_total', v_comanda.valor_total,
    'desconto', v_comanda.desconto,
    'prepaid_amount', v_comanda.prepaid_amount,
    'origem', v_comanda.origem,
    'status_caixa', v_comanda.status_caixa,
    'created_at', v_comanda.created_at,
    'estabelecimento', json_build_object(
      'nome', v_estabelecimento.nome,
      'logo_url', v_estabelecimento.logo_url
    )
  );
END;
$function$
;
