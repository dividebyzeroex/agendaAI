-- ============================================================
-- Migração: Adicionar flag de onboarding ao estabelecimento
-- Execute no SQL Editor do Supabase (adicione ao schema existente)
-- ============================================================

ALTER TABLE public.estabelecimento
  ADD COLUMN IF NOT EXISTS onboarding_completo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Índice para lookup rápido por usuário
CREATE INDEX IF NOT EXISTS idx_estabelecimento_user_id ON public.estabelecimento(user_id);

-- Política: cada usuário vê/edita apenas o seu próprio estabelecimento
DROP POLICY IF EXISTS "Estabelecimento público" ON public.estabelecimento;

CREATE POLICY "Owner lê seu estabelecimento"
  ON public.estabelecimento FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Owner edita seu estabelecimento"
  ON public.estabelecimento FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner cria seu estabelecimento"
  ON public.estabelecimento FOR INSERT
  WITH CHECK (user_id = auth.uid());
