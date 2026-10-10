-- =====================================================
-- FIX: Portal Público de Agendamento
-- Problema: As funções do portal público usavam SECURITY INVOKER,
-- que executa com os privilégios do chamador (anon).
-- Com RLS ativado nas tabelas, o usuário anônimo não tem acesso.
-- Solução: Trocar para SECURITY DEFINER para bypass RLS nas
-- funções públicas que precisam ser acessíveis SEM login.
-- =====================================================

-- 1. Estabelecimento por slug (portal público)
CREATE OR REPLACE FUNCTION get_public_estabelecimento_by_slug(p_slug text)
RETURNS SETOF public.estabelecimento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.estabelecimento WHERE slug = p_slug LIMIT 1;
END;
$$;

-- 2. Serviços por estabelecimento (público)
CREATE OR REPLACE FUNCTION get_servicos_by_estab(p_estab_id uuid)
RETURNS SETOF public.servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.servicos WHERE estabelecimento_id = p_estab_id AND ativo = true ORDER BY titulo;
END;
$$;

-- 3. Horários por estabelecimento (público)
CREATE OR REPLACE FUNCTION get_horarios_by_estab(p_estab_id uuid)
RETURNS SETOF public.horarios_funcionamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.horarios_funcionamento WHERE estabelecimento_id = p_estab_id ORDER BY dia_semana;
END;
$$;

-- 4. Profissionais por estabelecimento (público)
CREATE OR REPLACE FUNCTION get_profissionais_by_estab(p_estab_id uuid)
RETURNS SETOF public.profissionais
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.profissionais WHERE estabelecimento_id = p_estab_id AND ativo = true ORDER BY nome;
END;
$$;

-- 5. Disponibilidades dos profissionais (público)
CREATE OR REPLACE FUNCTION get_profissional_disponibilidades_by_estab(p_estab_id uuid)
RETURNS SETOF public.profissional_disponibilidades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.profissional_disponibilidades WHERE estabelecimento_id = p_estab_id;
END;
$$;

-- 6. Serviços vinculados a profissionais (público)
CREATE OR REPLACE FUNCTION get_profissional_servicos_by_estab(p_estab_id uuid)
RETURNS SETOF public.profissional_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.profissional_servicos WHERE estabelecimento_id = p_estab_id;
END;
$$;

-- 7. Eventos do dia (público - para verificar slots ocupados)
CREATE OR REPLACE FUNCTION get_public_events_by_day(p_estab_id uuid, p_date_start timestamp, p_date_end timestamp)
RETURNS SETOF public.agenda_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.agenda_events 
  WHERE estabelecimento_id = p_estab_id 
    AND start >= p_date_start 
    AND start <= p_date_end;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION get_public_estabelecimento_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_servicos_by_estab(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_horarios_by_estab(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profissionais_by_estab(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profissional_disponibilidades_by_estab(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_profissional_servicos_by_estab(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_events_by_day(uuid, timestamp, timestamp) TO anon, authenticated;
