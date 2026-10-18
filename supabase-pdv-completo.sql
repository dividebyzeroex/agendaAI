-- ====================================================================================
-- FRENTE DE CAIXA (PDV) COMPLETO - AGENDA AI
-- Este script cria a estrutura para Abertura/Fechamento de Caixa, Sangrias e Vendas.
-- ====================================================================================

-- 1. TABELA DE SESSÕES DO CAIXA
-- Representa um "Turno" do caixa aberto por um operador
CREATE TABLE IF NOT EXISTS public.caixa_sessoes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
  operador_id uuid NOT NULL,
  operador_nome text NOT NULL,
  data_abertura timestamptz DEFAULT now() NOT NULL,
  data_fechamento timestamptz,
  saldo_inicial numeric(10,2) DEFAULT 0 NOT NULL,
  saldo_final_informado numeric(10,2),
  saldo_final_calculado numeric(10,2),
  status text DEFAULT 'aberto' NOT NULL CHECK (status IN ('aberto', 'fechado_parcial', 'fechado')),
  observacoes text
);

-- RLS para caixa_sessoes
ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_caixa_sessoes" ON public.caixa_sessoes;
CREATE POLICY "admin_all_caixa_sessoes" ON public.caixa_sessoes
  FOR ALL
  USING (
    estabelecimento_id IN (
      SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
    ) OR
    auth.uid() = operador_id
  );

-- 2. AJUSTAR A TABELA DE CAIXA ITENS (COMANDAS)
-- Permitir agenda_event_id nulo para Vendas Avulsas e adicionar vinculo com a Sessão
ALTER TABLE public.caixa_itens ALTER COLUMN agenda_event_id DROP NOT NULL;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='caixa_itens' AND column_name='sessao_id') THEN
    ALTER TABLE public.caixa_itens ADD COLUMN sessao_id uuid REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE;
  END IF;
  
  -- Adicionar coluna para tipo de origem (agenda ou avulso)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='caixa_itens' AND column_name='origem') THEN
    ALTER TABLE public.caixa_itens ADD COLUMN origem text DEFAULT 'agenda' CHECK (origem IN ('agenda', 'avulso'));
  END IF;
END $$;


-- 3. TABELA DE MOVIMENTAÇÕES DO CAIXA
-- Registra cada entrada/saída (Vendas, Sangrias, Suprimentos, Estornos)
CREATE TABLE IF NOT EXISTS public.caixa_movimentacoes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sessao_id uuid NOT NULL REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE,
  caixa_item_id uuid REFERENCES public.caixa_itens(id) ON DELETE CASCADE, -- opcional, só preenchido se for uma venda/comanda
  tipo text NOT NULL CHECK (tipo IN ('venda', 'sangria', 'suprimento', 'estorno')),
  forma_pagamento text NOT NULL, -- pix, dinheiro, cartao_credito, cartao_debito, etc.
  valor numeric(10,2) NOT NULL,
  descricao text,
  operador_nome text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS para caixa_movimentacoes
ALTER TABLE public.caixa_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_caixa_movs" ON public.caixa_movimentacoes;
CREATE POLICY "admin_all_caixa_movs" ON public.caixa_movimentacoes
  FOR ALL
  USING (
    sessao_id IN (
      SELECT id FROM public.caixa_sessoes WHERE estabelecimento_id IN (
        SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
      )
    )
  );

-- Criação de Índices para performance do PDV
CREATE INDEX IF NOT EXISTS idx_sessoes_estabelecimento ON public.caixa_sessoes(estabelecimento_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_status ON public.caixa_sessoes(status);
CREATE INDEX IF NOT EXISTS idx_movs_sessao ON public.caixa_movimentacoes(sessao_id);
