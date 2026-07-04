-- ============================================================
-- AgendaAi — Supabase Schema Completo
-- Execute este script no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/vvanjarfwdxtzklogysy/sql/new
-- ============================================================

-- 1. ESTABELECIMENTO (configurações do negócio)
create table if not exists public.estabelecimento (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Meu Negócio',
  telefone text,
  endereco text,
  cidade text,
  logo_url text,
  created_at timestamptz default now()
);

-- 2. SERVIÇOS (catálogo de serviços oferecidos)
create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  preco numeric(10,2) not null default 0,
  duracao_min int not null default 30,
  emoji text default '✂️',
  ativo boolean default true,
  created_at timestamptz default now()
);

-- 3. CLIENTES
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  ultima_visita date,
  faltas int default 0,
  created_at timestamptz default now()
);

-- 4. AGENDA_EVENTS (agendamentos)
create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start timestamptz not null,
  "end" timestamptz not null,
  "backgroundColor" text default '#1a73e8',
  "allDay" boolean default false,
  cliente_id uuid references public.clientes(id) on delete set null,
  servico_id uuid references public.servicos(id) on delete set null,
  profissional_id uuid references public.profissionais(id) on delete set null,
  status text default 'confirmado' check (status in ('confirmado', 'pendente', 'cancelado', 'concluido', 'noshow', 'em_atendimento')),
  status_confirmacao text default 'pendente' check (status_confirmacao in ('pendente', 'aceito', 'recusado')),
  token_confirmacao uuid default gen_random_uuid(),
  observacoes text,
  created_at timestamptz default now()
);

-- 5. HORARIOS_FUNCIONAMENTO (horários de abertura por dia)
create table if not exists public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=Dom, 1=Seg...6=Sab
  dia_nome text not null,
  abre time,
  fecha time,
  ativo boolean default true
);

-- 6. WORKFLOWS (regras de automação)
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger text not null check (trigger in ('ON_EVENT_CREATED', 'ON_EVENT_CANCELED')),
  action text not null check (action in ('SEND_SMS', 'SEND_EMAIL', 'NOTIFY_ADMIN')),
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- SEED DATA — Dados iniciais para o negócio funcionar
-- ============================================================

-- Estabelecimento padrão
insert into public.estabelecimento (nome, telefone, cidade)
values ('Barbearia Moderna', '(11) 99999-8888', 'São Paulo - SP')
on conflict do nothing;

-- Serviços padrão
insert into public.servicos (titulo, descricao, preco, duracao_min, emoji) values
  ('Corte Social', 'Corte masculino moderno com acabamento perfeito.', 45.00, 40, '✂️'),
  ('Corte + Barba', 'Combo completo: corte e barba modelada.', 70.00, 70, '🪒'),
  ('Barba', 'Barba modelada com navalha e finalizador.', 35.00, 30, '🧔'),
  ('Sobrancelha', 'Design e modelagem de sobrancelha masculina.', 20.00, 15, '👁️'),
  ('Hidratação Capilar', 'Tratamento profundo para cabelos ressecados.', 50.00, 45, '💧'),
  ('Coloração', 'Coloração completa com produtos premium.', 80.00, 90, '🎨')
on conflict do nothing;

-- Horários padrão (Seg-Sab)
insert into public.horarios_funcionamento (dia_semana, dia_nome, abre, fecha, ativo) values
  (0, 'Domingo',      null,    null,    false),
  (1, 'Segunda-feira','09:00', '19:00', true),
  (2, 'Terça-feira',  '09:00', '19:00', true),
  (3, 'Quarta-feira', '09:00', '19:00', true),
  (4, 'Quinta-feira', '09:00', '19:00', true),
  (5, 'Sexta-feira',  '09:00', '20:00', true),
  (6, 'Sábado',       '09:00', '16:00', true)
on conflict do nothing;

-- Workflows padrão
insert into public.workflows (name, trigger, action, active) values
  ('Lembrete de Confirmação', 'ON_EVENT_CREATED', 'SEND_SMS', true),
  ('Alerta de Cancelamento',  'ON_EVENT_CANCELED', 'NOTIFY_ADMIN', false)
