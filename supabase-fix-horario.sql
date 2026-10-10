CREATE OR REPLACE FUNCTION update_horario_safe(p_id uuid, p_changes jsonb)
RETURNS setof public.horarios_funcionamento LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  UPDATE public.horarios_funcionamento 
  SET 
    abre = coalesce((p_changes->>'abre')::time, abre),
    fecha = coalesce((p_changes->>'fecha')::time, fecha),
    ativo = coalesce((p_changes->>'ativo')::boolean, ativo)
  WHERE id = p_id;
  RETURN QUERY SELECT * FROM public.horarios_funcionamento WHERE id = p_id;
END; $$;
