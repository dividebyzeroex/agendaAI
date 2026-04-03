-- ============================================================
-- AgendaAi — RLS público para o Portal de Agendamento
-- EXECUTE ESTE SCRIPT no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vvanjarfwdxtzklogysy/sql/new
--
-- Este script garante que o portal /agendar/:slug funcione
-- sem autenticação. Ele usa DROP IF EXISTS para ser idempotente.
-- ============================================================

-- ─── Habilitar RLS (caso ainda não esteja) ────────────────
ALTER TABLE public.estabelecimento          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios_funcionamento   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes                 ENABLE ROW LEVEL SECURITY;

-- ─── Remover policies antigas (para recriar sem conflito) ─
DROP POLICY IF EXISTS "Serviços públicos"           ON public.servicos;
DROP POLICY IF EXISTS "Horários públicos"            ON public.horarios_funcionamento;
DROP POLICY IF EXISTS "Estabelecimento público"      ON public.estabelecimento;
DROP POLICY IF EXISTS "Clientes podem criar agenda"  ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda pública read"          ON public.agenda_events;
DROP POLICY IF EXISTS "Admin clientes"               ON public.clientes;
DROP POLICY IF EXISTS "Admin workflows"              ON public.workflows;
DROP POLICY IF EXISTS "Admin agenda update/delete"   ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda delete"          ON public.agenda_events;

-- ─── SELECT público (anon key) ────────────────────────────
-- Portal de agendamento lê estes dados sem login

CREATE POLICY "pub_select_estabelecimento"
  ON public.estabelecimento
  FOR SELECT
  USING (true);  -- qualquer um pode ler nomes e cidades

CREATE POLICY "pub_select_servicos"
  ON public.servicos
  FOR SELECT
  USING (ativo = true);  -- apenas serviços ativos são visíveis

CREATE POLICY "pub_select_horarios"
  ON public.horarios_funcionamento
  FOR SELECT
  USING (true);

CREATE POLICY "pub_select_agenda"
  ON public.agenda_events
  FOR SELECT
  USING (true);  -- slots ocupados visíveis para cálculo de disponibilidade

-- ─── INSERT público na agenda (cliente fazendo agendamento) ─
CREATE POLICY "pub_insert_agenda"
  ON public.agenda_events
  FOR INSERT
  WITH CHECK (true);

-- ─── INSERT público em clientes (pré-cadastro automático) ─
CREATE POLICY "pub_insert_clientes"
  ON public.clientes
  FOR INSERT
  WITH CHECK (true);

-- ─── SELECT em clientes (upsert por telefone) ────────────
CREATE POLICY "pub_select_clientes"
  ON public.clientes
  FOR SELECT
  USING (true);

-- ─── Políticas de administrador (usuário autenticado) ─────

CREATE POLICY "admin_all_estabelecimento"
  ON public.estabelecimento
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_servicos"
  ON public.servicos
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_horarios"
  ON public.horarios_funcionamento
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_all_clientes"
  ON public.clientes
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_update_agenda"
  ON public.agenda_events
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "admin_delete_agenda"
  ON public.agenda_events
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- ─── Verificação ──────────────────────────────────────────
-- Deve retornar dados sem precisar de autenticação
SELECT id, nome, cidade FROM public.estabelecimento LIMIT 3;
SELECT id, titulo, preco FROM public.servicos WHERE ativo = true LIMIT 5;
SELECT dia_nome, abre, fecha FROM public.horarios_funcionamento ORDER BY dia_semana LIMIT 7;