on conflict do nothing;

-- ============================================================
-- RLS (Row Level Security) — Segurança
-- ============================================================
alter table public.estabelecimento enable row level security;
alter table public.servicos enable row level security;
alter table public.clientes enable row level security;
alter table public.agenda_events enable row level security;
alter table public.horarios_funcionamento enable row level security;
alter table public.workflows enable row level security;

-- Políticas READ públicas (portal do cliente pode ver serviços e horários)
create policy "Serviços públicos" on public.servicos for select using (true);
create policy "Horários públicos" on public.horarios_funcionamento for select using (true);
create policy "Estabelecimento público" on public.estabelecimento for select using (true);

-- Políticas para clientes autenticados verem e criarem agendamentos
create policy "Clientes podem criar agenda" on public.agenda_events
  for insert with check (true);

create policy "Agenda pública read" on public.agenda_events
  for select using (true);

-- Políticas admin (usuário autenticado) para tudo mais
create policy "Admin clientes" on public.clientes
  for all using (auth.role() = 'authenticated');

create policy "Admin workflows" on public.workflows
  for all using (auth.role() = 'authenticated');

create policy "Admin agenda update/delete" on public.agenda_events
  for update using (auth.role() = 'authenticated');

create policy "Admin agenda delete" on public.agenda_events
  for delete using (auth.role() = 'authenticated');
-- ============================================================
-- AgendaAi — Módulo de Profissionais
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela de profissionais
CREATE TABLE IF NOT EXISTS public.profissionais (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  nome             text    NOT NULL,
  especialidade    text,
  bio              text,
  foto_url         text,
  telefone         text,
  email            text,
  cor_agenda       text    DEFAULT '#1a73e8',  -- cor na agenda
  valor_hora       numeric(10,2) DEFAULT 0,
  ativo            boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- Disponibilidades do profissional (por dia da semana)
CREATE TABLE IF NOT EXISTS public.profissional_disponibilidades (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id  uuid    REFERENCES public.profissionais(id) ON DELETE CASCADE,
  dia_semana       int     NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  dia_nome         text    NOT NULL,
  ativo            boolean DEFAULT true,
  hora_inicio      time,
  hora_fim         time
);

-- Especializações/habilidades do profissional
CREATE TABLE IF NOT EXISTS public.profissional_servicos (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id  uuid    REFERENCES public.profissionais(id) ON DELETE CASCADE,
  servico_id       uuid    REFERENCES public.servicos(id) ON DELETE CASCADE,
  valor_proprio    numeric(10,2),  -- pode ter valor diferente do serviço padrão
  UNIQUE(profissional_id, servico_id)
);

-- RLS: SELECT público (para o portal do profissional e agendamento)
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_disponibilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pub_select_profissionais"          ON public.profissionais;
DROP POLICY IF EXISTS "pub_select_prof_disp"             ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "pub_select_prof_servicos"         ON public.profissional_servicos;
DROP POLICY IF EXISTS "admin_all_profissionais"          ON public.profissionais;
DROP POLICY IF EXISTS "admin_all_prof_disp"              ON public.profissional_disponibilidades;
DROP POLICY IF EXISTS "admin_all_prof_servicos"          ON public.profissional_servicos;

CREATE POLICY "pub_select_profissionais"  ON public.profissionais
  FOR SELECT USING (ativo = true);

CREATE POLICY "pub_select_prof_disp" ON public.profissional_disponibilidades
  FOR SELECT USING (true);

CREATE POLICY "pub_select_prof_servicos" ON public.profissional_servicos
  FOR SELECT USING (true);

CREATE POLICY "admin_all_profissionais"  ON public.profissionais
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_prof_disp" ON public.profissional_disponibilidades
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_prof_servicos" ON public.profissional_servicos
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed: disponibilidades padrão para novos profissionais (via trigger optional)
-- Verificação
SELECT 'profissionais' AS tabela, COUNT(*) FROM public.profissionais;
-- ==========================================================
-- BUNDLE DE SEGURANÇA AVANÇADA: VAULT, RLS & RPC (POST) 🛡️
-- Execute este script no SQL Editor do seu Dashboard Supabase.
-- ==========================================================

-- 1. HABILITAR EXTENSÕES E AJUSTAR SCHEMA
create extension if not exists "supabase_vault" cascade;
create extension if not exists "pgcrypto";

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, authenticated, anon, service_role;

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

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'est_key_' || p_establishment_id;
  
  if v_key is null then
    v_key := encode(extensions.gen_random_bytes(32), 'base64');
    -- Usar a função oficial para criar segredos (Resolve erro de permissão _crypto_aead_det_encrypt)
    perform vault.create_secret(v_key, 'est_key_' || p_establishment_id, 'Chave mestra Zero-Knowledge para o estabelecimento ' || p_establishment_id);
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
    nascimento = coalesce((p_changes->>'nascimento')::date, nascimento),
    observacoes = coalesce(p_changes->>'observacoes', observacoes),
    ultima_visita = coalesce((p_changes->>'ultima_visita')::timestamptz, ultima_visita),
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
    start = coalesce((p_changes->>'start')::timestamptz, start),
    "end" = coalesce((p_changes->>'end')::timestamptz, "end"),
    status = coalesce(p_changes->>'status', status),
    observacoes = coalesce(p_changes->>'observacoes', observacoes),
    profissional_id = coalesce((p_changes->>'profissional_id')::uuid, profissional_id)
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
    (r->>'hora_inicio')::time,
    (r->>'hora_fim')::time,
    (r->>'intervalo_inicio')::time,
    (r->>'intervalo_fim')::time
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
    (p_data->>'nascimento')::date,
    p_data->>'observacoes',
    (p_data->>'ultima_visita')::timestamp,
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





-- ============================================================
-- AgendaAi — Sprint 1 & 2: Novas tabelas e funções
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/vvanjarfwdxtzklogysy/sql/new
-- ============================================================

-- ─── 1. Adicionar campo 'plano' ao estabelecimento ────────────────────────

ALTER TABLE public.estabelecimento
  ADD COLUMN IF NOT EXISTS plano text DEFAULT 'starter'
  CHECK (plano IN ('starter', 'pro', 'business'));

-- ─── 2. Tabela de quotas de uso por plano ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_quotas (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  estabelecimento_id   uuid REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
  resource             text NOT NULL CHECK (resource IN ('agendamentos', 'sms', 'automacoes')),
  month                text NOT NULL,     -- formato "2026-04"
  count                integer DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),

  UNIQUE (estabelecimento_id, resource, month)
);

