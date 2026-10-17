BEGIN;
-- Commission precedence: service-specific override (including explicit 0) > professional default.
-- Existing link rows were created with a silent DEFAULT 0; NULL now means inherit.
ALTER TABLE public.profissional_servicos ALTER COLUMN taxa_comissao DROP DEFAULT;
COMMENT ON COLUMN public.profissional_servicos.taxa_comissao IS 'NULL = comissão padrão do profissional; valor numérico (inclusive 0) = exceção explícita do serviço.';
-- One confirmed legacy default-zero row for JP/Corte navalha. Do not rewrite intentional overrides elsewhere.
UPDATE public.profissional_servicos SET taxa_comissao = NULL
 WHERE id='a11ff04e-87a0-4d80-8759-c194bee8c996'::uuid
   AND profissional_id='0ac80c09-e137-468b-a189-71d71a5436d8'::uuid
   AND servico_id='7fc39909-7c85-416c-8a7e-375a6182313e'::uuid AND taxa_comissao=0;

CREATE OR REPLACE FUNCTION private.checkout_with_deposit(p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t uuid:=(p_data->>'estabelecimentoId')::uuid; ev uuid:=nullif(p_data->>'eventId','')::uuid;
 c public.caixa_itens; s public.caixa_sessoes; a public.agenda_events; service public.servicos; prod public.produtos;
 rule public.profissional_servicos; item jsonb; services jsonb:='[]'; total numeric:=0; discount numeric:=0; commission numeric:=0; default_rate numeric:=0; effective_rate numeric:=0; effective_type text:='percentual';
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
 select coalesce(p.comissao_padrao,0) into default_rate from public.profissionais p where p.id=pro and p.estabelecimento_id=t;
 effective_rate:=coalesce(rule.taxa_comissao,default_rate,0);
 effective_type:=case when rule.tipo_comissao='fixo' and rule.taxa_comissao is not null then 'fixo' else 'percentual' end;
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
 commission:=case when effective_type='fixo' then effective_rate else round((total-discount)*effective_rate/100,2) end;
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
 values(t,ev,pro,sid,coalesce((services->0->>'preco')::numeric,0)-discount,effective_rate,effective_type,commission,'pendente');
 end if; end if;
 if online then
 if round(c.valor_total*100)<=connected.fee_cents or round(c.valor_total*100)>99999999 then raise exception 'Valor insuficiente para a taxa da plataforma'; end if;
 update public.caixa_itens set payment_provider='stripe_connect' where id=c.id;
 perform public.register_connect_order(c.id);
 end if;
 return to_jsonb(c);
end; $function$;


CREATE OR REPLACE FUNCTION public.register_connect_order(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.caixa_itens; a public.agenda_events; r public.profissional_servicos; linked public.connect_accounts; comm jsonb; base numeric; amount numeric; effective_rate numeric; effective_type text; begin
 select * into c from public.caixa_itens where id=p_id for update;
 if not found or not public.can_operate_cash(c.estabelecimento_id) or c.status_caixa<>'pendente' or c.payment_provider is distinct from 'stripe_connect' then raise exception 'Pedido não autorizado' using errcode='42501'; end if;
 select * into linked from public.connect_accounts where estabelecimento_id=c.estabelecimento_id and enabled and charges_enabled and payouts_enabled;
 if not found then raise exception 'Conta indisponível'; end if;
 select * into a from public.agenda_events where id=c.agenda_event_id and estabelecimento_id=c.estabelecimento_id;
 if a.profissional_id is not null and a.servico_id is not null then
 select * into r from public.profissional_servicos where estabelecimento_id=c.estabelecimento_id and profissional_id=a.profissional_id and servico_id=a.servico_id;
 select coalesce(r.taxa_comissao,p.comissao_padrao,0) into effective_rate from public.profissionais p where p.id=a.profissional_id and p.estabelecimento_id=c.estabelecimento_id;
 if effective_rate is null then raise exception 'Profissional do pedido indisponível'; end if;
 effective_type:=case when r.tipo_comissao='fixo' and r.taxa_comissao is not null then 'fixo' else 'percentual' end;
 base:=coalesce((c.servicos->0->>'preco')::numeric,0)-coalesce(c.desconto,0);
 amount:=case when effective_type='fixo' then effective_rate else round(base*effective_rate/100,2) end;
 comm:=jsonb_build_object('pro',a.profissional_id,'sid',a.servico_id,'base',base,'rate',effective_rate,'type',effective_type,'amount',amount);
 end if;
 insert into public.connect_orders(id,estabelecimento_id,account_id,amount_cents,fee_cents,commission) values(c.id,c.estabelecimento_id,linked.account_id,round(c.valor_total*100),linked.fee_cents,comm) on conflict(id) do nothing;
end; $function$;


CREATE OR REPLACE FUNCTION private.business_operation(t uuid, action text, d jsonb, k uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; q public.walkin_queue; pro public.profissionais; svc public.servicos; customer public.clientes; ev public.agenda_events; bundle public.service_bundles; pass public.customer_passes; receipt public.caixa_itens; drawer public.caixa_sessoes; rule public.profissional_servicos; title public.financial_titles; product public.produtos; redemption public.pass_redemptions; tmpl public.intake_templates; camp public.client_campaigns; v_id uuid; v_num numeric; qty integer; v_when timestamptz; choice uuid; rowitem record;
begin
 if auth.uid() is null or k is null or not public.can_operate_cash(t) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if action not in ('queue-add','queue-cancel','queue-call','rotation','pass-redeem','pass-undo','checkin-link','feedback-link') and not public.business_owner(t) then raise exception 'Ação exclusiva do dono' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business:'||t::text,0));
 if action='settings' then
 if jsonb_array_length(coalesce(d->'gallery','[]'))>12 or length(coalesce(d->>'headline',''))>300 then raise exception 'Conteúdo muito extenso'; end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(d->'gallery','[]')) x where x !~ '^https://[^[:space:]]+$') then raise exception 'Use imagens com endereço HTTPS'; end if;
 insert into public.business_settings(estabelecimento_id,approval_required,headline,gallery) values(t,coalesce((d->>'approval_required')::boolean,false),coalesce(d->>'headline',''),coalesce(d->'gallery','[]')) on conflict(estabelecimento_id) do update set approval_required=excluded.approval_required,headline=excluded.headline,gallery=excluded.gallery,updated_at=now() returning to_jsonb(business_settings.*) into result;
 elsif action='rotation' then
 choice:=(d->>'professional_id')::uuid;
 if not exists(select 1 from public.profissionais where id=choice and estabelecimento_id=t and ativo) then raise exception 'Profissional indisponível'; end if;
 insert into public.professional_rotation(estabelecimento_id,profissional_id,active) values(t,choice,(d->>'active')::boolean) on conflict(estabelecimento_id,profissional_id) do update set active=excluded.active returning to_jsonb(professional_rotation.*) into result;
 elsif action='queue-add' then
 select * into q from public.walkin_queue where estabelecimento_id=t and request_key=k;
 if found then return to_jsonb(q); end if;
 if not exists(select 1 from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t) or not exists(select 1 from public.servicos where id=(d->>'servico_id')::uuid and estabelecimento_id=t and ativo) then raise exception 'Cliente ou serviço indisponível'; end if;
 choice:=nullif(d->>'preferred_professional','')::uuid;
 if choice is not null and not exists(select 1 from public.profissionais where id=choice and estabelecimento_id=t and ativo) then raise exception 'Profissional inválido'; end if;
 insert into public.walkin_queue(estabelecimento_id,cliente_id,servico_id,preferred_professional,request_key) values(t,(d->>'cliente_id')::uuid,(d->>'servico_id')::uuid,choice,k) returning to_jsonb(walkin_queue.*) into result;
 elsif action='queue-cancel' then
 update public.walkin_queue set status='cancelled' where id=(d->>'id')::uuid and estabelecimento_id=t and status='waiting' returning to_jsonb(walkin_queue.*) into result;
 if result is null then raise exception 'Cliente já chamado ou removido'; end if;
 elsif action='queue-call' then
 select * into q from public.walkin_queue where id=(d->>'id')::uuid and estabelecimento_id=t for update;
 if not found then raise exception 'Entrada indisponível'; end if;
 if q.status='assigned' then return to_jsonb(q); end if;
 if q.status<>'waiting' then raise exception 'Entrada cancelada'; end if;
 select * into svc from public.servicos where id=q.servico_id and estabelecimento_id=t and ativo;
 if not found then raise exception 'Serviço indisponível'; end if;
 v_when:=date_trunc('minute',now());
 if not exists(select 1 from public.horarios_funcionamento h where h.estabelecimento_id=t and h.dia_semana=extract(dow from v_when at time zone 'America/Sao_Paulo') and h.ativo and (v_when at time zone 'America/Sao_Paulo')::time>=h.abre::time and ((v_when+make_interval(mins=>svc.duracao_min)) at time zone 'America/Sao_Paulo')::date=(v_when at time zone 'America/Sao_Paulo')::date and ((v_when+make_interval(mins=>svc.duracao_min)) at time zone 'America/Sao_Paulo')::time<=h.fecha::time) then raise exception 'O atendimento não cabe no horário de funcionamento de hoje'; end if;
 -- Professional-specific safe booking validation checks working hours, breaks and exclusions again.
 for pro in select p.* from public.professional_rotation r join public.profissionais p on p.id=r.profissional_id and p.estabelecimento_id=r.estabelecimento_id where r.estabelecimento_id=t and r.active and p.ativo and exists(select 1 from public.profissional_disponibilidades av where av.estabelecimento_id=t and av.profissional_id=p.id and av.dia_semana=extract(dow from v_when at time zone 'America/Sao_Paulo') and av.ativo and (v_when at time zone 'America/Sao_Paulo')::time>=av.hora_inicio and ((v_when+make_interval(mins=>svc.duracao_min)) at time zone 'America/Sao_Paulo')::time<=av.hora_fim and (av.intervalo_inicio is null or av.intervalo_fim is null or ((v_when+make_interval(mins=>svc.duracao_min)) at time zone 'America/Sao_Paulo')::time<=av.intervalo_inicio or (v_when at time zone 'America/Sao_Paulo')::time>=av.intervalo_fim)) and (q.preferred_professional is null or p.id=q.preferred_professional) and exists(select 1 from public.profissional_servicos ps where ps.estabelecimento_id=t and ps.profissional_id=p.id and ps.servico_id=q.servico_id) and not exists(select 1 from public.agenda_events a where a.estabelecimento_id=t and a.profissional_id=p.id and a.status not in ('cancelado','noshow') and a.start<v_when+make_interval(mins=>svc.duracao_min) and a."end">v_when) order by r.last_called nulls first,r.joined_at,p.id loop
  begin
   select * into customer from public.clientes where id=q.cliente_id and estabelecimento_id=t;
   select * into ev from public.create_agenda_event_safe(jsonb_build_object('estabelecimento_id',t,'cliente_id',q.cliente_id,'servico_id',q.servico_id,'profissional_id',pro.id,'profissional_nome',pro.nome,'title',customer.nome,'start',v_when,'end',v_when+make_interval(mins=>svc.duracao_min),'status','em_atendimento','metadata',jsonb_build_object('origin','walkin','queue_id',q.id)));
   update public.agenda_events set profissional_nome=pro.nome where id=ev.id;
   update public.professional_rotation set last_called=now() where estabelecimento_id=t and profissional_id=pro.id;
   update public.walkin_queue set status='assigned',event_id=ev.id where id=q.id returning to_jsonb(walkin_queue.*) into result;
   return result;
  exception when exclusion_violation or raise_exception then null;
  end;
 end loop;
 raise exception 'Nenhum profissional do rodízio está disponível agora para este serviço. Confira expediente e disponibilidade.';
 elsif action in ('feedback-link','checkin-link') then
 select * into ev from public.agenda_events where id=(d->>'event_id')::uuid and estabelecimento_id=t;
 if not found then raise exception 'Atendimento indisponível'; end if;
 if action='feedback-link' then
 if ev.status<>'concluido' then raise exception 'Conclua o atendimento antes de pedir avaliação'; end if;
 insert into public.service_feedback(estabelecimento_id,event_id) values(t,ev.id) on conflict(event_id) do nothing;
 select jsonb_build_object('token',token) into result from public.service_feedback where event_id=ev.id;
 else
 if ev.status not in ('pendente','confirmado') then raise exception 'Atendimento não aceita check-in'; end if;
 result:=jsonb_build_object('token',ev.token_confirmacao);
 end if;
 elsif action='bundle-save' then
 if not exists(select 1 from public.servicos where id=(d->>'servico_id')::uuid and estabelecimento_id=t and ativo) then raise exception 'Serviço indisponível'; end if;
 insert into public.service_bundles(estabelecimento_id,servico_id,title,kind,sessions,price,validity_days) values(t,(d->>'servico_id')::uuid,trim(d->>'title'),d->>'kind',(d->>'sessions')::int,(d->>'price')::numeric,(d->>'validity_days')::int) returning to_jsonb(service_bundles.*) into result;
 elsif action='bundle-toggle' then
 update public.service_bundles set active=(d->>'active')::boolean where id=(d->>'id')::uuid and estabelecimento_id=t returning to_jsonb(service_bundles.*) into result;
 elsif action='pass-sell' then
 select * into pass from public.customer_passes where estabelecimento_id=t and request_key=k;
 if found then select token_publico into v_id from public.caixa_itens where id=pass.receipt_id;return to_jsonb(pass)||jsonb_build_object('receipt_token',v_id); end if;
 select * into bundle from public.service_bundles where id=(d->>'bundle_id')::uuid and estabelecimento_id=t and active;
 if not found then raise exception 'Pacote ou plano indisponível'; end if;
 select * into customer from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t;
 if not found then raise exception 'Cliente indisponível'; end if;
 select * into drawer from public.caixa_sessoes where estabelecimento_id=t and status='aberto' order by data_abertura desc limit 1 for update;
 if not found then raise exception 'Abra o caixa antes de registrar a venda'; end if;
 if coalesce(d->>'payment_method','') not in ('dinheiro','pix','cartao_credito','cartao_debito','online') then raise exception 'Forma de pagamento inválida'; end if;
 if d->>'payment_method'='online' and not exists(select 1 from public.connect_accounts where estabelecimento_id=t and enabled and charges_enabled and payouts_enabled) then raise exception 'Ative os recebimentos online antes de vender por link'; end if;
 insert into public.caixa_itens(estabelecimento_id,checkout_key,cliente_id,cliente_nome,servicos,valor_total,status_caixa,forma_pagamento,pago_em,sessao_id,origem,payment_provider) values(t,k,customer.id,customer.nome,jsonb_build_array(jsonb_build_object('titulo',bundle.title,'preco',bundle.price)),bundle.price,case when d->>'payment_method'='online' then 'pendente' else 'pago' end,case when d->>'payment_method'='online' then 'cartao_credito' else d->>'payment_method' end,case when d->>'payment_method'='online' then null else now() end,drawer.id,'pacote',case when d->>'payment_method'='online' then 'stripe_connect' else null end) returning * into receipt;
 insert into public.customer_passes(estabelecimento_id,cliente_id,bundle_id,servico_id,title,kind,sessions,remaining,price,validity_days,status,expires_at,receipt_id,request_key) values(t,customer.id,bundle.id,bundle.servico_id,bundle.title,bundle.kind,bundle.sessions,bundle.sessions,bundle.price,bundle.validity_days,case when receipt.status_caixa='pago' then 'active' else 'pending' end,case when receipt.status_caixa='pago' then now()+make_interval(days=>bundle.validity_days) else null end,receipt.id,k) returning * into pass;
 if receipt.status_caixa='pago' then
 insert into public.caixa_movimentacoes(sessao_id,caixa_item_id,tipo,forma_pagamento,valor,descricao,operador_nome) values(drawer.id,receipt.id,'venda',receipt.forma_pagamento,receipt.valor_total,'Venda de pacote ou ciclo de clube',drawer.operador_nome);
 else
 insert into public.connect_orders(id,estabelecimento_id,account_id,amount_cents,fee_cents) select receipt.id,t,account_id,round(bundle.price*100)::bigint,fee_cents from public.connect_accounts where estabelecimento_id=t;
 end if;
 return to_jsonb(pass)||jsonb_build_object('receipt_token',receipt.token_publico);
 elsif action='pass-redeem' then
 select * into redemption from public.pass_redemptions where event_id=(d->>'event_id')::uuid and estabelecimento_id=t;
 if found and redemption.reversed_at is null then return to_jsonb(redemption); end if;
 if found then raise exception 'Este atendimento já teve o consumo estornado'; end if;
 select * into pass from public.customer_passes where id=(d->>'pass_id')::uuid and estabelecimento_id=t for update;
 if not found or pass.status<>'active' or pass.expires_at<=now() or pass.remaining<1 then raise exception 'Pacote sem saldo ou vencido'; end if;
 select * into ev from public.agenda_events where id=(d->>'event_id')::uuid and estabelecimento_id=t for update;
 if not found or ev.status<>'concluido' or ev.cliente_id is distinct from pass.cliente_id or ev.servico_id is distinct from pass.servico_id then raise exception 'Atendimento não corresponde ao pacote'; end if;
 if ev.cobranca_enviada or exists(select 1 from public.caixa_itens where agenda_event_id=ev.id and status_caixa<>'cancelado') then raise exception 'Atendimento já recebido ou com cobrança pendente'; end if;
 select * into rule from public.profissional_servicos where estabelecimento_id=t and profissional_id=ev.profissional_id and servico_id=ev.servico_id;
 select * into pro from public.profissionais where id=ev.profissional_id and estabelecimento_id=t;
 v_num:=round(pass.price/pass.sessions,2);
 insert into public.caixa_itens(estabelecimento_id,cliente_id,cliente_nome,agenda_event_id,servicos,valor_total,status_caixa,forma_pagamento,pago_em,origem) select t,pass.cliente_id,c.nome,ev.id,jsonb_build_array(jsonb_build_object('titulo',pass.title||' · sessão utilizada','preco',0)),0,'pago','pacote',now(),'resgate' from public.clientes c where c.id=pass.cliente_id returning * into receipt;
 update public.customer_passes set remaining=remaining-1 where id=pass.id;
 update public.agenda_events set cobranca_enviada=true,cobranca_enviada_at=now(),valor_total=0,metadata=coalesce(metadata,'{}')||jsonb_build_object('pass_id',pass.id) where id=ev.id;
 if ev.profissional_id is not null then insert into public.comissoes(estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,taxa_aplicada,tipo_comissao,valor_comissao,status) values(t,ev.id,ev.profissional_id,ev.servico_id,v_num,coalesce(rule.taxa_comissao,pro.comissao_padrao,0),case when rule.tipo_comissao='fixo' and rule.taxa_comissao is not null then 'fixo' else 'percentual' end,case when rule.tipo_comissao='fixo' and rule.taxa_comissao is not null then rule.taxa_comissao else round(v_num*coalesce(rule.taxa_comissao,pro.comissao_padrao,0)/100,2) end,'pendente'); end if;
 insert into public.pass_redemptions(estabelecimento_id,pass_id,event_id,receipt_id) values(t,pass.id,ev.id,receipt.id) returning to_jsonb(pass_redemptions.*) into result;
 elsif action='pass-undo' then
 select * into redemption from public.pass_redemptions where id=(d->>'id')::uuid and estabelecimento_id=t for update;
 if not found then raise exception 'Consumo indisponível'; end if;
 if redemption.reversed_at is not null then return to_jsonb(redemption); end if;
 if exists(select 1 from public.comissoes where evento_id=redemption.event_id and status='pago') then raise exception 'Revise a comissão já paga antes de estornar'; end if;
 update public.pass_redemptions set reversed_at=now() where id=redemption.id returning to_jsonb(pass_redemptions.*) into result;
 update public.customer_passes set remaining=least(sessions,remaining+1) where id=redemption.pass_id;
 update public.caixa_itens set status_caixa='cancelado' where id=redemption.receipt_id;
 update public.agenda_events set cobranca_enviada=false,cobranca_enviada_at=null where id=redemption.event_id;
 update public.comissoes set status='cancelado' where evento_id=redemption.event_id and status='pendente';
 elsif action='title-add' then
 insert into public.financial_titles(estabelecimento_id,kind,description,category,amount,due_date,competence,request_key) values(t,d->>'kind',trim(d->>'description'),trim(d->>'category'),(d->>'amount')::numeric,(d->>'due_date')::date,(d->>'competence')::date,k) on conflict(estabelecimento_id,request_key) do nothing;
 select to_jsonb(f.*) into result from public.financial_titles f where estabelecimento_id=t and request_key=k;
 elsif action='title-settle' then
 select to_jsonb(s.*) into result from public.financial_settlements s where estabelecimento_id=t and request_key=k;
 if found then return result; end if;
 select * into title from public.financial_titles where id=(d->>'id')::uuid and estabelecimento_id=t for update;
 v_num:=(d->>'amount')::numeric;
 if not found or title.cancelled or v_num is null or v_num<=0 or title.settled+v_num>title.amount then raise exception 'Valor de baixa excede o saldo ou título indisponível'; end if;
 insert into public.financial_settlements(estabelecimento_id,title_id,amount,payment_method,request_key) values(t,title.id,v_num,d->>'payment_method',k) returning to_jsonb(financial_settlements.*) into result;
 update public.financial_titles set settled=settled+v_num where id=title.id;
 elsif action='title-cancel' then
 update public.financial_titles set cancelled=true where id=(d->>'id')::uuid and estabelecimento_id=t and settled=0 returning to_jsonb(financial_titles.*) into result;
 if result is null then raise exception 'Não é possível cancelar um título com baixas'; end if;
 elsif action='stock-config' then
 update public.produtos set minimum_stock=(d->>'minimum_stock')::int,unit_cost=(d->>'unit_cost')::numeric where id=(d->>'id')::uuid and estabelecimento_id=t returning to_jsonb(produtos.*) into result;
 elsif action='stock-move' then
 select to_jsonb(m.*) into result from public.inventory_movements m where estabelecimento_id=t and request_key=k and produto_id=(d->>'produto_id')::uuid;
 if found then return result; end if;
 select * into product from public.produtos where id=(d->>'produto_id')::uuid and estabelecimento_id=t for update;
 qty:=(d->>'quantity')::int;
 if not found or qty is null or qty=0 or abs(qty)>100000 or coalesce(product.estoque,0)+qty<0 then raise exception 'Quantidade inválida ou estoque insuficiente'; end if;
 v_num:=coalesce((d->>'unit_cost')::numeric,product.unit_cost);
 if v_num<0 then raise exception 'Custo inválido'; end if;
 update public.produtos set estoque=coalesce(estoque,0)+qty,unit_cost=case when qty>0 then round((coalesce(estoque,0)*unit_cost+qty*v_num)/(coalesce(estoque,0)+qty),2) else unit_cost end where id=product.id;
 insert into public.inventory_movements(estabelecimento_id,produto_id,quantity,unit_cost,reason,request_key) values(t,product.id,qty,v_num,trim(d->>'reason'),k) returning to_jsonb(inventory_movements.*) into result;
 elsif action='supply-save' then
 if not exists(select 1 from public.produtos where id=(d->>'produto_id')::uuid and estabelecimento_id=t) or not exists(select 1 from public.servicos where id=(d->>'servico_id')::uuid and estabelecimento_id=t) then raise exception 'Produto ou serviço inválido'; end if;
 insert into public.service_supplies(estabelecimento_id,servico_id,produto_id,quantity) values(t,(d->>'servico_id')::uuid,(d->>'produto_id')::uuid,(d->>'quantity')::int) on conflict(estabelecimento_id,servico_id,produto_id) do update set quantity=excluded.quantity returning to_jsonb(service_supplies.*) into result;
 elsif action='supply-consume' then
 select * into ev from public.agenda_events where id=(d->>'event_id')::uuid and estabelecimento_id=t;
 if not found or ev.status<>'concluido' then raise exception 'Conclua o atendimento antes de registrar consumo'; end if;
 for rowitem in select * from public.service_supplies where estabelecimento_id=t and servico_id=ev.servico_id order by produto_id loop
  if exists(select 1 from public.inventory_movements where estabelecimento_id=t and event_id=ev.id and produto_id=rowitem.produto_id) then continue; end if;
  select * into product from public.produtos where id=rowitem.produto_id and estabelecimento_id=t for update;
  if not found or coalesce(product.estoque,0)<rowitem.quantity then raise exception 'Estoque insuficiente para o consumo'; end if;
  update public.produtos set estoque=estoque-rowitem.quantity where id=product.id;
  insert into public.inventory_movements(estabelecimento_id,produto_id,quantity,unit_cost,reason,event_id,request_key) values(t,product.id,-rowitem.quantity,product.unit_cost,'Consumo de insumo no atendimento',ev.id,ev.id);
 end loop;
 result:=jsonb_build_object('ok',true);
 elsif action='pet-add' then
 if not exists(select 1 from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t) then raise exception 'Tutor inválido'; end if;
 insert into public.client_pets(estabelecimento_id,cliente_id,name,species,breed,notes) values(t,(d->>'cliente_id')::uuid,trim(d->>'name'),trim(d->>'species'),coalesce(d->>'breed',''),coalesce(d->>'notes','')) returning to_jsonb(client_pets.*) into result;
 elsif action='template-add' then
 if jsonb_typeof(d->'questions')<>'array' or jsonb_array_length(d->'questions') not between 1 and 30 or exists(select 1 from jsonb_array_elements_text(d->'questions') x where length(x) not between 2 and 300) then raise exception 'Informe de 1 a 30 perguntas'; end if;
 insert into public.intake_templates(estabelecimento_id,title,questions) values(t,trim(d->>'title'),d->'questions') returning to_jsonb(intake_templates.*) into result;
 elsif action='intake-add' then
 select * into tmpl from public.intake_templates where id=(d->>'template_id')::uuid and estabelecimento_id=t;
 if not found or (d->>'consent')::boolean is distinct from true then raise exception 'Selecione uma ficha e registre o consentimento'; end if;
 if not exists(select 1 from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t) then raise exception 'Cliente inválido'; end if;
 choice:=nullif(d->>'pet_id','')::uuid;
 if choice is not null and not exists(select 1 from public.client_pets where id=choice and estabelecimento_id=t and cliente_id=(d->>'cliente_id')::uuid) then raise exception 'Pet não pertence ao tutor'; end if;
 if jsonb_typeof(d->'answers')<>'array' or jsonb_array_length(d->'answers')<>jsonb_array_length(tmpl.questions) or length((d->'answers')::text)>20000 then raise exception 'Confira as respostas da ficha'; end if;
 insert into public.client_intakes(estabelecimento_id,cliente_id,pet_id,template_id,template_snapshot,answers,consent_at,created_by) values(t,(d->>'cliente_id')::uuid,choice,tmpl.id,jsonb_build_object('title',tmpl.title,'version',tmpl.version,'questions',tmpl.questions),d->'answers',now(),auth.uid()) returning to_jsonb(client_intakes.*) into result;
 elsif action='contact-preference' then
 if not exists(select 1 from public.clientes where id=(d->>'cliente_id')::uuid and estabelecimento_id=t) then raise exception 'Cliente inválido'; end if;
 insert into public.client_contact_preferences(estabelecimento_id,cliente_id,channel,consent,evidence) values(t,(d->>'cliente_id')::uuid,d->>'channel',(d->>'consent')::boolean,trim(d->>'evidence')) on conflict(estabelecimento_id,cliente_id,channel) do update set consent=excluded.consent,evidence=excluded.evidence,updated_at=now() returning to_jsonb(client_contact_preferences.*) into result;
 if (d->>'consent')::boolean=false then update public.campaign_recipients set status='suppressed' where estabelecimento_id=t and cliente_id=(d->>'cliente_id')::uuid and status='pending' and campaign_id in(select id from public.client_campaigns where estabelecimento_id=t and channel=d->>'channel'); end if;
 elsif action='campaign-add' then
 insert into public.client_campaigns(estabelecimento_id,title,segment,channel,message,due_at) values(t,trim(d->>'title'),d->>'segment',d->>'channel',trim(d->>'message'),(d->>'due_at')::timestamptz) returning to_jsonb(client_campaigns.*) into result;
 elsif action='campaign-prepare' then
 select * into camp from public.client_campaigns where id=(d->>'id')::uuid and estabelecimento_id=t;
 if not found or camp.status not in ('draft','ready') then raise exception 'Campanha indisponível'; end if;
 insert into public.campaign_recipients(estabelecimento_id,campaign_id,cliente_id)
 select t,camp.id,c.id from public.clientes c join public.client_contact_preferences pref on pref.cliente_id=c.id and pref.estabelecimento_id=t and pref.channel=camp.channel and pref.consent
 where c.estabelecimento_id=t and (camp.segment='all' or (camp.segment='birthday' and extract(month from c.nascimento)=extract(month from camp.due_at at time zone 'America/Sao_Paulo')) or (camp.segment='inactive' and exists(select 1 from public.agenda_events a where a.estabelecimento_id=t and a.cliente_id=c.id and a.status='concluido') and not exists(select 1 from public.agenda_events a where a.estabelecimento_id=t and a.cliente_id=c.id and a.status not in ('cancelado','noshow') and a.start>now()-interval '45 days')))
 on conflict(campaign_id,cliente_id) do nothing;
 update public.client_campaigns set status='ready' where id=camp.id returning to_jsonb(client_campaigns.*) into result;
 elsif action='campaign-cancel' then
 update public.client_campaigns set status='cancelled' where id=(d->>'id')::uuid and estabelecimento_id=t returning to_jsonb(client_campaigns.*) into result;
 update public.campaign_recipients set status='suppressed' where campaign_id=(d->>'id')::uuid and estabelecimento_id=t and status='pending';
 else raise exception 'Ação indisponível';
 end if;
 if result is null then raise exception 'Registro indisponível'; end if;
 return result;
end; $function$;


-- Adjust only JP's two OPEN, unpaid commissions that were captured at 0% by the legacy default.
-- The cancelled/estornado commission is intentionally untouched; paid commissions are never changed.
UPDATE public.comissoes c
SET taxa_aplicada=p.comissao_padrao, valor_comissao=round(c.valor_servico*p.comissao_padrao/100,2)
FROM public.profissionais p
WHERE c.profissional_id=p.id AND c.estabelecimento_id=p.estabelecimento_id
  AND p.id='0ac80c09-e137-468b-a189-71d71a5436d8'::uuid
  AND c.servico_id='7fc39909-7c85-416c-8a7e-375a6182313e'::uuid
  AND c.status='pendente' AND c.tipo_comissao='percentual'
  AND c.taxa_aplicada=0 AND c.valor_comissao=0 AND p.comissao_padrao=13;

COMMIT;
