-- ============================================================
-- SUPABASE RBAC CORE & SEGMENTOS
-- Tabelas de Sistema para Papéis e Segmentos Dinâmicos
-- ============================================================

-- 1. Criação das Tabelas de Sistema

CREATE TABLE IF NOT EXISTS public.sys_segmentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    icon TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sys_cargos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    segmento_id UUID REFERENCES public.sys_segmentos(id) ON DELETE CASCADE,
    nome_cargo TEXT NOT NULL,
    role_code TEXT NOT NULL, -- ex: 'dono', 'secretaria', 'operacional'
    nivel_acesso INT NOT NULL DEFAULT 3, -- 1: Dono, 2: Secretaria/Gerente, 3: Operacional
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir que as tabelas sejam acessíveis para leitura pública/autenticada
ALTER TABLE public.sys_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sys_cargos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública sys_segmentos') THEN
        CREATE POLICY "Leitura pública sys_segmentos" ON public.sys_segmentos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Leitura pública sys_cargos') THEN
        CREATE POLICY "Leitura pública sys_cargos" ON public.sys_cargos FOR SELECT USING (true);
    END IF;
END $$;
GRANT SELECT ON TABLE public.sys_segmentos TO anon, authenticated;
GRANT SELECT ON TABLE public.sys_cargos TO anon, authenticated;


-- 2. Inserir Dados Base (Seeds)
-- Limpar dados existentes (apenas para ambiente de dev)
TRUNCATE TABLE public.sys_cargos CASCADE;
TRUNCATE TABLE public.sys_segmentos CASCADE;

DO $$ 
DECLARE
    v_seg_barbearia UUID;
    v_seg_beleza UUID;
    v_seg_estetica UUID;
    v_seg_petshop UUID;
    v_seg_tattoo UUID;
    v_seg_geral UUID;
BEGIN
    -- Segmentos
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('barbearia', 'Barbearia', '💈') RETURNING id INTO v_seg_barbearia;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('salao_beleza', 'Salão de Beleza', '💅') RETURNING id INTO v_seg_beleza;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('clinica_estetica', 'Clínica de Estética', '✨') RETURNING id INTO v_seg_estetica;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('petshop', 'Pet Shop / Banho & Tosa', '🐾') RETURNING id INTO v_seg_petshop;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('estudio_tatuagem', 'Estúdio de Tatuagem', '🖋️') RETURNING id INTO v_seg_tattoo;
    INSERT INTO sys_segmentos (slug, nome, icon) VALUES ('generico', 'Outro Segmento / Geral', '🗓️') RETURNING id INTO v_seg_geral;

    -- Cargos: Barbearia
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_barbearia, 'Dono / Proprietário', 'dono', 1),
        (v_seg_barbearia, 'Gerente / Recepção', 'secretaria', 2),
        (v_seg_barbearia, 'Barbeiro Especialista', 'operacional', 3),
        (v_seg_barbearia, 'Auxiliar / Assistente', 'operacional', 3);

    -- Cargos: Salão de Beleza
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_beleza, 'Dono(a)', 'dono', 1),
        (v_seg_beleza, 'Recepcionista', 'secretaria', 2),
        (v_seg_beleza, 'Cabeleireiro(a)', 'operacional', 3),
        (v_seg_beleza, 'Manicure / Pedicure', 'operacional', 3),
        (v_seg_beleza, 'Maquiador(a)', 'operacional', 3);

    -- Cargos: Estética
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_estetica, 'Diretor(a) Clínico', 'dono', 1),
        (v_seg_estetica, 'Secretária', 'secretaria', 2),
        (v_seg_estetica, 'Esteticista', 'operacional', 3),
        (v_seg_estetica, 'Dermatologista', 'operacional', 3),
        (v_seg_estetica, 'Biomédico(a)', 'operacional', 3);

    -- Cargos: Petshop
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_petshop, 'Proprietário', 'dono', 1),
        (v_seg_petshop, 'Atendimento', 'secretaria', 2),
        (v_seg_petshop, 'Banhista / Tosador', 'operacional', 3),
        (v_seg_petshop, 'Veterinário(a)', 'operacional', 3);

    -- Cargos: Tattoo
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_tattoo, 'Dono(a) do Estúdio', 'dono', 1),
        (v_seg_tattoo, 'Atendimento', 'secretaria', 2),
        (v_seg_tattoo, 'Tatuador(a)', 'operacional', 3),
        (v_seg_tattoo, 'Body Piercer', 'operacional', 3);

    -- Cargos: Geral
    INSERT INTO sys_cargos (segmento_id, nome_cargo, role_code, nivel_acesso) VALUES
        (v_seg_geral, 'Dono(a)', 'dono', 1),
        (v_seg_geral, 'Recepcionista', 'secretaria', 2),
        (v_seg_geral, 'Especialista', 'operacional', 3),
        (v_seg_geral, 'Colaborador', 'operacional', 3);
