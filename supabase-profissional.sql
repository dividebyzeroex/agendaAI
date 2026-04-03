-- ============================================================
-- AgendaAi — Portal do Profissional
-- Execute no Supabase SQL Editor antes de usar o /pro
-- ============================================================

-- Novos status de atendimento para agenda_events
ALTER TABLE public.agenda_events
  DROP CONSTRAINT IF EXISTS agenda_events_status_check;

ALTER TABLE public.agenda_events
  ADD CONSTRAINT agenda_events_status_check
  CHECK (status IN ('confirmado', 'pendente', 'cancelado', 'concluido', 'em_atendimento', 'finalizado'));

-- Colunas extras para o fluxo do profissional
ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS servicos_extras  jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS valor_total      numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cobranca_enviada boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobranca_enviada_at timestamptz,
  ADD COLUMN IF NOT EXISTS profissional_nome text;

-- Tabela de itens de caixa (para o caixa do estabelecimento)
CREATE TABLE IF NOT EXISTS public.caixa_itens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agenda_event_id uuid REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  cliente_nome    text NOT NULL,
  servicos        jsonb NOT NULL DEFAULT '[]',
  valor_total     numeric NOT NULL DEFAULT 0,
  status_caixa    text DEFAULT 'pendente'
                  CHECK (status_caixa IN ('pendente', 'pago', 'cancelado')),
  forma_pagamento text,
  profissional    text,
  created_at      timestamptz DEFAULT now(),
  pago_em         timestamptz
);

-- RLS da tabela caixa_itens
ALTER TABLE public.caixa_itens ENABLE ROW LEVEL SECURITY;

-- Profissional (anon) pode INSERT (enviar para caixa)
CREATE POLICY "pub_insert_caixa" ON public.caixa_itens
  FOR INSERT WITH CHECK (true);

-- Qualquer um pode SELECT (caixa lê)
CREATE POLICY "pub_select_caixa" ON public.caixa_itens
  FOR SELECT USING (true);

-- Admin pode UPDATE (marcar pago)
CREATE POLICY "admin_update_caixa" ON public.caixa_itens
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Índice para buscar pendentes rapidamente
CREATE INDEX IF NOT EXISTS caixa_status_idx ON public.caixa_itens(status_caixa);
CREATE INDEX IF NOT EXISTS caixa_event_idx  ON public.caixa_itens(agenda_event_id);

-- Verificação
SELECT 'caixa_itens' AS tabela, COUNT(*) AS registros FROM public.caixa_itens;
