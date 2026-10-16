-- Business modules are additive. Writes are only through the validated command API.
create function public.business_owner(t uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.estabelecimento e where e.id=t and e.user_id=auth.uid() and e.active and greatest(e.trial_ends_at,e.plano_expires_at)>now());
$$;
revoke all on function public.business_owner(uuid) from public,anon;
grant execute on function public.business_owner(uuid) to authenticated;
create table public.business_settings(estabelecimento_id uuid primary key references public.estabelecimento(id), approval_required boolean not null default false, headline text not null default '', gallery jsonb not null default '[]', updated_at timestamptz not null default now());
create table public.walkin_queue(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), cliente_id uuid not null references public.clientes(id), servico_id uuid not null references public.servicos(id), preferred_professional uuid references public.profissionais(id), status text not null default 'waiting' check(status in ('waiting','assigned','cancelled')), event_id uuid references public.agenda_events(id), request_key uuid not null, created_at timestamptz not null default now(), unique(estabelecimento_id,request_key));
create unique index walkin_waiting_customer on public.walkin_queue(estabelecimento_id,cliente_id) where status='waiting';
create index walkin_tenant_status on public.walkin_queue(estabelecimento_id,status,created_at);
create table public.professional_rotation(estabelecimento_id uuid not null references public.estabelecimento(id), profissional_id uuid not null references public.profissionais(id), active boolean not null default true, last_called timestamptz, joined_at timestamptz not null default now(), primary key(estabelecimento_id,profissional_id));
create table public.service_bundles(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), servico_id uuid not null references public.servicos(id), title text not null check(length(title) between 2 and 120), kind text not null check(kind in ('package','membership')), sessions integer not null check(sessions between 1 and 100), price numeric(12,2) not null check(price>1 and price<=100000), validity_days integer not null check(validity_days between 1 and 730), active boolean not null default true, created_at timestamptz not null default now());
create table public.customer_passes(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), cliente_id uuid not null references public.clientes(id), bundle_id uuid not null references public.service_bundles(id), servico_id uuid not null references public.servicos(id), title text not null, kind text not null, sessions integer not null, remaining integer not null check(remaining>=0), price numeric(12,2) not null, validity_days integer not null, status text not null default 'pending' check(status in ('pending','active','refund_pending','cancelled','expired')), expires_at timestamptz, receipt_id uuid unique references public.caixa_itens(id), request_key uuid not null, token uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now(), unique(estabelecimento_id,request_key));
create index customer_passes_tenant on public.customer_passes(estabelecimento_id,cliente_id,status);
create table public.pass_redemptions(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), pass_id uuid not null references public.customer_passes(id), event_id uuid not null unique references public.agenda_events(id), receipt_id uuid not null references public.caixa_itens(id), reversed_at timestamptz, created_at timestamptz not null default now());
create index pass_redemptions_tenant on public.pass_redemptions(estabelecimento_id,pass_id);
create table public.service_feedback(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), event_id uuid not null unique references public.agenda_events(id), token uuid not null unique default gen_random_uuid(), rating integer check(rating between 1 and 5), comment text check(length(comment)<=2000), submitted_at timestamptz, created_at timestamptz not null default now());
create index service_feedback_tenant on public.service_feedback(estabelecimento_id,created_at desc);
create table public.financial_titles(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), kind text not null check(kind in ('payable','receivable')), description text not null check(length(description) between 2 and 200), category text not null check(length(category) between 2 and 100), amount numeric(12,2) not null check(amount>0 and amount<=1000000), settled numeric(12,2) not null default 0 check(settled>=0 and settled<=amount), due_date date not null, competence date not null, cancelled boolean not null default false, request_key uuid not null, created_at timestamptz not null default now(), unique(estabelecimento_id,request_key));
create table public.financial_settlements(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), title_id uuid not null references public.financial_titles(id), amount numeric(12,2) not null check(amount>0), payment_method text not null check(payment_method in ('dinheiro','pix','cartao_credito','cartao_debito','transferencia')), paid_at timestamptz not null default now(), request_key uuid not null, unique(estabelecimento_id,request_key));
create index financial_titles_tenant_due on public.financial_titles(estabelecimento_id,due_date);
create index financial_settlements_tenant on public.financial_settlements(estabelecimento_id,title_id);
alter table public.produtos add column minimum_stock integer not null default 0 check(minimum_stock>=0), add column unit_cost numeric(12,2) not null default 0 check(unit_cost>=0);
create table public.inventory_movements(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), produto_id uuid not null references public.produtos(id), quantity integer not null check(quantity<>0), unit_cost numeric(12,2) not null check(unit_cost>=0), reason text not null check(length(reason) between 2 and 200), event_id uuid references public.agenda_events(id), request_key uuid not null, created_at timestamptz not null default now(), unique(estabelecimento_id,request_key,produto_id));
create index inventory_movements_tenant on public.inventory_movements(estabelecimento_id,created_at desc);
create table public.service_supplies(estabelecimento_id uuid not null references public.estabelecimento(id), servico_id uuid not null references public.servicos(id), produto_id uuid not null references public.produtos(id), quantity integer not null check(quantity between 1 and 1000), primary key(estabelecimento_id,servico_id,produto_id));
create table public.client_pets(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), cliente_id uuid not null references public.clientes(id), name text not null check(length(name) between 1 and 100), species text not null check(length(species) between 1 and 100), breed text not null default '', notes text not null default '' check(length(notes)<=2000), created_at timestamptz not null default now());
create table public.intake_templates(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), title text not null check(length(title) between 2 and 120), questions jsonb not null, version integer not null default 1, created_at timestamptz not null default now());
create table public.client_intakes(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), cliente_id uuid not null references public.clientes(id), pet_id uuid references public.client_pets(id), template_id uuid not null references public.intake_templates(id), template_snapshot jsonb not null, answers jsonb not null, consent_at timestamptz not null, created_by uuid not null, created_at timestamptz not null default now());
create index client_intakes_tenant on public.client_intakes(estabelecimento_id,cliente_id);
create index client_pets_tenant on public.client_pets(estabelecimento_id,cliente_id);
create index intake_templates_tenant on public.intake_templates(estabelecimento_id);
create table public.client_contact_preferences(estabelecimento_id uuid not null references public.estabelecimento(id), cliente_id uuid not null references public.clientes(id), channel text not null check(channel in ('email','sms','whatsapp')), consent boolean not null default false, evidence text not null check(length(evidence) between 2 and 500), updated_at timestamptz not null default now(), primary key(estabelecimento_id,cliente_id,channel));
create table public.client_campaigns(id uuid primary key default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), title text not null check(length(title) between 2 and 120), segment text not null check(segment in ('inactive','birthday','all')), channel text not null check(channel in ('email','sms','whatsapp')), message text not null check(length(message) between 5 and 2000), due_at timestamptz not null, status text not null default 'draft' check(status in ('draft','ready','scheduled','cancelled')), created_at timestamptz not null default now());
create table public.campaign_recipients(id uuid primary key default gen_random_uuid(), token uuid not null unique default gen_random_uuid(), estabelecimento_id uuid not null references public.estabelecimento(id), campaign_id uuid not null references public.client_campaigns(id), cliente_id uuid not null references public.clientes(id), status text not null default 'pending' check(status in ('pending','sending','sent','failed','suppressed')), provider_id text, sent_at timestamptz, created_at timestamptz not null default now(), unique(campaign_id,cliente_id));
create index campaign_recipients_tenant on public.campaign_recipients(estabelecimento_id,campaign_id);
create index client_campaigns_tenant on public.client_campaigns(estabelecimento_id,created_at desc);
-- Default grants can exist in Supabase. Revoke them explicitly for every new table.
do $$ declare n text; begin
 foreach n in array array['business_settings','walkin_queue','professional_rotation','service_bundles','customer_passes','pass_redemptions','service_feedback','financial_titles','financial_settlements','inventory_movements','service_supplies','client_pets','intake_templates','client_intakes','client_contact_preferences','client_campaigns','campaign_recipients'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select on public.%I to authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 if n in ('walkin_queue','professional_rotation','customer_passes','pass_redemptions','service_bundles') then
 execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_operate_cash(estabelecimento_id))',n);
 else
 execute format('create policy owner_read on public.%I for select to authenticated using(public.business_owner(estabelecimento_id))',n);
 end if;
 end loop;