END $$;


-- 3. Modificações na Tabela de Profissionais
ALTER TABLE IF EXISTS public.profissionais ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- 4. Função: link_user_to_professional
-- Quando o funcionário fizer o primeiro login via Magic Link, vincula sua auth.uid() ao seu perfil de profissional.
CREATE OR REPLACE FUNCTION public.link_user_to_professional(p_professional_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profissionais 
    SET user_id = p_user_id, updated_at = now()
    WHERE id = p_professional_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.link_user_to_professional(UUID, UUID) TO authenticated;


-- 5. Função Utilitária para RLS: get_meus_estabelecimentos()
-- Retorna os estabelecimentos que o usuário atual tem acesso (como dono ou como funcionário)
CREATE OR REPLACE FUNCTION public.get_meus_estabelecimentos()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY 
        SELECT id FROM public.estabelecimento WHERE user_id = auth.uid()
        UNION
        SELECT estabelecimento_id FROM public.profissionais WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Atualização de Políticas de RLS
-- Permitir leitura por donos E funcionários
DO $$
BEGIN
    -- Estabelecimento
    DROP POLICY IF EXISTS "Dono gerencia seu estabelecimento" ON public.estabelecimento;
    DROP POLICY IF EXISTS "Acesso Estabelecimento RBAC" ON public.estabelecimento;
    CREATE POLICY "Acesso Estabelecimento RBAC" ON public.estabelecimento 
    FOR ALL USING (id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Agenda
    DROP POLICY IF EXISTS "Isolamento de Agenda por Dono" ON public.agenda_events;
    DROP POLICY IF EXISTS "Acesso Agenda RBAC" ON public.agenda_events;
    CREATE POLICY "Acesso Agenda RBAC" ON public.agenda_events 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Clientes
    DROP POLICY IF EXISTS "Isolamento de Clientes por Dono" ON public.clientes;
    DROP POLICY IF EXISTS "Acesso Clientes RBAC" ON public.clientes;
    CREATE POLICY "Acesso Clientes RBAC" ON public.clientes 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));

    -- Profissionais
    DROP POLICY IF EXISTS "Isolamento de Profissionais por Dono" ON public.profissionais;
    DROP POLICY IF EXISTS "Acesso Profissionais RBAC" ON public.profissionais;
    CREATE POLICY "Acesso Profissionais RBAC" ON public.profissionais 
    FOR ALL USING (estabelecimento_id IN (SELECT * FROM public.get_meus_estabelecimentos()));
END $$;


-- 7. Unificação de Identidade (Dono vs Funcionário)
CREATE OR REPLACE FUNCTION get_user_profile_safe(
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_estab RECORD;
    v_prof RECORD;
BEGIN
    -- 1. Tentar encontrar como DONO do estabelecimento
    IF p_user_id IS NOT NULL THEN
        SELECT id, nome, 'dono' as role, onboarding_completo as onboarding_concluido, false as primeiro_acesso
        INTO v_estab
        FROM estabelecimento
        WHERE user_id = p_user_id
        LIMIT 1;

        IF v_estab.id IS NOT NULL THEN
            RETURN json_build_object(
                'id', v_estab.id,
                'nome', v_estab.nome,
                'role', 'dono',
                'email', p_email,
                'primeiro_acesso', false,
                'onboarding_concluido', v_estab.onboarding_concluido
            );
        END IF;
    END IF;

    -- 2. Tentar encontrar como PROFISSIONAL/EQUIPE
    SELECT id, nome, role, email, telefone, primeiro_acesso, onboarding_concluido
    INTO v_prof
    FROM profissionais
    WHERE (p_user_id IS NOT NULL AND user_id = p_user_id) -- Modificado para buscar por user_id, não pelo id do profissional
       OR (p_email IS NOT NULL AND email = p_email)
       OR (p_phone IS NOT NULL AND telefone = p_phone)
    LIMIT 1;

    IF v_prof.id IS NOT NULL THEN
        RETURN json_build_object(
            'id', v_prof.id,
            'nome', v_prof.nome,
            'role', v_prof.role,
            'email', v_prof.email,
            'primeiro_acesso', v_prof.primeiro_acesso,
            'onboarding_concluido', v_prof.onboarding_concluido
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
