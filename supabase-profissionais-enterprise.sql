-- ============================================================
-- AgendaAi — Upgrade Enterprise: Profissionais
-- ============================================================

-- 1. Novos campos na tabela de profissionais
ALTER TABLE public.profissionais 
ADD COLUMN IF NOT EXISTS cargo               text,
ADD COLUMN IF NOT EXISTS comissao_padrao      numeric(5,2) DEFAULT 0, -- percentual (ex: 30.50)
ADD COLUMN IF NOT EXISTS data_contratacao    date DEFAULT now(),
ADD COLUMN IF NOT EXISTS instagram           text,
ADD COLUMN IF NOT EXISTS linkedin            text;

-- 2. Suporte a Intervalos (Almoço/Pausa) na disponibilidade
ALTER TABLE public.profissional_disponibilidades
ADD COLUMN IF NOT EXISTS intervalo_inicio    time,
ADD COLUMN IF NOT EXISTS intervalo_fim       time;

-- 3. Comentários para documentação
COMMENT ON COLUMN public.profissionais.comissao_padrao IS 'Percentual de comissão padrão do profissional sobre o valor bruto do serviço.';
COMMENT ON COLUMN public.profissional_disponibilidades.intervalo_inicio IS 'Início do intervalo de pausa/almoço.';

-- Verificação da estrutura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profissionais' OR table_name = 'profissional_disponibilidades'
ORDER BY table_name;
