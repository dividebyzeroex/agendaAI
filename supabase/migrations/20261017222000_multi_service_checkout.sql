-- Must be applied AFTER 20261017210900_commission_rate_inheritance.sql.

-- Preserve existing checkout business rules and add per-service commissions.

-- All values are derived from booked event/service IDs and tenant-scoped catalog prices.

CREATE OR REPLACE FUNCTION private.checkout_with_deposit(p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t uuid:=(p_data->>'estabelecimentoId')::uuid; ev uuid:=nullif(p_data->>'eventId','')::uuid;
 c public.caixa_itens; s public.caixa_sessoes; a public.agenda_events; service public.servicos; prod public.produtos;
 rule public.profissional_servicos; item jsonb; services jsonb:='[]'; total numeric:=0; discount numeric:=0; commission numeric:=0; default_rate numeric:=0; effective_rate numeric:=0; effective_type text:='percentual'; commission_lines jsonb:='[]'; extra_event public.agenda_events; extra_service public.servicos; extra_rule public.profissional_servicos; extra_pro public.profissionais; extra_price numeric; extra_rate numeric; extra_type text; extra_commission numeric; extra_count int:=0; submitted_extras jsonb:=coalesce(p_data->'servicosExtras','[]'::jsonb); line jsonb;
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
 if a.metadata ? 'parent_event_id' then raise exception 'Selecione a comanda principal deste atendimento para receber todos os serviços'; end if;
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
 select coalesce(p.comissao_padrao,0) into default_rate from public.profissionais p where p.id=pro and p.estabelecimento_id=t;
 effective_rate:=coalesce(rule.taxa_comissao,default_rate,0);
 effective_type:=case when rule.tipo_comissao='fixo' and rule.taxa_comissao is not null then 'fixo' else 'percentual' end;
 if rule.valor_proprio is not null then total:=rule.valor_proprio; end if;
 if abs(total-coalesce((p_data->'servicoPrincipal'->>'preco')::numeric,-1))>0.01 then raise exception 'Preço atualizado. Reabra o atendimento para conferir.'; end if;
 services:=jsonb_build_array(jsonb_build_object('titulo',service.titulo,'preco',total,'servico_id',sid,'profissional_id',pro,'agendamento_id',ev));
 end if;
 if jsonb_typeof(submitted_extras)<>'array' then raise exception 'Serviços extras inválidos'; end if;
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
 commission:=case when effective_type='fixo' then effective_rate else round((total-discount)*effective_rate/100,2) end;
 if pro is not null and sid is not null then
  commission_lines:=jsonb_build_array(jsonb_build_object(
    'pro',pro,'sid',sid,'event',ev,'base',total-discount,
    'rate',effective_rate,'type',effective_type,'amount',commission
  ));
 end if;
 -- Each child event is independently scheduled, priced and commissionable.
 -- The cashier cannot add a fictitious price or omit a scheduled service.
 if ev is not null then
  for extra_event in
    select e.* from public.agenda_events e
    where e.estabelecimento_id=t and e.metadata->>'parent_event_id'=ev::text
    and e.status not in ('cancelado','noshow')
    order by e.start,e.id for update
  loop
    extra_count:=extra_count+1;
    if extra_count>7 or extra_event.cliente_id is distinct from customer
      or extra_event.cobranca_enviada or extra_event.profissional_id is null
      or extra_event.servico_id is null then raise exception 'Serviço adicional inválido'; end if;
    if exists (select 1 from public.caixa_itens ci
      where ci.agenda_event_id=extra_event.id and ci.status_caixa<>'cancelado') then
      raise exception 'Um serviço adicional já possui cobrança. Verifique a agenda'; end if;
    select * into extra_service from public.servicos
      where id=extra_event.servico_id and estabelecimento_id=t and ativo;
    select * into extra_pro from public.profissionais
      where id=extra_event.profissional_id and estabelecimento_id=t and ativo;
    if extra_service.id is null or extra_pro.id is null then raise exception 'Serviço ou profissional alterado. Reabra a comanda'; end if;
    select * into extra_rule from public.profissional_servicos
      where estabelecimento_id=t and profissional_id=extra_event.profissional_id
      and servico_id=extra_event.servico_id;
    extra_price:=coalesce(extra_rule.valor_proprio,extra_service.preco);
    extra_rate:=coalesce(extra_rule.taxa_comissao,extra_pro.comissao_padrao,0);
    extra_type:=case when extra_rule.tipo_comissao='fixo' and extra_rule.taxa_comissao is not null then 'fixo' else 'percentual' end;
    extra_commission:=case when extra_type='fixo' then extra_rate else round(extra_price*extra_rate/100,2) end;
    if not exists (
      select 1 from jsonb_array_elements(submitted_extras) v
      where v->>'eventId'=extra_event.id::text
        and (v->>'preco')::numeric=extra_price
    ) then raise exception 'Serviços ou preços mudaram. Reabra a comanda para conferir'; end if;
    services:=services||jsonb_build_array(jsonb_build_object(
      'titulo',extra_service.titulo,'preco',extra_price,
      'servico_id',extra_event.servico_id,'profissional_id',extra_event.profissional_id,
      'agendamento_id',extra_event.id
    ));
    commission_lines:=commission_lines||jsonb_build_array(jsonb_build_object(
      'pro',extra_event.profissional_id,'sid',extra_event.servico_id,'event',extra_event.id,
      'base',extra_price,'rate',extra_rate,'type',extra_type,'amount',extra_commission
    ));
    total:=total+extra_price;
  end loop;
 end if;
 if jsonb_array_length(submitted_extras)<>extra_count then
   raise exception 'A lista de serviços está desatualizada. Reabra o atendimento'; end if;
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
 update public.agenda_events e set status='concluido',cobranca_enviada=true,cobranca_enviada_at=now()
   where e.estabelecimento_id=t and e.metadata->>'parent_event_id'=ev::text
   and e.status not in ('cancelado','noshow');
 if not online then
  for line in select value from jsonb_array_elements(commission_lines) loop
    insert into public.comissoes(
      estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,
      taxa_aplicada,tipo_comissao,valor_comissao,status
    ) values(
      t,(line->>'event')::uuid,(line->>'pro')::uuid,(line->>'sid')::uuid,
      (line->>'base')::numeric,(line->>'rate')::numeric,line->>'type',
      (line->>'amount')::numeric,'pendente'
    );
  end loop;
 end if; end if;
 if online then
 if round(c.valor_total*100)<=connected.fee_cents or round(c.valor_total*100)>99999999 then raise exception 'Valor insuficiente para a taxa da plataforma'; end if;
 update public.caixa_itens set payment_provider='stripe_connect' where id=c.id;
 perform public.register_connect_order(c.id);
 -- Freeze every staff commission before the hosted Stripe session is created.
 update public.connect_orders set commission=commission_lines where id=c.id and status='pending';
 end if;
 return to_jsonb(c);
end; $function$;

CREATE OR REPLACE FUNCTION public.settle_connect_order(p_id uuid, p_account text, p_session text, p_intent text, p_amount bigint, p_fee integer, p_paid_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.connect_orders; c public.caixa_itens; commission_line jsonb; begin
 select * into o from public.connect_orders where id=p_id for update;
 if not found or o.account_id<>p_account or o.amount_cents<>p_amount or o.fee_cents<>p_fee
 or (o.session_id is not null and o.session_id<>p_session) then raise exception 'Pagamento divergente'; end if;
 if o.status in ('paid','refunded','disputed') then return; end if;
 if o.status<>'pending' then raise exception 'Pedido não está pendente'; end if;
 select * into c from public.caixa_itens where id=o.id for update;
 update public.caixa_itens set status_caixa='pago',pago_em=p_paid_at where id=c.id;
 update public.connect_orders set status='paid',session_id=p_session,payment_intent_id=p_intent,paid_at=p_paid_at where id=o.id;
 if o.commission is not null then
  -- Backward compatible with orders created before grouped commissions existed.
  for commission_line in
    select value from jsonb_array_elements(
      case when jsonb_typeof(o.commission)='array' then o.commission
        else jsonb_build_array(o.commission) end
    )
  loop
    insert into public.comissoes(
      estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,
      taxa_aplicada,tipo_comissao,valor_comissao,status
    ) values (
      o.estabelecimento_id,
      coalesce((commission_line->>'event')::uuid,c.agenda_event_id),
      (commission_line->>'pro')::uuid,(commission_line->>'sid')::uuid,
      (commission_line->>'base')::numeric,(commission_line->>'rate')::numeric,
      commission_line->>'type',(commission_line->>'amount')::numeric,'pendente'
    );
  end loop;
 end if;
end; $function$;
