-- 1. Modificar Servicos
ALTER TABLE public.servicos
ADD COLUMN IF NOT EXISTS aceita_pagamento_antecipado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS valor_antecipado numeric(10,2) DEFAULT 0;

-- 2. Modificar Estabelecimento
ALTER TABLE public.estabelecimento
ADD COLUMN IF NOT EXISTS stripe_account_id text,
ADD COLUMN IF NOT EXISTS pagamento_online_ativo boolean DEFAULT false;

-- 3. Modificar Agenda Events
ALTER TABLE public.agenda_events
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pendente' CHECK (payment_status IN ('pendente', 'pago_online', 'pago_local')),
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS stripe_session_id text;

-- 4. Notificações WhatsApp / Zernio
ALTER TABLE public.agenda_events
ADD COLUMN IF NOT EXISTS lembrete_enviado boolean DEFAULT false;