-- RLS: cada estabelecimento vê apenas suas quotas
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticado gerencia suas quotas"
  ON public.usage_quotas FOR ALL
  USING (
    estabelecimento_id IN (
      SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    estabelecimento_id IN (
      SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
    )
  );

-- Função atômica para incrementar e retornar o novo valor
-- Garante que dois agentes simultâneos não incrementem duas vezes
CREATE OR REPLACE FUNCTION public.increment_usage_quota(
  p_estabelecimento_id uuid,
  p_resource           text,
  p_month              text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.usage_quotas (estabelecimento_id, resource, month, count)
  VALUES (p_estabelecimento_id, p_resource, p_month, 1)
  ON CONFLICT (estabelecimento_id, resource, month)
  DO UPDATE SET
    count      = usage_quotas.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- ─── 3. Tabela de tarefas dos agentes (Agent Task Queue) ──────────────────
-- Implementa o padrão Task Claim do Claude Source Code (inProcessRunner.ts)

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type                 text NOT NULL,
  payload              jsonb DEFAULT '{}',
  status               text DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'done', 'failed')),
  agent_owner          text,              -- ID do agente que fez o "claim"
  estabelecimento_id   uuid REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
  created_at           timestamptz DEFAULT now(),
  completed_at         timestamptz,
  error_message        text
);

CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON public.agent_tasks(status);
CREATE INDEX IF NOT EXISTS agent_tasks_estab_idx  ON public.agent_tasks(estabelecimento_id);