end $$;
-- Privileged implementation kept outside the exposed schema. Both entry points enforce caller identity.
create function private.business_operation(t uuid, action text, d jsonb, k uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
 v_num:=round(pass.price/pass.sessions,2);
 insert into public.caixa_itens(estabelecimento_id,cliente_id,cliente_nome,agenda_event_id,servicos,valor_total,status_caixa,forma_pagamento,pago_em,origem) select t,pass.cliente_id,c.nome,ev.id,jsonb_build_array(jsonb_build_object('titulo',pass.title||' · sessão utilizada','preco',0)),0,'pago','pacote',now(),'resgate' from public.clientes c where c.id=pass.cliente_id returning * into receipt;
 update public.customer_passes set remaining=remaining-1 where id=pass.id;
 update public.agenda_events set cobranca_enviada=true,cobranca_enviada_at=now(),valor_total=0,metadata=coalesce(metadata,'{}')||jsonb_build_object('pass_id',pass.id) where id=ev.id;
 if ev.profissional_id is not null then insert into public.comissoes(estabelecimento_id,evento_id,profissional_id,servico_id,valor_servico,taxa_aplicada,tipo_comissao,valor_comissao,status) values(t,ev.id,ev.profissional_id,ev.servico_id,v_num,coalesce(rule.taxa_comissao,0),coalesce(rule.tipo_comissao,'percentual'),case when rule.tipo_comissao='fixo' then coalesce(rule.taxa_comissao,0) else round(v_num*coalesce(rule.taxa_comissao,0)/100,2) end,'pendente'); end if;
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
end $$;
revoke all on function private.business_operation(uuid,text,jsonb,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.business_operation(uuid,text,jsonb,uuid) to authenticated;
create function public.business_operation(p_tenant uuid,p_action text,p_data jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$select private.business_operation(p_tenant,p_action,p_data,p_key)$$;
revoke all on function public.business_operation(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.business_operation(uuid,text,jsonb,uuid) to authenticated;
-- Payment confirmation activates purchased sessions; redirects never activate a pass.
create function private.sync_pass_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.customer_passes; begin
 select * into p from public.customer_passes where receipt_id=new.id for update;
 if found and new.status_caixa='cancelado' and new.payment_provider is distinct from 'stripe_connect' and p.remaining<p.sessions then raise exception 'Estorne as sessões utilizadas antes de devolver o valor do pacote'; end if;
 if new.status_caixa='pago' and old.status_caixa is distinct from 'pago' then update public.customer_passes set status='active',expires_at=coalesce(expires_at,now()+make_interval(days=>validity_days)) where receipt_id=new.id and status='pending';
 elsif new.status_caixa='cancelado' then update public.customer_passes set status='cancelled' where receipt_id=new.id; end if;
 return new;
end $$;
revoke all on function private.sync_pass_receipt() from public,anon,authenticated;
create trigger sync_pass_receipt after update of status_caixa on public.caixa_itens for each row execute function private.sync_pass_receipt();
-- Token endpoints are service-only and return no customer contact or health data.
create function public.submit_service_feedback(p_token uuid,p_rating integer,p_comment text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.service_feedback; begin
 select * into f from public.service_feedback where token=p_token for update;
 if not found or f.created_at<now()-interval '30 days' then raise exception 'Link inválido ou expirado'; end if;
 if f.submitted_at is not null then return jsonb_build_object('received',true); end if;
 if p_rating not between 1 and 5 or p_rating is null or length(coalesce(p_comment,''))>2000 then raise exception 'Avaliação inválida'; end if;
 update public.service_feedback set rating=p_rating,comment=coalesce(p_comment,''),submitted_at=now() where id=f.id;
 return jsonb_build_object('received',true);
end $$;
revoke all on function public.submit_service_feedback(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.submit_service_feedback(uuid,integer,text) to service_role;
notify pgrst,'reload schema';

create function public.business_public_page(p_tenant uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('headline',coalesce(s.headline,''),'gallery',coalesce(s.gallery,'[]'),'approval_required',coalesce(s.approval_required,false)) from public.estabelecimento e left join public.business_settings s on s.estabelecimento_id=e.id where e.id=p_tenant and e.active and nullif(e.slug,'') is not null;
$$;
revoke all on function public.business_public_page(uuid) from public;
grant execute on function public.business_public_page(uuid) to anon,authenticated;

create function public.unsubscribe_campaign(p_token uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.campaign_recipients; ch text; begin
 select * into r from public.campaign_recipients where token=p_token;
 if not found then raise exception 'Link indisponível'; end if;
 select channel into ch from public.client_campaigns where id=r.campaign_id;
 update public.client_contact_preferences set consent=false,evidence='Cancelado pelo link da mensagem',updated_at=now() where estabelecimento_id=r.estabelecimento_id and cliente_id=r.cliente_id and channel=ch;
 update public.campaign_recipients set status='suppressed' where estabelecimento_id=r.estabelecimento_id and cliente_id=r.cliente_id and status='pending' and campaign_id in(select id from public.client_campaigns where estabelecimento_id=r.estabelecimento_id and channel=ch);
 return jsonb_build_object('received',true);
end $$;
revoke all on function public.unsubscribe_campaign(uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_campaign(uuid) to service_role;

-- Freeze rights before a provider refund request; uncertain outcomes cannot be redeemed.
create function public.prepare_pass_refund(p_receipt uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.customer_passes; begin
 select * into p from public.customer_passes where receipt_id=p_receipt for update;
 if not found then return false; end if;
 if p.remaining<p.sessions then raise exception 'Estorne as sessões utilizadas antes de reembolsar o pacote'; end if;
 if p.status not in ('active','refund_pending') then raise exception 'Pacote indisponível para reembolso'; end if;
 update public.customer_passes set status='refund_pending' where id=p.id;
 return true;
end $$;
revoke all on function public.prepare_pass_refund(uuid) from public,anon,authenticated;
grant execute on function public.prepare_pass_refund(uuid) to service_role;
