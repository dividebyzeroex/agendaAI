-- Every reversal / expiry handles all linked service slots, never just the root.
CREATE OR REPLACE FUNCTION public.expire_connect_order(p_id uuid, p_account text, p_session text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 update public.agenda_events set cobranca_enviada=false,cobranca_enviada_at=null
   where estabelecimento_id=o.estabelecimento_id and
   (id=c.agenda_event_id or metadata->>'parent_event_id'=c.agenda_event_id::text);
 update public.connect_orders set status='expired' where id=o.id;
end; $function$;

CREATE OR REPLACE FUNCTION public.reverse_cash_atomic(p_movement uuid, p_session uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare original public.caixa_movimentacoes; current_session public.caixa_sessoes; old_session public.caixa_sessoes; receipt public.caixa_itens; existing uuid; begin
 select * into current_session from public.caixa_sessoes where id=p_session for update;
 if not found or not public.can_operate_cash(current_session.estabelecimento_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into original from public.caixa_movimentacoes where id=p_movement for update;
 if not found or original.tipo<>'venda' then raise exception 'Somente vendas podem ser estornadas por esta ação'; end if;
 select * into old_session from public.caixa_sessoes where id=original.sessao_id;
 if old_session.estabelecimento_id is distinct from current_session.estabelecimento_id then raise exception 'Acesso negado' using errcode='42501'; end if;
 select id into existing from public.caixa_movimentacoes where reversal_of=original.id;
 if found then return existing; end if;
 if current_session.status<>'aberto' then raise exception 'Abra um caixa para registrar o estorno'; end if;
 select * into receipt from public.caixa_itens where id=original.caixa_item_id for update;
 if not found or receipt.status_caixa<>'pago' then raise exception 'Recebimento indisponível para estorno'; end if;
 if exists(
  select 1 from public.comissoes cm
  where cm.estabelecimento_id=receipt.estabelecimento_id and cm.status='pago'
    and (cm.evento_id=receipt.agenda_event_id or cm.evento_id in (
       select e.id from public.agenda_events e
       where e.estabelecimento_id=receipt.estabelecimento_id
         and e.metadata->>'parent_event_id'=receipt.agenda_event_id::text))
 ) then raise exception 'Há comissão paga para um serviço desta comanda. Revise o pagamento da equipe antes de estornar.'; end if;
 insert into public.caixa_movimentacoes(sessao_id,caixa_item_id,tipo,forma_pagamento,valor,descricao,operador_nome,reversal_of)
 values(current_session.id,receipt.id,'estorno',original.forma_pagamento,original.valor,'Estorno de venda',current_session.operador_nome,original.id) returning id into existing;
 update public.caixa_itens set status_caixa='cancelado' where id=receipt.id;
 update public.comissoes cm set status='estornado',cancelled_at=now()
    where cm.estabelecimento_id=receipt.estabelecimento_id
      and cm.status='pendente'
      and (cm.evento_id=receipt.agenda_event_id or cm.evento_id in (
        select e.id from public.agenda_events e
        where e.estabelecimento_id=receipt.estabelecimento_id
          and e.metadata->>'parent_event_id'=receipt.agenda_event_id::text));
 return existing;
end; $function$;
