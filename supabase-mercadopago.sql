-- Adiciona a coluna plano_expires_at para controlar o acesso do SaaS
ALTER TABLE estabelecimento
ADD COLUMN IF NOT EXISTS plano_expires_at TIMESTAMP WITH TIME ZONE;

-- Remove a constraint antiga que limitava o plano para 'starter', 'pro' ou 'business'
ALTER TABLE estabelecimento 
DROP CONSTRAINT IF EXISTS estabelecimento_plano_check;