-- RLS: agentes autenticados gerenciam tasks do seu estabelecimento
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticado gerencia agent_tasks"
  ON public.agent_tasks FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── 4. Tabela de mailbox dos agentes ─────────────────────────────────────
-- Persiste mensagens entre agentes (mailbox do Claude Source)

CREATE TABLE IF NOT EXISTS public.agent_mailbox (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "from"      text NOT NULL,
  "to"        text NOT NULL,
  text        text NOT NULL,
  read        boolean DEFAULT false,
  color       text,
  timestamp   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_mailbox_to_idx  ON public.agent_mailbox("to");
CREATE INDEX IF NOT EXISTS agent_mailbox_read_idx ON public.agent_mailbox(read);

-- RLS: apenas usuários autenticados acessam mailbox
ALTER TABLE public.agent_mailbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticado gerencia mailbox"
  ON public.agent_mailbox FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ─── 5. Limpeza automática de mailbox (mensagens > 7 dias) ────────────────
-- Evita acúmulo ilimitado de mensagens de agentes

CREATE OR REPLACE FUNCTION public.cleanup_agent_mailbox()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.agent_mailbox
  WHERE "timestamp" < now() - INTERVAL '7 days'
    AND read = true;
END;
$$;

-- ─── 6. Adicionar campo message_template nos workflows ────────────────────

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS message_template text,
  ADD COLUMN IF NOT EXISTS tag_value        text;

-- ─── Verificação final ────────────────────────────────────────────────────
SELECT 
  'usage_quotas'  AS tabela, COUNT(*) FROM public.usage_quotas UNION ALL
  SELECT 'agent_tasks',   COUNT(*) FROM public.agent_tasks   UNION ALL
  SELECT 'agent_mailbox', COUNT(*) FROM public.agent_mailbox;
-- Migration: 2026-04-03 14:15 - Chatbot Integrations (FIXED TABLE NAME)
-- Create a table to store social media integration tokens and configuration.
-- Corrected table reference: public.estabelecimento (singular)

CREATE TABLE IF NOT EXISTS public.chatbot_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'facebook', 'instagram')),
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    config JSONB DEFAULT '{}'::jsonb, -- Stores Phone ID, Messaging ID, Access Token, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(establishment_id, channel)
);

-- Enable RLS
ALTER TABLE public.chatbot_integrations ENABLE ROW LEVEL SECURITY;

-- Policy: Establishments can only manage their own chatbot integrations
-- Assuming user_id exists in public.estabelecimento
DROP POLICY IF EXISTS "Establishments can manage their own chatbot integrations" ON public.chatbot_integrations;
CREATE POLICY "Establishments can manage their own chatbot integrations"
ON public.chatbot_integrations
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.estabelecimento 
        WHERE id = chatbot_integrations.establishment_id 
        AND user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_chatbot_integrations_updated_at ON public.chatbot_integrations;
CREATE TRIGGER update_chatbot_integrations_updated_at
    BEFORE UPDATE ON public.chatbot_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
-- Tabela para armazenar os códigos de segurança temporários dos profissionais
CREATE TABLE IF NOT EXISTS public.profissional_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Segurança de Nível de Linha)
ALTER TABLE public.profissional_otps ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
CREATE POLICY "Permitir leitura de OTP por pro_id" 
ON public.profissional_otps FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção de OTP" 
ON public.profissional_otps FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir exclusão de OTP usado" 
ON public.profissional_otps FOR DELETE 
USING (true);
-- EXPANSÃO DE SOBERANIA DE DADOS - AGENDAAI

