-- ============================================================
-- AgendaAi — Preparação para Produção (Closed Beta)
-- ============================================================

-- 1. Fila de Espera
CREATE TABLE IF NOT EXISTS public.fila_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL,
  data_desejada date NOT NULL,
  status text DEFAULT 'pendente' CHECK (status in ('pendente', 'notificado', 'cancelado')),
  created_at timestamptz DEFAULT now()
);

-- 2. Campos extras no Estabelecimento
ALTER TABLE public.estabelecimento 
ADD COLUMN IF NOT EXISTS plano_ativo text DEFAULT 'free',
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS zernio_channel_id text;

-- 3. Políticas RLS (Segurança) Restritas
-- Vamos reescrever as políticas para garantir o isolamento

-- CLIENTES
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin clientes" ON public.clientes;

CREATE POLICY "Estabelecimento acessa seus clientes"
  ON public.clientes
  FOR ALL
  USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()));

-- SERVICOS
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Serviços públicos" ON public.servicos;

-- Clientes do Zernio e IA acessam serviços (Service Key by-passa RLS, então não afeta a IA)
-- Mas no painel, o dono só vê os seus:
CREATE POLICY "Painel acessa seus serviços"
  ON public.servicos
  FOR ALL
  USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()));
  
-- AGENDA EVENTS
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin agenda update/delete" ON public.agenda_events;
DROP POLICY IF EXISTS "Admin agenda delete" ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda pública read" ON public.agenda_events;
DROP POLICY IF EXISTS "Clientes podem criar agenda" ON public.agenda_events;

CREATE POLICY "Painel acessa sua agenda"
  ON public.agenda_events
  FOR ALL
  USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()));

-- PROFISSIONAIS
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "pub_select_profissionais" ON public.profissionais;

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profissionais' AND column_name = 'estabelecimento_id') THEN
    EXECUTE 'CREATE POLICY "Painel acessa seus profissionais" ON public.profissionais FOR ALL USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()))';
  END IF;
END $$;

-- HORARIOS_FUNCIONAMENTO
-- Supondo que tem estabelecimento_id. Vamos checar se tem.
-- Se não tiver, adicionamos:
ALTER TABLE public.horarios_funcionamento ADD COLUMN IF NOT EXISTS estabelecimento_id uuid REFERENCES public.estabelecimento(id) ON DELETE CASCADE;

ALTER TABLE public.horarios_funcionamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Horários públicos" ON public.horarios_funcionamento;

CREATE POLICY "Painel acessa seus horarios"
  ON public.horarios_funcionamento
  FOR ALL
  USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()));
  
-- FILA DE ESPERA
ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Painel acessa sua fila"
  ON public.fila_espera
  FOR ALL
  USING (estabelecimento_id IN (SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()));
