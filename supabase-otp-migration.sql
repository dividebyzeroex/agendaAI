-- Tabela para armazenar os códigos de segurança temporários dos profissionais
CREATE TABLE IF NOT EXISTS public.profissional_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Segurança de Nível de Linha)
ALTER TABLE public.profissional_otps ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
CREATE POLICY "Permitir leitura de OTP por pro_id" 
ON public.profissional_otps FOR SELECT 
USING (true);

CREATE POLICY "Permitir inserção de OTP" 
ON public.profissional_otps FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Permitir exclusão de OTP usado" 
ON public.profissional_otps FOR DELETE 
USING (true);
