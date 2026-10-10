-- ============================================================
-- AgendaAi — Improvements Migration (Baseado na Concorrência)
-- ============================================================

-- 1. Melhorias na Tabela de Clientes (CRM, Anamnese, e Notificações Granulares)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS anamnese jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS receber_marketing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receber_lembretes boolean DEFAULT true;

-- 2. Melhorias na Tabela de Serviços (Categorização e Filtros)
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'Geral';

-- 3. Assinaturas Transparentes (Stripe Current Period End)
-- Atualizando tabela estabelecimento para armazenar a validade do acesso
ALTER TABLE public.estabelecimento
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamptz;

-- 4. Melhorias em Agenda e Pagamentos (Sem "Fiado")
-- Adicionamos um status simples de pagamento, sem gerenciar dívidas longas.
ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS pagamento_status text DEFAULT 'pendente' CHECK (pagamento_status IN ('pendente', 'pago', 'reembolsado'));

-- 5. Comissões Calculadas POR SERVIÇO (Decisão do Usuário)
-- Atualizamos a relação profissional_servicos para incluir a taxa de comissão
ALTER TABLE public.profissional_servicos
  ADD COLUMN IF NOT EXISTS taxa_comissao numeric(5,2) DEFAULT 0, -- Porcentagem (ex: 50.00 para 50%)
  ADD COLUMN IF NOT EXISTS tipo_comissao text DEFAULT 'percentual' CHECK (tipo_comissao IN ('percentual', 'fixo'));

-- Tabela para registrar a comissão exata gerada por cada atendimento concluído
CREATE TABLE IF NOT EXISTS public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_event_id uuid REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE CASCADE,
  servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL,
  valor_servico numeric(10,2) NOT NULL,
  valor_comissao numeric(10,2) NOT NULL,
  status_pagamento text DEFAULT 'pendente_repasse' CHECK (status_pagamento IN ('pendente_repasse', 'pago_ao_profissional')),
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS para comissões
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode ver todas as comissões" ON public.comissoes
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. IMPEDIR DUPLO AGENDAMENTO (Segurança e Integridade)
-- Criamos uma função e trigger para abortar inserções/atualizações de eventos que colidam horários para o mesmo profissional.
CREATE OR REPLACE FUNCTION public.check_overlapping_events()
RETURNS trigger AS $$
BEGIN
  -- Apenas verificar se o evento tiver um profissional alocado e não estiver cancelado
  IF NEW.profissional_id IS NOT NULL AND NEW.status != 'cancelado' THEN
    IF EXISTS (
      SELECT 1 FROM public.agenda_events
      WHERE profissional_id = NEW.profissional_id
        AND id IS DISTINCT FROM NEW.id -- Ignorar o próprio registro em caso de UPDATE
        AND status != 'cancelado'
        AND start < NEW."end" 
        AND "end" > NEW.start
    ) THEN
      RAISE EXCEPTION 'O profissional já possui um agendamento neste horário.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_overlapping_events ON public.agenda_events;
CREATE TRIGGER trigger_check_overlapping_events
  BEFORE INSERT OR UPDATE ON public.agenda_events
  FOR EACH ROW EXECUTE FUNCTION public.check_overlapping_events();