-- 1. Remoção de Vínculo de Serviço
CREATE OR REPLACE FUNCTION remover_profissional_servico(p_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM profissional_servicos WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Finalizar Onboarding (Soberano)
CREATE OR REPLACE FUNCTION set_onboarding_concluido(p_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE profissionais 
    SET onboarding_concluido = true, 
        primeiro_acesso = false,
        updated_at = now()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar Campos de Controle (RBAC/Status)
CREATE OR REPLACE FUNCTION update_profissional_controles(
    p_id UUID,
    p_changes JSONB
) RETURNS VOID AS $$
BEGIN
    UPDATE profissionais 
    SET 
        role = COALESCE((p_changes->>'role')::user_role, role),
        ativo = COALESCE((p_changes->>'ativo')::boolean, ativo),
        auth_type = COALESCE((p_changes->>'auth_type'), auth_type),
        comissao_padrao = COALESCE((p_changes->>'comissao_padrao')::numeric, comissao_padrao),
        valor_hora = COALESCE((p_changes->>'valor_hora')::numeric, valor_hora),
        cor_agenda = COALESCE((p_changes->>'cor_agenda'), cor_agenda),
        especialidade = COALESCE((p_changes->>'especialidade'), especialidade),
        data_contratacao = COALESCE((p_changes->>'data_contratacao')::date, data_contratacao),
        foto_url = COALESCE((p_changes->>'foto_url'), foto_url)
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função RPC: Upsert Profissional Completo (Re-validada)
CREATE OR REPLACE FUNCTION upsert_profissional_completo(
    p_id UUID,
    p_estabelecimento_id UUID,
    p_nome TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_cargo TEXT,
    p_foto_url TEXT,
    p_servicos_ids UUID[]
) RETURNS JSON AS $$
DECLARE
    v_prof_id UUID;
BEGIN
    INSERT INTO profissionais (id, estabelecimento_id, nome, email, phone, cargo, foto_url, updated_at)
    VALUES (COALESCE(p_id, gen_random_uuid()), p_estabelecimento_id, p_nome, p_email, p_phone, p_cargo, p_foto_url, now())
    ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        cargo = EXCLUDED.cargo,
        foto_url = EXCLUDED.foto_url,
        updated_at = now()
    RETURNING id INTO v_prof_id;

    DELETE FROM profissional_servicos WHERE profissional_id = v_prof_id;
    INSERT INTO profissional_servicos (profissional_id, servico_id)
    SELECT v_prof_id, UNNEST(p_servicos_ids);

    RETURN json_build_object('id', v_prof_id, 'status', 'success');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Busca Segura de Perfil (Unificação de Identidade)
CREATE OR REPLACE FUNCTION get_user_profile_safe(
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_prof RECORD;
BEGIN
    SELECT id, nome, role, email, telefone, primeiro_acesso, onboarding_concluido
    INTO v_prof
    FROM profissionais
    WHERE (p_user_id IS NOT NULL AND id = p_user_id)
       OR (p_email IS NOT NULL AND email = p_email)
       OR (p_phone IS NOT NULL AND telefone = p_phone)
    LIMIT 1;

    IF v_prof.id IS NOT NULL THEN
        RETURN json_build_object(
            'id', v_prof.id,
            'nome', v_prof.nome,
            'role', v_prof.role,
            'email', v_prof.email,
            'primeiro_acesso', v_prof.primeiro_acesso,
            'onboarding_concluido', v_prof.onboarding_concluido
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Log de Evento de Segurança (Auditoria)
CREATE OR REPLACE FUNCTION log_security_event(
    p_user_id UUID,
    p_estabelecimento_id UUID,
    p_acao TEXT,
    p_detalhes JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO logs_seguranca (user_id, estabelecimento_id, acao, detalhes, ip_address, created_at)
    VALUES (p_user_id, p_estabelecimento_id, p_acao, p_detalhes, inet_client_addr(), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================
-- SUPABASE RBAC CORE & SEGMENTOS
-- Tabelas de Sistema para Papéis e Segmentos Dinâmicos
-- ============================================================

-- 1. Criação das Tabelas de Sistema

CREATE TABLE IF NOT EXISTS public.sys_segmentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    icon TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sys_cargos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    segmento_id UUID REFERENCES public.sys_segmentos(id) ON DELETE CASCADE,
    nome_cargo TEXT NOT NULL,
    role_code TEXT NOT NULL, -- ex: 'dono', 'secretaria', 'operacional'
    nivel_acesso INT NOT NULL DEFAULT 3, -- 1: Dono, 2: Secretaria/Gerente, 3: Operacional
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir que as tabelas sejam acessíveis para leitura pública/autenticada
ALTER TABLE public.sys_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_cargos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública sys_segmentos') THEN
        CREATE POLICY "Leitura pública sys_segmentos" ON public.sys_segmentos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública sys_cargos') THEN
        CREATE POLICY "Leitura pública sys_cargos" ON public.sys_cargos FOR SELECT USING (true);
    END IF;
END $$;
GRANT SELECT ON TABLE public.sys_segmentos TO anon, authenticated;
GRANT SELECT ON TABLE public.sys_cargos TO anon, authenticated;


-- 2. Inserir Dados Base (Seeds)
-- Limpar dados existentes (apenas para ambiente de dev)
TRUNCATE TABLE public.sys_cargos CASCADE;
TRUNCATE TABLE public.sys_segmentos CASCADE;

DO $$ 
DECLARE
    v_seg_barbearia UUID;
    v_seg_beleza UUID;
    v_seg_estetica UUID;
    v_seg_petshop UUID;
    v_seg_tattoo UUID;
    v_seg_geral UUID;
BEGIN
    -- Segmentos
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('barbearia', 'Barbearia', '💈') RETURNING id INTO v_seg_barbearia;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('salao_beleza', 'Salão de Beleza', '💅') RETURNING id INTO v_seg_beleza;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('clinica_estetica', 'Clínica de Estética', '✨') RETURNING id INTO v_seg_estetica;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('petshop', 'Pet Shop / Banho & Tosa', '🐾') RETURNING id INTO v_seg_petshop;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('estudio_tatuagem', 'Estúdio de Tatuagem', '🖋️') RETURNING id INTO v_seg_tattoo;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('generico', 'Outro Segmento / Geral', '🗓️') RETURNING id INTO v_seg_geral;

    -- Cargos: Barbearia
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_barbearia, 'Dono / Proprietário', 'dono', 1),
        (v_seg_barbearia, 'Gerente / Recepção', 'secretaria', 2),
        (v_seg_barbearia, 'Barbeiro Especialista', 'operacional', 3),
        (v_seg_barbearia, 'Auxiliar / Assistente', 'operacional', 3);

    -- Cargos: Salão de Beleza
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_beleza, 'Dono(a)', 'dono', 1),
        (v_seg_beleza, 'Recepcionista', 'secretaria', 2),
        (v_seg_beleza, 'Cabeleireiro(a)', 'operacional', 3),
        (v_seg_beleza, 'Manicure / Pedicure', 'operacional', 3),
        (v_seg_beleza, 'Maquiador(a)', 'operacional', 3);

    -- Cargos: Estética
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_estetica, 'Diretor(a) Clínico', 'dono', 1),
        (v_seg_estetica, 'Secretária', 'secretaria', 2),
        (v_seg_estetica, 'Esteticista', 'operacional', 3),
        (v_seg_estetica, 'Dermatologista', 'operacional', 3),
        (v_seg_estetica, 'Biomédico(a)', 'operacional', 3);

    -- Cargos: Petshop
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_petshop, 'Proprietário', 'dono', 1),
        (v_seg_petshop, 'Atendimento', 'secretaria', 2),
        (v_seg_petshop, 'Banhista / Tosador', 'operacional', 3),
        (v_seg_petshop, 'Veterinário(a)', 'operacional', 3);

    -- Cargos: Tattoo
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_tattoo, 'Dono(a) do Estúdio', 'dono', 1),
        (v_seg_tattoo, 'Atendimento', 'secretaria', 2),
        (v_seg_tattoo, 'Tatuador(a)', 'operacional', 3),
        (v_seg_tattoo, 'Body Piercer', 'operacional', 3);

    -- Cargos: Geral
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_geral, 'Dono(a)', 'dono', 1),
        (v_seg_geral, 'Recepcionista', 'secretaria', 2),
        (v_seg_geral, 'Especialista', 'operacional', 3),
        (v_seg_geral, 'Colaborador', 'operacional', 3);
