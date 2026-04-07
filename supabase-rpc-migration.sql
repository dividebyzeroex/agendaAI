-- EXPANSÃO DE SOBERANIA DE DADOS - AGENDAAI

-- 1. Remoção de Vínculo de Serviço
CREATE OR REPLACE FUNCTION remover_profissional_servico(p_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM profissional_servicos WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Finalizar Onboarding (Soberano)
CREATE OR REPLACE FUNCTION set_onboarding_concluido(p_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE profissionais 
    SET onboarding_concluido = true, 
        primeiro_acesso = false,
        updated_at = now()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar Campos de Controle (RBAC/Status)
CREATE OR REPLACE FUNCTION update_profissional_controles(
    p_id UUID,
    p_changes JSONB
) RETURNS VOID AS $$
BEGIN
    UPDATE profissionais 
    SET 
        role = COALESCE((p_changes->>'role'), role),
        ativo = COALESCE((p_changes->>'ativo')::boolean, ativo),
        auth_type = COALESCE((p_changes->>'auth_type'), auth_type),
        updated_at = now()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função RPC: Upsert Profissional Completo (Re-validada)
CREATE OR REPLACE FUNCTION upsert_profissional_completo(
    p_id UUID,
    p_estabelecimento_id UUID,
    p_nome TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_cargo TEXT,
    p_foto_url TEXT,
    p_servicos_ids UUID[]
) RETURNS JSON AS $$
DECLARE
    v_prof_id UUID;
BEGIN
    INSERT INTO profissionais (id, estabelecimento_id, nome, email, phone, cargo, foto_url, updated_at)
    VALUES (COALESCE(p_id, gen_random_uuid()), p_estabelecimento_id, p_nome, p_email, p_phone, p_cargo, p_foto_url, now())
    ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        cargo = EXCLUDED.cargo,
        foto_url = EXCLUDED.foto_url,
        updated_at = now()
    RETURNING id INTO v_prof_id;

    DELETE FROM profissional_servicos WHERE profissional_id = v_prof_id;
    INSERT INTO profissional_servicos (profissional_id, servico_id)
    SELECT v_prof_id, UNNEST(p_servicos_ids);

    RETURN json_build_object('id', v_prof_id, 'status', 'success');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Busca Segura de Perfil (Unificação de Identidade)
CREATE OR REPLACE FUNCTION get_user_profile_safe(
    p_user_id UUID DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_prof RECORD;
BEGIN
    SELECT id, nome, role, email, telefone, primeiro_acesso, onboarding_concluido
    INTO v_prof
    FROM profissionais
    WHERE (p_user_id IS NOT NULL AND id = p_user_id)
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

-- 5. Log de Evento de Segurança (Auditoria)
CREATE OR REPLACE FUNCTION log_security_event(
    p_user_id UUID,
    p_estabelecimento_id UUID,
    p_acao TEXT,
    p_detalhes JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO logs_seguranca (user_id, estabelecimento_id, acao, detalhes, ip_address, created_at)
    VALUES (p_user_id, p_estabelecimento_id, p_acao, p_detalhes, inet_client_addr(), now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
