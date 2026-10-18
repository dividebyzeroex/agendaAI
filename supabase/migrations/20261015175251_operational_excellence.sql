-- Additive operational changes; no legacy financial history is rewritten.
alter table public.caixa_itens add column checkout_key uuid;
create unique index cash_checkout_key on public.caixa_itens(estabelecimento_id,checkout_key) where checkout_key is not null;
create index cash_event_lookup on public.caixa_itens(agenda_event_id,status_caixa);

create function public.can_operate_cash(p_estab uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.estabelecimento e where e.id=p_estab and e.active
 and greatest(e.trial_ends_at,e.plano_expires_at)>now() and (e.user_id=auth.uid() or exists(
 select 1 from public.profissionais p where p.estabelecimento_id=e.id and p.user_id=auth.uid() and p.ativo and p.role::text in ('dono','financeiro','recepcionista','secretaria','admin'))));
$$;
revoke all on function public.can_operate_cash(uuid) from public,anon;
grant execute on function public.can_operate_cash(uuid) to authenticated;
-- Replace broad legacy financial policies with the existing tenant/role model.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('caixa_sessoes','caixa_movimentacoes','caixa_itens','comissoes') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
create policy cash_sessions_access on public.caixa_sessoes for all to authenticated using(public.can_operate_cash(estabelecimento_id)) with check(public.can_operate_cash(estabelecimento_id));
create policy cash_items_access on public.caixa_itens for all to authenticated using(public.can_operate_cash(estabelecimento_id)) with check(public.can_operate_cash(estabelecimento_id));
create policy cash_moves_access on public.caixa_movimentacoes for all to authenticated using(exists(select 1 from public.caixa_sessoes s where s.id=sessao_id and public.can_operate_cash(s.estabelecimento_id))) with check(exists(select 1 from public.caixa_sessoes s where s.id=sessao_id and public.can_operate_cash(s.estabelecimento_id)));
create policy commission_access on public.comissoes for all to authenticated using(public.can_operate_cash(estabelecimento_id)) with check(public.can_operate_cash(estabelecimento_id));

