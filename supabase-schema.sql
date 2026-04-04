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
