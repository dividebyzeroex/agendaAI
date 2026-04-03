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