create function public.checkout_atomic(p_data jsonb,p_key uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 t uuid:=(p_data->>'estabelecimentoId')::uuid; ev uuid:=nullif(p_data->>'eventId','')::uuid;
 c public.caixa_itens; s public.caixa_sessoes; a public.agenda_events; service public.servicos; prod public.produtos;
 rule public.profissional_servicos; item jsonb; services jsonb:='[]'; total numeric:=0; discount numeric:=0; commission numeric:=0;
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
 if found then return to_jsonb(c); end if;
 if a.cobranca_enviada then raise exception 'Atendimento já registrado. Confira a comanda existente.'; end if;
 pro:=a.profissional_id; sid:=a.servico_id;
 if customer is distinct from a.cliente_id then raise exception 'Cliente diferente do atendimento'; end if;
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
 values(t,p_key,ev,customer,left(p_data->>'clienteNome',200),services,total,left(p_data->>'profissional',200),'pago',p_data->>'formaPagamento',now(),discount,s.id,case when ev is null then 'avulso' else 'agenda' end,left(p_data->>'comandaFisica',100),left(p_data->>'emailCliente',254)) returning * into c;
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
 insert into public.caixa_movimentacoes(sessao_id,caixa_item_id,tipo,forma_pagamento,valor,descricao,operador_nome)
 values(s.id,c.id,'venda',c.forma_pagamento,c.valor_total,'Venda registrada',s.operador_nome);
 if ev is not null then
 update public.agenda_events set status='concluido',cobranca_enviada=true,cobranca_enviada_at=now(),valor_total=c.valor_total where id=ev;
 if pro is not null and sid is not null then
 insert into public.comissoes(estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,taxa_aplicada,tipo_comissao,valor_comissao,status)
 values(t,ev,pro,sid,coalesce((services->0->>'preco')::numeric,0)-discount,coalesce(rule.taxa_comissao,0),coalesce(rule.tipo_comissao,'percentual'),commission,'pendente');
 end if; end if;
 return to_jsonb(c);
end $$;
revoke all on function public.checkout_atomic(jsonb,uuid) from public,anon;
grant execute on function public.checkout_atomic(jsonb,uuid) to authenticated;

create function public.close_cash_atomic(p_session uuid,p_counted numeric) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.caixa_sessoes; expected numeric; begin
 select * into s from public.caixa_sessoes where id=p_session for update;
 if not found or not public.can_operate_cash(s.estabelecimento_id) then raise exception 'Caixa indisponível' using errcode='42501'; end if;
 if s.status='fechado' then return to_jsonb(s); end if;
 if p_counted is null or p_counted not between 0 and 100000000 then raise exception 'Informe o valor contado'; end if;
 -- Legacy opening movements already include the initial balance. Do not count twice.
 select coalesce(sum(case when tipo in ('venda','suprimento') then valor else -valor end),0)
 +case when exists(select 1 from public.caixa_movimentacoes where sessao_id=s.id and descricao='Troco inicial de abertura' and tipo='suprimento') then 0 else coalesce(s.saldo_inicial,0) end
 into expected from public.caixa_movimentacoes where sessao_id=s.id and forma_pagamento='dinheiro';
 update public.caixa_sessoes set status='fechado',data_fechamento=now(),saldo_final_calculado=expected,saldo_final_informado=p_counted,
 observacoes=case when expected=p_counted then '' else 'Diferença de caixa registrada.' end where id=s.id returning * into s;
 return to_jsonb(s);
end $$;
revoke all on function public.close_cash_atomic(uuid,numeric) from public,anon;
grant execute on function public.close_cash_atomic(uuid,numeric) to authenticated;

create function public.cash_overview(p_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'; begin
 if not public.can_operate_cash(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 select jsonb_build_object('since',today,'checked_at',now(),
 'received',coalesce((select sum(valor_total) from public.caixa_itens where estabelecimento_id=p_tenant and status_caixa='pago' and pago_em>=today),0),
 'pending',coalesce((select sum(coalesce(a.valor_total,s.preco,0)) from public.agenda_events a left join public.servicos s on s.id=a.servico_id where a.estabelecimento_id=p_tenant and a.status='concluido' and not coalesce(a.cobranca_enviada,false)),0),
 'withdrawals',coalesce((select sum(m.valor) from public.caixa_movimentacoes m join public.caixa_sessoes s on s.id=m.sessao_id where s.estabelecimento_id=p_tenant and m.tipo='sangria' and m.created_at>=today),0),
 'commissions',coalesce((select jsonb_agg(x) from (select c.profissional_id,p.nome,sum(c.valor_comissao) amount from public.comissoes c join public.profissionais p on p.id=c.profissional_id where c.estabelecimento_id=p_tenant and c.created_at>=today and c.status<>'cancelado' group by c.profissional_id,p.nome)x),'[]')) into result;
 return result;
end $$;
revoke all on function public.cash_overview(uuid) from public,anon;
grant execute on function public.cash_overview(uuid) to authenticated;

-- Durable operational SMS outbox. Off by default; provider verification is required by the worker.
create table public.appointment_messaging_settings(estabelecimento_id uuid primary key references public.estabelecimento(id),enabled boolean not null default false);
alter table public.appointment_messaging_settings enable row level security;
grant select,insert,update on public.appointment_messaging_settings to authenticated;
create policy message_settings on public.appointment_messaging_settings for all to authenticated using(public.can_operate_cash(estabelecimento_id)) with check(public.can_operate_cash(estabelecimento_id));
create table public.appointment_messages(
 id uuid primary key default gen_random_uuid(),estabelecimento_id uuid not null references public.estabelecimento(id),event_id uuid not null references public.agenda_events(id) on delete cascade,
 kind text not null check(kind in ('created','changed','canceled','reminder')),event_start timestamptz not null,event_end timestamptz not null,
 due_at timestamptz not null,status text not null default 'queued' check(status in ('queued','sending','sent','failed','suppressed')),
 provider_id text,error text,locked_at timestamptz,sent_at timestamptz,created_at timestamptz not null default now(),
 unique(event_id,kind,event_start,event_end));
alter table public.appointment_messages enable row level security;
grant select on public.appointment_messages to authenticated;
grant all on public.appointment_messages,public.appointment_messaging_settings to service_role;
create policy message_read on public.appointment_messages for select to authenticated using(public.can_operate_cash(estabelecimento_id));
create index appointment_messages_due on public.appointment_messages(status,due_at);
create function public.queue_appointment_message() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; begin
 if tg_op='UPDATE' then
 if (new.start,new."end",new.status) is not distinct from (old.start,old."end",old.status) then return new; end if;
 update public.appointment_messages set status='suppressed',error='Agendamento alterado' where event_id=new.id and status='queued';
 end if;
 if not exists(select 1 from public.appointment_messaging_settings where estabelecimento_id=new.estabelecimento_id and enabled) then return new; end if;
 if new.status in ('concluido','noshow') then return new; end if;
 k:=case when new.status='cancelado' then 'canceled' when tg_op='INSERT' then 'created' else 'changed' end;
 insert into public.appointment_messages(estabelecimento_id,event_id,kind,event_start,event_end,due_at) values(new.estabelecimento_id,new.id,k,new.start,new."end",now()) on conflict do nothing;
 if new.status in ('confirmado','pendente') then
 insert into public.appointment_messages(estabelecimento_id,event_id,kind,event_start,event_end,due_at) values(new.estabelecimento_id,new.id,'reminder',new.start,new."end",greatest(now(),new.start-interval '24 hours')) on conflict do nothing;
 end if; return new;
end $$;
revoke all on function public.queue_appointment_message() from public,anon,authenticated;
create trigger queue_appointment_message after insert or update on public.agenda_events for each row execute function public.queue_appointment_message();
-- Narrow worker-only capability. Key never reaches browsers, logs or queue rows.
create function public.appointment_message_context(p_message uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('phone',c.telefone,'key',v.decrypted_secret,'opt_out',coalesce(c.metadata->>'sms_opt_out','false')='true','business',e.nome,'start',a.start,'end',a."end",'status',a.status,'enabled',s.enabled,'active',e.active,'access_until',greatest(e.trial_ends_at,e.plano_expires_at))
 from public.appointment_messages m join public.agenda_events a on a.id=m.event_id join public.clientes c on c.id=a.cliente_id and c.estabelecimento_id=m.estabelecimento_id
 join public.estabelecimento e on e.id=m.estabelecimento_id join public.appointment_messaging_settings s on s.estabelecimento_id=e.id
 left join vault.decrypted_secrets v on v.name='est_key_'||e.id
 where m.id=p_message and m.status='sending';
$$;
revoke all on function public.appointment_message_context(uuid) from public,anon,authenticated;
grant execute on function public.appointment_message_context(uuid) to service_role;

create policy commission_self_read on public.comissoes for select to authenticated using(exists(select 1 from public.profissionais p where p.id=profissional_id and p.user_id=auth.uid() and p.ativo));
create function public.create_agenda_series(p_data jsonb,p_count integer,p_days integer,p_key uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t uuid:=(p_data->>'estabelecimento_id')::uuid; result jsonb:='[]'; e public.agenda_events; i int; begin
 if auth.uid() is null or t not in (select public.get_meus_estabelecimentos()) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if p_count not between 1 and 12 or p_days not in (7,14,28) or p_key is null then raise exception 'Recorrência inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('series:'||p_key::text,0));
 select jsonb_agg(to_jsonb(a) order by a.start) into result from public.agenda_events a where a.estabelecimento_id=t and a.metadata->>'series_key'=p_key::text;
 if result is not null then return result; end if;
 result:='[]';
 for i in 0..p_count-1 loop
 select * into e from public.create_agenda_event_safe(p_data || jsonb_build_object('start',(p_data->>'start')::timestamptz+make_interval(days=>i*p_days),'end',(p_data->>'end')::timestamptz+make_interval(days=>i*p_days),'metadata',coalesce(p_data->'metadata','{}')||jsonb_build_object('series_key',p_key,'series_index',i)));
 result:=result||jsonb_build_array(to_jsonb(e));
 end loop; return result;
end $$;
revoke all on function public.create_agenda_series(jsonb,integer,integer,uuid) from public,anon;
grant execute on function public.create_agenda_series(jsonb,integer,integer,uuid) to authenticated;

create function public.open_cash_atomic(p_tenant uuid,p_initial numeric,p_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.caixa_sessoes; begin
 if not public.can_operate_cash(p_tenant) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if p_initial is null or p_initial not between 0 and 100000000 then raise exception 'Saldo inicial inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('open_cash:'||p_tenant::text,0));
 select * into s from public.caixa_sessoes where estabelecimento_id=p_tenant and status='aberto' order by data_abertura desc limit 1;
 if found then return to_jsonb(s); end if;
 insert into public.caixa_sessoes(estabelecimento_id,operador_id,operador_nome,saldo_inicial,status) values(p_tenant,auth.uid(),left(p_name,200),p_initial,'aberto') returning * into s;
 return to_jsonb(s);
end $$;
revoke all on function public.open_cash_atomic(uuid,numeric,text) from public,anon;
grant execute on function public.open_cash_atomic(uuid,numeric,text) to authenticated;

create function public.guard_cash_move() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.caixa_sessoes; begin
 select * into s from public.caixa_sessoes where id=new.sessao_id for update;
 if s.status is distinct from 'aberto' then raise exception 'Caixa fechado; abra uma nova sessão'; end if;
 if new.valor is null or new.valor<=0 then raise exception 'Valor inválido'; end if;
 return new;
end $$;
revoke all on function public.guard_cash_move() from public,anon,authenticated;
create trigger guard_cash_move before insert on public.caixa_movimentacoes for each row execute function public.guard_cash_move();

create function public.tenant_operational_progress(p_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; begin
 base:=public.tenant_activation_summary(p_tenant);
 return base || jsonb_build_object('first_completed',exists(select 1 from public.agenda_events a where a.estabelecimento_id=p_tenant and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'first_received',case when public.can_operate_cash(p_tenant) then exists(select 1 from public.caixa_itens c join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=p_tenant and c.status_caixa='pago' and c.pago_em is not null and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true') else null end);
end $$;
revoke all on function public.tenant_operational_progress(uuid) from public,anon;
grant execute on function public.tenant_operational_progress(uuid) to authenticated;

alter function public.owner_business_snapshot(integer) rename to owner_business_snapshot_base;
revoke all on function public.owner_business_snapshot_base(integer) from public,anon,authenticated;
create function public.owner_business_snapshot(p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; tenants jsonb; begin
 if not private.is_platform_owner() then raise exception 'Acesso exclusivo do proprietário' using errcode='42501'; end if;
 base:=public.owner_business_snapshot_base(p_days);
 select coalesce(jsonb_agg(t || jsonb_build_object(
 'completed_bookings',(select count(*) from public.agenda_events a where a.estabelecimento_id=(t->>'id')::uuid and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'received_bookings',(select count(distinct a.id) from public.caixa_itens c join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=(t->>'id')::uuid and c.status_caixa='pago' and c.pago_em is not null and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'),
 'first_value_at',(select min(c.pago_em) from public.caixa_itens c join public.agenda_events a on a.id=c.agenda_event_id where c.estabelecimento_id=(t->>'id')::uuid and c.status_caixa='pago' and c.pago_em is not null and a.status='concluido' and coalesce(a.metadata->>'demo','false')<>'true' and coalesce(a.metadata->>'test','false')<>'true'))),'[]') into tenants from jsonb_array_elements(base->'tenants') t;
 return jsonb_set(base,'{tenants}',tenants);
end $$;
revoke all on function public.owner_business_snapshot(integer) from public,anon;
grant execute on function public.owner_business_snapshot(integer) to authenticated;

alter table public.caixa_movimentacoes add column reversal_of uuid references public.caixa_movimentacoes(id);
create unique index cash_reversal_once on public.caixa_movimentacoes(reversal_of) where reversal_of is not null;
create function public.reverse_cash_atomic(p_movement uuid,p_session uuid) returns uuid language plpgsql security invoker set search_path='' as $$
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
 if exists(select 1 from public.comissoes where evento_id=receipt.agenda_event_id and status='pago') then raise exception 'Há comissão paga. Revise o pagamento da equipe antes de estornar.'; end if;
 insert into public.caixa_movimentacoes(sessao_id,caixa_item_id,tipo,forma_pagamento,valor,descricao,operador_nome,reversal_of)
 values(current_session.id,receipt.id,'estorno',original.forma_pagamento,original.valor,'Estorno de venda',current_session.operador_nome,original.id) returning id into existing;
 update public.caixa_itens set status_caixa='cancelado' where id=receipt.id;
 update public.comissoes set status='cancelado' where evento_id=receipt.agenda_event_id and status='pendente';
 return existing;
end $$;
revoke all on function public.reverse_cash_atomic(uuid,uuid) from public,anon;
grant execute on function public.reverse_cash_atomic(uuid,uuid) to authenticated;
