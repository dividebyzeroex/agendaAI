-- 1. Tabela Estabelecimento: config_fidelidade
ALTER TABLE public.estabelecimento 
  ADD COLUMN IF NOT EXISTS config_fidelidade jsonb DEFAULT '{"ativo": false, "visitas_meta": 10, "desconto_percentual": 15}'::jsonb;

-- 2. Tabela agenda_events: fidelidade_resgatada
ALTER TABLE public.agenda_events 
  ADD COLUMN IF NOT EXISTS fidelidade_resgatada boolean DEFAULT false;

-- 3. Tabela clientes: nascimento (caso não exista)
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS nascimento date;

-- 4. RPC para buscar aniversariantes do mês
CREATE OR REPLACE FUNCTION get_aniversariantes_do_mes(p_estab_id uuid)
RETURNS SETOF public.clientes
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY 
  SELECT * FROM public.clientes 
  WHERE estabelecimento_id = p_estab_id 
  AND EXTRACT(MONTH FROM nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
  ORDER BY EXTRACT(DAY FROM nascimento) ASC;
END;
$$;

-- 5. RPC para contar visitas não resgatadas de um cliente
CREATE OR REPLACE FUNCTION get_visitas_fidelidade_pendentes(p_cliente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count 
  FROM public.agenda_events 
  WHERE cliente_id = p_cliente_id 
  AND status = 'concluido' 
  AND fidelidade_resgatada = false;
  
  RETURN v_count;
END;
$$;

-- 6. RPC para resgatar a fidelidade (marcar as últimas X visitas como resgatadas)
CREATE OR REPLACE FUNCTION resgatar_fidelidade_cliente(p_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.agenda_events
  SET fidelidade_resgatada = true
  WHERE cliente_id = p_cliente_id
  AND status = 'concluido'
  AND fidelidade_resgatada = false;
  
  RETURN true;
END;
$$;
