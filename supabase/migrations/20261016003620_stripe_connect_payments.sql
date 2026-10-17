-- Optional payment processing; only the backend can change Connect configuration.
create table public.connect_accounts (
 estabelecimento_id uuid primary key references public.estabelecimento(id),
 account_id text unique not null, enabled boolean not null default false,
 charges_enabled boolean not null default false, payouts_enabled boolean not null default false,
 fee_cents integer not null default 100 check(fee_cents between 0 and 10000),
 terms_version text, terms_user uuid, terms_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.connect_accounts enable row level security;
grant select on public.connect_accounts to authenticated;
grant all on public.connect_accounts to service_role;
create policy connect_account_read on public.connect_accounts for select to authenticated using(public.can_operate_cash(estabelecimento_id));
alter table public.caixa_itens add column payment_provider text;
create table public.connect_orders (
 id uuid primary key references public.caixa_itens(id), estabelecimento_id uuid not null references public.estabelecimento(id),
 account_id text not null, amount_cents bigint not null check(amount_cents>0), fee_cents integer not null check(fee_cents>=0),
 status text not null default 'pending' check(status in ('pending','paid','expired','refunded','disputed')),
 session_id text unique, payment_intent_id text unique, charge_id text,
 commission jsonb, created_at timestamptz not null default now(), paid_at timestamptz,
 stripe_fee_cents bigint, net_cents bigint, refunded_cents bigint not null default 0
);
alter table public.connect_orders enable row level security;
grant select on public.connect_orders to authenticated;
grant all on public.connect_orders to service_role;
create policy connect_order_read on public.connect_orders for select to authenticated using(public.can_operate_cash(estabelecimento_id));
create index connect_orders_tenant on public.connect_orders(estabelecimento_id,created_at desc);
create function public.register_connect_order(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.caixa_itens; a public.agenda_events; r public.profissional_servicos; linked public.connect_accounts; comm jsonb; base numeric; amount numeric; begin
 select * into c from public.caixa_itens where id=p_id for update;
 if not found or not public.can_operate_cash(c.estabelecimento_id) or c.status_caixa<>'pendente' or c.payment_provider is distinct from 'stripe_connect' then raise exception 'Pedido não autorizado' using errcode='42501'; end if;
 select * into linked from public.connect_accounts where estabelecimento_id=c.estabelecimento_id and enabled and charges_enabled and payouts_enabled;
 if not found then raise exception 'Conta indisponível'; end if;
 select * into a from public.agenda_events where id=c.agenda_event_id and estabelecimento_id=c.estabelecimento_id;
 if a.profissional_id is not null and a.servico_id is not null then
 select * into r from public.profissional_servicos where estabelecimento_id=c.estabelecimento_id and profissional_id=a.profissional_id and servico_id=a.servico_id;
 base:=coalesce((c.servicos->0->>'preco')::numeric,0)-coalesce(c.desconto,0);
 amount:=case when r.tipo_comissao='fixo' then coalesce(r.taxa_comissao,0) else round(base*coalesce(r.taxa_comissao,0)/100,2) end;
 comm:=jsonb_build_object('pro',a.profissional_id,'sid',a.servico_id,'base',base,'rate',coalesce(r.taxa_comissao,0),'type',coalesce(r.tipo_comissao,'percentual'),'amount',amount);
 end if;
 insert into public.connect_orders(id,estabelecimento_id,account_id,amount_cents,fee_cents,commission) values(c.id,c.estabelecimento_id,linked.account_id,round(c.valor_total*100),linked.fee_cents,comm) on conflict(id) do nothing;
end $$;
revoke all on function public.register_connect_order(uuid) from public,anon;
grant execute on function public.register_connect_order(uuid) to authenticated;

create or replace function public.checkout_atomic(p_data jsonb,p_key uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 t uuid:=(p_data->>'estabelecimentoId')::uuid; ev uuid:=nullif(p_data->>'eventId','')::uuid;
 c public.caixa_itens; s public.caixa_sessoes; a public.agenda_events; service public.servicos; prod public.produtos;
 rule public.profissional_servicos; item jsonb; services jsonb:='[]'; total numeric:=0; discount numeric:=0; commission numeric:=0;
 online boolean:=coalesce((p_data->>'online')::boolean,false); connected public.connect_accounts;
 customer uuid:=(p_data->>'clienteId')::uuid; pro uuid; sid uuid; qty int; cfg jsonb; visits int;
begin
 if not public.can_operate_cash(t) or p_key is null then raise exception 'Acesso ao caixa não autorizado' using errcode='42501'; end if;
 -- Lock per tenant before both retry lookup and event lookup, including across tabs.
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||t::text,0));
 select * into c from public.caixa_itens where estabelecimento_id=t and checkout_key=p_key;
 if found then return to_jsonb(c); end if;
 if ev is not null then
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
 total:=total-discount;
 insert into public.caixa_itens(estabelecimento_id,checkout_key,agenda_event_id,cliente_id,cliente_nome,servicos,valor_total,profissional,status_caixa,forma_pagamento,pago_em,desconto,sessao_id,origem,comanda_fisica,email_cliente)
 values(t,p_key,ev,customer,left(p_data->>'clienteNome',200),services,total,left(p_data->>'profissional',200),case when online then 'pendente' else 'pago' end,p_data->>'formaPagamento',case when online then null else now() end,discount,s.id,case when ev is null then 'avulso' else 'agenda' end,left(p_data->>'comandaFisica',100),left(p_data->>'emailCliente',254)) returning * into c;
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
revoke all on function public.checkout_atomic(jsonb,uuid) from public,anon;
grant execute on function public.checkout_atomic(jsonb,uuid) to authenticated;


-- Settlement is backend-only and does not depend on an open cash drawer or tenant subscription expiry.
create function public.settle_connect_order(p_id uuid,p_account text,p_session text,p_intent text,p_amount bigint,p_fee integer,p_paid_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare o public.connect_orders; c public.caixa_itens; begin
 select * into o from public.connect_orders where id=p_id for update;
 if not found or o.account_id<>p_account or o.amount_cents<>p_amount or o.fee_cents<>p_fee
 or (o.session_id is not null and o.session_id<>p_session) then raise exception 'Pagamento divergente'; end if;
 if o.status in ('paid','refunded','disputed') then return; end if;
 if o.status<>'pending' then raise exception 'Pedido não está pendente'; end if;
 select * into c from public.caixa_itens where id=o.id for update;
 update public.caixa_itens set status_caixa='pago',pago_em=p_paid_at where id=c.id;
 update public.connect_orders set status='paid',session_id=p_session,payment_intent_id=p_intent,paid_at=p_paid_at where id=o.id;
 if o.commission is not null then
 insert into public.comissoes(estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,taxa_aplicada,tipo_comissao,valor_comissao,status)
 values(o.estabelecimento_id,c.agenda_event_id,(o.commission->>'pro')::uuid,(o.commission->>'sid')::uuid,(o.commission->>'base')::numeric,(o.commission->>'rate')::numeric,o.commission->>'type',(o.commission->>'amount')::numeric,'pendente');
 end if;
end $$;
revoke all on function public.settle_connect_order(uuid,text,text,text,bigint,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_connect_order(uuid,text,text,text,bigint,integer,timestamptz) to service_role;

create function public.expire_connect_order(p_id uuid,p_account text,p_session text) returns void language plpgsql security invoker set search_path='' as $$
declare o public.connect_orders; c public.caixa_itens; item record; begin
 select * into o from public.connect_orders where id=p_id for update;
 if not found or o.account_id<>p_account or o.session_id is distinct from p_session then raise exception 'Pedido divergente'; end if;
 if o.status<>'pending' then return; end if;
 select * into c from public.caixa_itens where id=o.id for update;
 -- Products were reserved transactionally; restore once after Stripe confirms expiration.
 for item in select produto_id,quantidade from public.caixa_produtos where caixa_item_id=c.id loop
 update public.produtos set estoque=estoque+item.quantidade where id=item.produto_id and estabelecimento_id=o.estabelecimento_id;
 end loop;
 update public.caixa_itens set status_caixa='cancelado' where id=c.id;
 update public.agenda_events set cobranca_enviada=false,cobranca_enviada_at=null where id=c.agenda_event_id;
 update public.connect_orders set status='expired' where id=o.id;
end $$;
revoke all on function public.expire_connect_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.expire_connect_order(uuid,text,text) to service_role;

-- Online settlement cannot be forged by the browser's broad legacy cash policy.
create function public.guard_connect_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.payment_provider='stripe_connect' and current_user in ('authenticated','anon') then
 if (new.status_caixa,new.valor_total,new.pago_em,new.payment_provider,new.cliente_id,new.estabelecimento_id,new.servicos,new.sessao_id) is distinct from
 (old.status_caixa,old.valor_total,old.pago_em,old.payment_provider,old.cliente_id,old.estabelecimento_id,old.servicos,old.sessao_id) then
 raise exception 'Cobranças online são atualizadas pela confirmação Stripe' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_connect_receipt() from public,anon,authenticated;
create trigger guard_connect_receipt before update on public.caixa_itens for each row execute function public.guard_connect_receipt();

create or replace function public.cash_overview(p_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'; begin
 if not public.can_operate_cash(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 select jsonb_build_object('since',today,'checked_at',now(),
 'received',coalesce((select sum(c.valor_total-coalesce(o.refunded_cents,0)/100.0) from public.caixa_itens c left join public.connect_orders o on o.id=c.id where c.estabelecimento_id=p_tenant and c.status_caixa='pago' and c.pago_em>=today),0),
 'pending',coalesce((select sum(coalesce(a.valor_total,s.preco,0)) from public.agenda_events a left join public.servicos s on s.id=a.servico_id where a.estabelecimento_id=p_tenant and a.status='concluido' and not coalesce(a.cobranca_enviada,false)),0)+coalesce((select sum(amount_cents)/100.0 from public.connect_orders where estabelecimento_id=p_tenant and status='pending'),0),
 'withdrawals',coalesce((select sum(m.valor) from public.caixa_movimentacoes m join public.caixa_sessoes s on s.id=m.sessao_id where s.estabelecimento_id=p_tenant and m.tipo='sangria' and m.created_at>=today),0),
 'commissions',coalesce((select jsonb_agg(x) from (select c.profissional_id,p.nome,sum(c.valor_comissao) amount from public.comissoes c join public.profissionais p on p.id=c.profissional_id where c.estabelecimento_id=p_tenant and c.created_at>=today and c.status<>'cancelado' group by c.profissional_id,p.nome)x),'[]')) into result;
 return result;
end $$;
revoke all on function public.cash_overview(uuid) from public,anon;
grant execute on function public.cash_overview(uuid) to authenticated;