END $$;


-- 3. Modificações na Tabela de Profissionais
ALTER TABLE IF EXISTS public.profissionais ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- 4. Função: link_user_to_professional
-- Quando o funcionário fizer o primeiro login via Magic Link, vincula sua auth.uid() ao seu perfil de profissional.
CREATE OR REPLACE FUNCTION public.link_user_to_professional(p_professional_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profissionais 
    SET user_id = p_user_id, updated_at = now()
    WHERE id = p_professional_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.link_user_to_professional(UUID, UUID) TO authenticated;


-- 5. Função Utilitária para RLS: get_meus_estabelecimentos()
-- Retorna os estabelecimentos que o usuário atual tem acesso (como dono ou como funcionário)
CREATE OR REPLACE FUNCTION public.get_meus_estabelecimentos()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY 
        SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
        UNION
        SELECT estabelecimento_id FROM public.profissionais WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Atualização de Políticas de RLS
-- Permitir leitura por donos E funcionários
DO $$
BEGIN
    -- Estabelecimento
    DROP POLICY IF EXISTS "Dono gerencia seu estabelecimento" ON public.estabelecimento;
    DROP POLICY IF EXISTS "Acesso Estabelecimento RBAC" ON public.estabelecimento;
    CREATE POLICY "Acesso Estabelecimento RBAC" ON public.estabelecimento 
    FOR ALL USING (id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Agenda
    DROP POLICY IF EXISTS "Isolamento de Agenda por Dono" ON public.agenda_events;
    DROP POLICY IF EXISTS "Acesso Agenda RBAC" ON public.agenda_events;
    CREATE POLICY "Acesso Agenda RBAC" ON public.agenda_events 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Clientes
    DROP POLICY IF EXISTS "Isolamento de Clientes por Dono" ON public.clientes;
    DROP POLICY IF EXISTS "Acesso Clientes RBAC" ON public.clientes;
    CREATE POLICY "Acesso Clientes RBAC" ON public.clientes 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Profissionais
    DROP POLICY IF EXISTS "Isolamento de Profissionais por Dono" ON public.profissionais;
    DROP POLICY IF EXISTS "Acesso Profissionais RBAC" ON public.profissionais;
    CREATE POLICY "Acesso Profissionais RBAC" ON public.profissionais 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));
