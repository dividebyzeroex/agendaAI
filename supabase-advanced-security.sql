-- ==========================================================
-- BUNDLE DE SEGURANÇA AVANÇADA: VAULT, RLS & RPC (POST) 🛡️
-- Execute este script no SQL Editor do seu Dashboard Supabase.
-- ==========================================================

-- 1. HABILITAR EXTENSÕES E AJUSTAR SCHEMA
create extension if not exists "supabase_vault" cascade;
create extension if not exists "pgcrypto";

-- Grant usage on schemas to avoid internal permission errors
GRANT USAGE ON SCHEMA vault TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vault TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated, anon, service_role;

-- Adicionar colunas de multitenancy e onboarding em tabelas que podem estar faltando
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS segmento TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS volume_clientes TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS endereco_completo TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS cor_primaria TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS plano TEXT;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS plano_expires_at TIMESTAMP;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS onboarding_completo BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS estabelecimento ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE IF EXISTS clientes ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS agenda_events ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS profissionais ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS profissional_disponibilidades ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS profissional_servicos ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS servicos ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS horarios_funcionamento ADD COLUMN IF NOT EXISTS estabelecimento_id UUID REFERENCES estabelecimento(id) ON DELETE CASCADE;

-- 2. FUNÇÃO DE GESTÃO DE CHAVES NO VAULT (SECURITY DEFINER)
-- Permite que o app RECUPERE ou CRIE chaves AES-256 de forma blindada.
create or replace function get_or_create_establishment_key(p_establishment_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_key text;
  v_user_id uuid;
begin
  select user_id into v_user_id from public.estabelecimento where id = p_establishment_id;
  if v_user_id is null or v_user_id != auth.uid() then
    raise exception 'Acesso negado: Você não tem permissão para gerenciar as chaves deste estabelecimento.';
  end if;

  select secret into v_key from vault.secrets where name = 'est_key_' || p_establishment_id;

  if v_key is null then
    v_key := encode(extensions.gen_random_bytes(32), 'base64');
    insert into vault.secrets (name, secret, description)
    values ('est_key_' || p_establishment_id, v_key, 'Chave mestra Zero-Knowledge para o estabelecimento ' || p_establishment_id);
  end if;

  return v_key;
end;
$$;

-- Garantir permissões para a função de segurança
GRANT EXECUTE ON FUNCTION get_or_create_establishment_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_establishment_key(uuid) TO service_role;

-- 3. HABILITAR RLS (ROW LEVEL SECURITY)
alter table estabelecimento enable row level security;
alter table clientes enable row level security;
alter table agenda_events enable row level security;
alter table profissionais enable row level security;
alter table profissional_disponibilidades enable row level security;
alter table profissional_servicos enable row level security;
alter table servicos enable row level security;
alter table horarios_funcionamento enable row level security;
alter table chatbot_integrations enable row level security;
alter table usage_quotas enable row level security;
alter table agent_mailbox enable row level security;
alter table agent_tasks enable row level security;

-- POLÍTICAS DE ACESSO (ISOLAMENTO DE TENANCY)
DO $$ 
BEGIN 
    -- Estabelecimento
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Dono gerencia seu estabelecimento') THEN
        create policy "Dono gerencia seu estabelecimento" on estabelecimento for all using (auth.uid() = user_id);
    END IF;

    -- Clientes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Isolamento de Clientes por Dono') THEN
        create policy "Isolamento de Clientes por Dono" on clientes for all using (exists (select 1 from estabelecimento where id = clientes.estabelecimento_id and user_id = auth.uid()));
    END IF;

    -- Agenda
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Isolamento de Agenda por Dono') THEN
        create policy "Isolamento de Agenda por Dono" on agenda_events for all using (exists (select 1 from estabelecimento where id = agenda_events.estabelecimento_id and user_id = auth.uid()));
    END IF;

    -- Profissionais
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Isolamento de Profissionais por Dono') THEN
        create policy "Isolamento de Profissionais por Dono" on profissionais for all using (exists (select 1 from estabelecimento where id = profissionais.estabelecimento_id and user_id = auth.uid()));
    END IF;
END $$;

-- 4. FUNÇÕES RPC PARA CONSULTAS VIA POST (PRIVACIDADE DE REDE)
-- Estas funções substituem os SELECTs (GET) por chamas POST que oculam IDs da URL.

create or replace function get_estabelecimento_by_user(p_user_id uuid)
returns setof public.estabelecimento language plpgsql security invoker as $$
begin
  return query select * from public.estabelecimento where user_id = p_user_id;
end; $$;

-- Garantir permissões para as RPCs de consulta
GRANT EXECUTE ON FUNCTION get_profissional_servicos_by_estab(uuid) TO authenticated;

-- Force table visibility and grants
GRANT ALL ON TABLE public.estabelecimento TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.clientes TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.servicos TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.agenda_events TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.profissionais TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.horarios_funcionamento TO authenticated, anon, service_role;

create or replace function get_clientes_by_estab(p_estab_id uuid)
returns setof public.clientes language plpgsql security invoker as $$
begin
  return query select * from public.clientes where estabelecimento_id = p_estab_id order by created_at desc;
end; $$;

create or replace function get_servicos_by_estab(p_estab_id uuid)
returns setof public.servicos language plpgsql security invoker as $$
begin
  return query select * from public.servicos where estabelecimento_id = p_estab_id and ativo = true order by created_at;
end; $$;

create or replace function get_horarios_by_estab(p_estab_id uuid)
returns setof public.horarios_funcionamento language plpgsql security invoker as $$
begin
  return query select * from public.horarios_funcionamento where estabelecimento_id = p_estab_id order by dia_semana;
end; $$;

create or replace function get_agenda_events_by_estab(p_estab_id uuid)
returns setof public.agenda_events language plpgsql security invoker as $$
begin
  return query select * from public.agenda_events where estabelecimento_id = p_estab_id order by start;
end; $$;

create or replace function get_profissionais_by_estab(p_estab_id uuid)
returns setof public.profissionais language plpgsql security invoker as $$
begin
  return query select * from public.profissionais where estabelecimento_id = p_estab_id order by nome;
end; $$;

create or replace function get_profissional_disponibilidades_by_estab(p_estab_id uuid)
returns setof public.profissional_disponibilidades language plpgsql security invoker as $$
begin
  return query select * from public.profissional_disponibilidades where estabelecimento_id = p_estab_id;
end; $$;

create or replace function get_profissional_servicos_by_estab(p_estab_id uuid)
returns setof public.profissional_servicos language plpgsql security invoker as $$
begin
  return query select * from public.profissional_servicos where estabelecimento_id = p_estab_id;
end; $$;

-- PORTAL PÚBLICO
create or replace function get_public_estabelecimento_by_slug(p_slug text)
returns setof public.estabelecimento language plpgsql security invoker as $$
begin
  return query select * from public.estabelecimento where slug = p_slug limit 1;
end; $$;

create or replace function get_public_events_by_day(p_estab_id uuid, p_date_start timestamp, p_date_end timestamp)
returns setof public.agenda_events language plpgsql security invoker as $$
begin
  return query select * from public.agenda_events where estabelecimento_id = p_estab_id and start >= p_date_start and start <= p_date_end;
end; $$;

-- COMPLEMENTO: ONBOARDING E CATÁLOGO (FINAL CLEAN-UP)
create or replace function check_onboarding_status(p_user_id uuid)
returns table (id uuid, onboarding_completo boolean) language plpgsql security invoker as $$
begin
  return query 
  select e.id, e.onboarding_completo 
  from public.estabelecimento e 
  where e.user_id = p_user_id 
  order by e.created_at desc 
  limit 1;
end; $$;

create or replace function get_servicos_by_ids(p_ids uuid[])
returns setof public.servicos language plpgsql security invoker as $$
begin
  return query 
  select * from public.servicos 
  where id = any(p_ids);
end; $$;

-- 5. MUTAÇÕES SEGURAS VIA POST (RPC) - REMOVENDO IDs DA URL
-- Estas funções substituem UPDATE e DELETE para ocultar filtros sensíveis.

create or replace function update_estabelecimento_safe(p_id uuid, p_changes jsonb)
returns setof public.estabelecimento language plpgsql security invoker as $$
begin
  update public.estabelecimento 
  set 
    nome = coalesce(p_changes->>'nome', nome),
    cnpj = coalesce(p_changes->>'cnpj', cnpj),
    segmento = coalesce(p_changes->>'segmento', segmento),
    volume_clientes = coalesce(p_changes->>'volume_clientes', volume_clientes),
    slug = coalesce(p_changes->>'slug', slug),
    descricao = coalesce(p_changes->>'descricao', descricao),
    telefone = coalesce(p_changes->>'telefone', telefone),
    endereco = coalesce(p_changes->>'endereco', endereco),
    endereco_completo = coalesce(p_changes->>'endereco_completo', endereco_completo),
    cidade = coalesce(p_changes->>'cidade', cidade),
    logo_url = coalesce(p_changes->>'logo_url', logo_url),
    cor_primaria = coalesce(p_changes->>'cor_primaria', cor_primaria),
    onboarding_completo = coalesce((p_changes->>'onboarding_completo')::boolean, onboarding_completo)
  where id = p_id;
  return query select * from public.estabelecimento where id = p_id;
end; $$;

create or replace function update_servico_safe(p_id uuid, p_changes jsonb)
returns setof public.servicos language plpgsql security invoker as $$
begin
  update public.servicos 
  set 
    titulo = coalesce(p_changes->>'titulo', titulo),
    descricao = coalesce(p_changes->>'descricao', descricao),
    preco = coalesce((p_changes->>'preco')::numeric, preco),
    duracao_min = coalesce((p_changes->>'duracao_min')::integer, duracao_min),
    emoji = coalesce(p_changes->>'emoji', emoji),
    ativo = coalesce((p_changes->>'ativo')::boolean, ativo)
  where id = p_id;
  return query select * from public.servicos where id = p_id;
end; $$;

create or replace function delete_servico_safe(p_id uuid)
returns boolean language plpgsql security invoker as $$
begin
  update public.servicos set ativo = false where id = p_id;
  return true;
end; $$;

create or replace function update_horario_safe(p_id uuid, p_changes jsonb)
returns setof public.horarios_funcionamento language plpgsql security invoker as $$
begin
  update public.horarios_funcionamento 
  set 
    abre = coalesce(p_changes->>'abre', abre),
    fecha = coalesce(p_changes->>'fecha', fecha),
    ativo = coalesce((p_changes->>'ativo')::boolean, ativo)
  where id = p_id;
  return query select * from public.horarios_funcionamento where id = p_id;
end; $$;

create or replace function update_cliente_safe(p_id uuid, p_changes jsonb)
returns setof public.clientes language plpgsql security invoker as $$
begin
  update public.clientes 
  set 
    nome = coalesce(p_changes->>'nome', nome),
    telefone = coalesce(p_changes->>'telefone', telefone),
    email = coalesce(p_changes->>'email', email),
    nascimento = coalesce(p_changes->>'nascimento', nascimento),
    observacoes = coalesce(p_changes->>'observacoes', observacoes),
    ultima_visita = coalesce(p_changes->>'ultima_visita', ultima_visita),
    faltas = coalesce((p_changes->>'faltas')::integer, faltas)
  where id = p_id;
  return query select * from public.clientes where id = p_id;
end; $$;

create or replace function update_event_safe(p_id uuid, p_changes jsonb)
returns setof public.agenda_events language plpgsql security invoker as $$
begin
  update public.agenda_events 
  set 
    title = coalesce(p_changes->>'title', title),
    start = coalesce(p_changes->>'start', start),
    "end" = coalesce(p_changes->>'end', "end"),
    status = coalesce(p_changes->>'status', status),
    observacoes = coalesce(p_changes->>'observacoes', observacoes)
  where id = p_id;
  return query select * from public.agenda_events where id = p_id;
end; $$;

create or replace function delete_event_safe(p_id uuid)
returns boolean language plpgsql security invoker as $$
begin
  delete from public.agenda_events where id = p_id;
  return true;
end; $$;

create or replace function update_profissional_safe(p_id uuid, p_changes jsonb)
returns setof public.profissionais language plpgsql security invoker as $$
begin
  update public.profissionais 
  set 
    nome = coalesce(p_changes->>'nome', nome),
    cargo = coalesce(p_changes->>'cargo', cargo),
    bio = coalesce(p_changes->>'bio', bio),
    email = coalesce(p_changes->>'email', email),
    telefone = coalesce(p_changes->>'telefone', telefone),
    ativo = coalesce((p_changes->>'ativo')::boolean, ativo)
  where id = p_id;
  return query select * from public.profissionais where id = p_id;
end; $$;

create or replace function delete_profissional_safe(p_id uuid)
returns boolean language plpgsql security invoker as $$
begin
  delete from public.profissionais where id = p_id;
  return true;
end; $$;

create or replace function save_disponibilidades_safe(p_prof_id uuid, p_rows jsonb)
returns boolean language plpgsql security invoker as $$
begin
  delete from public.profissional_disponibilidades where profissional_id = p_prof_id;
  insert into public.profissional_disponibilidades (profissional_id, estabelecimento_id, dia_semana, dia_nome, ativo, hora_inicio, hora_fim, intervalo_inicio, intervalo_fim)
  select 
    p_prof_id, 
    (r->>'estabelecimento_id')::uuid,
    (r->>'dia_semana')::integer,
    r->>'dia_nome',
    (r->>'ativo')::boolean,
    r->>'hora_inicio',
    r->>'hora_fim',
    r->>'intervalo_inicio',
    r->>'intervalo_fim'
  from jsonb_array_elements(p_rows) r;
  return true;
end; $$;

-- 6. CRIAÇÃO SEGURA VIA POST (RPC) - REMOVENDO COLUNAS DA URL
-- Estas funções substituem INSERT para ocultar metadados na URL.

create or replace function create_estabelecimento_safe(p_data jsonb)
returns public.estabelecimento language plpgsql security invoker as $$
declare
  v_res public.estabelecimento;
begin
  insert into public.estabelecimento (nome, cnpj, segmento, volume_clientes, slug, descricao, telefone, endereco, endereco_completo, cidade, logo_url, cor_primaria, onboarding_completo, user_id)
  values (
    p_data->>'nome',
    p_data->>'cnpj',
    p_data->>'segmento',
    p_data->>'volume_clientes',
    p_data->>'slug',
    p_data->>'descricao',
    p_data->>'telefone',
    p_data->>'endereco',
    p_data->>'endereco_completo',
    p_data->>'cidade',
    p_data->>'logo_url',
    p_data->>'cor_primaria',
    coalesce((p_data->>'onboarding_completo')::boolean, false),
    (p_data->>'user_id')::uuid
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function create_servico_safe(p_data jsonb)
returns public.servicos language plpgsql security invoker as $$
declare
  v_res public.servicos;
begin
  insert into public.servicos (estabelecimento_id, titulo, descricao, preco, duracao_min, emoji, ativo)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'titulo',
    p_data->>'descricao',
    (p_data->>'preco')::numeric,
    (p_data->>'duracao_min')::integer,
    p_data->>'emoji',
    coalesce((p_data->>'ativo')::boolean, true)
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function create_cliente_safe(p_data jsonb)
returns public.clientes language plpgsql security invoker as $$
declare
  v_res public.clientes;
begin
  insert into public.clientes (estabelecimento_id, nome, telefone, email, nascimento, observacoes, ultima_visita, faltas)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'nome',
    p_data->>'telefone',
    p_data->>'email',
    p_data->>'nascimento',
    p_data->>'observacoes',
    p_data->>'ultima_visita',
    coalesce((p_data->>'faltas')::integer, 0)
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function create_agenda_event_safe(p_data jsonb)
returns public.agenda_events language plpgsql security invoker as $$
declare
  v_res public.agenda_events;
begin
  insert into public.agenda_events (estabelecimento_id, title, start, "end", status, profissional_id, cliente_id, servico_id, observacoes)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'title',
    (p_data->>'start')::timestamp,
    (p_data->>'end')::timestamp,
    p_data->>'status',
    (p_data->>'profissional_id')::uuid,
    (p_data->>'cliente_id')::uuid,
    (p_data->>'servico_id')::uuid,
    p_data->>'observacoes'
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function create_profissional_safe(p_data jsonb)
returns public.profissionais language plpgsql security invoker as $$
declare
  v_res public.profissionais;
begin
  insert into public.profissionais (estabelecimento_id, nome, cargo, bio, email, telefone, ativo)
  values (
    (p_data->>'estabelecimento_id')::uuid,
    p_data->>'nome',
    p_data->>'cargo',
    p_data->>'bio',
    p_data->>'email',
    p_data->>'telefone',
    coalesce((p_data->>'ativo')::boolean, true)
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function vincular_servico_profissional_safe(p_data jsonb)
returns boolean language plpgsql security invoker as $$
begin
  insert into public.profissional_servicos (profissional_id, servico_id, estabelecimento_id, valor_proprio)
  values (
    (p_data->>'profissional_id')::uuid,
    (p_data->>'servico_id')::uuid,
    (p_data->>'estabelecimento_id')::uuid,
    (p_data->>'valor_proprio')::numeric
  )
  on conflict (profissional_id, servico_id)
  do update set valor_proprio = (p_data->>'valor_proprio')::numeric;
  return true;
end; $$;

-- 7. SERVIÇOS TÉCNICOS VIA POST (RPC) - COTAS, CHATBOT E IA
-- Estas funções garantem que IDs de agentes e métricas não vazem na rede.

create or replace function get_usage_quotas_by_estab(p_estab_id uuid, p_month text)
returns setof public.usage_quotas language plpgsql security invoker as $$
begin
  return query select * from public.usage_quotas where estabelecimento_id = p_estab_id and month = p_month;
end; $$;

create or replace function get_chatbot_integrations_by_estab(p_estab_id uuid)
returns setof public.chatbot_integrations language plpgsql security invoker as $$
begin
  return query select * from public.chatbot_integrations where establishment_id = p_estab_id;
end; $$;

create or replace function upsert_chatbot_integration_safe(p_data jsonb)
returns boolean language plpgsql security invoker as $$
begin
  insert into public.chatbot_integrations (establishment_id, channel, status, config, updated_at)
  values (
    (p_data->>'establishment_id')::uuid,
    (p_data->>'channel'),
    (p_data->>'status'),
    (p_data->>'config')::jsonb,
    now()
  )
  on conflict (establishment_id, channel)
  do update set 
    status = excluded.status,
    config = excluded.config,
    updated_at = now();
  return true;
end; $$;

create or replace function get_agent_mailbox_by_to(p_to text)
returns setof public.agent_mailbox language plpgsql security invoker as $$
begin
  return query select * from public.agent_mailbox where "to" = p_to order by timestamp asc;
end; $$;

create or replace function create_mailbox_message_safe(p_data jsonb)
returns boolean language plpgsql security invoker as $$
begin
  insert into public.agent_mailbox ("from", "to", text, read, timestamp, color)
  values (
    p_data->>'from',
    p_data->>'to',
    p_data->>'text',
    false,
    now(),
    p_data->>'color'
  );
  return true;
end; $$;

create or replace function mark_mailbox_read_safe(p_id uuid)
returns boolean language plpgsql security invoker as $$
begin
  update public.agent_mailbox set read = true where id = p_id;
  return true;
end; $$;

create or replace function get_agent_tasks_safe(p_status text, p_estab_id uuid default null)
returns setof public.agent_tasks language plpgsql security invoker as $$
begin
  if p_estab_id is not null then
    return query select * from public.agent_tasks where status = p_status and (estabelecimento_id = p_estab_id or estabelecimento_id is null) order by created_at asc;
  else
    return query select * from public.agent_tasks where status = p_status order by created_at asc;
  end if;
end; $$;

create or replace function create_agent_task_safe(p_data jsonb)
returns public.agent_tasks language plpgsql security invoker as $$
declare
  v_res public.agent_tasks;
begin
  insert into public.agent_tasks (type, payload, status, estabelecimento_id, created_at)
  values (
    p_data->>'type',
    (p_data->>'payload')::jsonb,
    'pending',
    (p_data->>'estabelecimento_id')::uuid,
    now()
  ) returning * into v_res;
  return v_res;
end; $$;

create or replace function claim_agent_task_atomic(p_id uuid, p_agent_id text)
returns boolean language plpgsql security invoker as $$
declare
  v_count integer;
begin
  update public.agent_tasks 
  set status = 'running', agent_owner = p_agent_id 
  where id = p_id and status = 'pending' and agent_owner is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

create or replace function complete_agent_task_safe(p_id uuid, p_status text)
returns boolean language plpgsql security invoker as $$
begin
  update public.agent_tasks 
  set status = p_status, completed_at = now() 
  where id = p_id;
  return true;
end; $$;





