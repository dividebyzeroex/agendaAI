-- ==========================================
-- AgendaAi — Stripe Integration Schema
-- Execute no SQL Editor do Supabase
-- ==========================================

-- Adiciona campos para faturamento via Stripe
ALTER TABLE public.estabelecimento
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plano text DEFAULT 'trial';

-- Índice para busca rápida nos webhooks do Stripe
CREATE INDEX IF NOT EXISTS idx_estabelecimento_stripe_customer ON public.estabelecimento(stripe_customer_id);

COMMENT ON COLUMN public.estabelecimento.stripe_customer_id IS 'ID do cliente no Stripe para faturamento recorrente.';
COMMENT ON COLUMN public.estabelecimento.stripe_subscription_id IS 'ID da assinatura ativa no Stripe.';
COMMENT ON COLUMN public.estabelecimento.plano IS 'ID do plano atual (1_month, 3_months, 6_months, 12_months).';