END $$;


-- 7. Unificação de Identidade (Dono vs Funcionário)
CREATE OR REPLACE FUNCTION get_user_profile_safe(
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_estab RECORD;
    v_prof RECORD;
BEGIN
    -- 1. Tentar encontrar como DONO do estabelecimento
    IF p_user_id IS NOT NULL THEN
        SELECT id, nome, 'dono' as role, onboarding_completo as onboarding_concluido, false as primeiro_acesso
        INTO v_estab
        FROM estabelecimento
        WHERE user_id = p_user_id
        LIMIT 1;

        IF v_estab.id IS NOT NULL THEN
            RETURN json_build_object(
                'id', v_estab.id,
                'nome', v_estab.nome,
                'role', 'dono',
                'email', p_email,
                'primeiro_acesso', false,
                'onboarding_concluido', v_estab.onboarding_concluido
            );
        END IF;
    END IF;

    -- 2. Tentar encontrar como PROFISSIONAL/EQUIPE
    SELECT id, nome, role, email, telefone, primeiro_acesso, onboarding_concluido
    INTO v_prof
    FROM profissionais
    WHERE (p_user_id IS NOT NULL AND user_id = p_user_id) -- Modificado para buscar por user_id, não pelo id do profissional
       OR (p_email IS NOT NULL AND email = p_email)
       OR (p_phone IS NOT NULL AND telefone = p_phone)
    LIMIT 1;

    IF v_prof.id IS NOT NULL THEN
        RETURN json_build_object(
            'id', v_prof.id,
            'nome', v_prof.nome,
            'role', v_prof.role,
            'email', v_prof.email,
            'primeiro_acesso', v_prof.primeiro_acesso,
            'onboarding_concluido', v_prof.onboarding_concluido
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
