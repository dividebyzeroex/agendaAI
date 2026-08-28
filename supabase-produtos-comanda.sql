-- ==========================================
-- SCRIPT: PRODUTOS & COMANDA DIGITAL
-- ==========================================

-- 1. TABELA DE PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimento(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  preco numeric NOT NULL DEFAULT 0,
  estoque int NOT NULL DEFAULT 0,
  codigo_barras text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_produtos" ON public.produtos;
CREATE POLICY "admin_all_produtos" ON public.produtos
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "pub_select_produtos" ON public.produtos;
CREATE POLICY "pub_select_produtos" ON public.produtos
  FOR SELECT USING (true);


-- 2. MELHORIA NA TABELA DE CAIXA (TRANSFORMANDO EM COMANDA)
ALTER TABLE public.caixa_itens 
  ADD COLUMN IF NOT EXISTS token_publico uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS desconto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estabelecimento_id uuid REFERENCES public.estabelecimento(id) ON DELETE CASCADE;


-- 3. ITENS DA COMANDA (M:N CAIXA <-> PRODUTOS)
CREATE TABLE IF NOT EXISTS public.caixa_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_item_id uuid NOT NULL REFERENCES public.caixa_itens(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade int NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.caixa_produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_caixa_produtos" ON public.caixa_produtos;
CREATE POLICY "admin_all_caixa_produtos" ON public.caixa_produtos
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "pub_insert_caixa_produtos" ON public.caixa_produtos;
CREATE POLICY "pub_insert_caixa_produtos" ON public.caixa_produtos
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "pub_select_caixa_produtos" ON public.caixa_produtos;
CREATE POLICY "pub_select_caixa_produtos" ON public.caixa_produtos
  FOR SELECT USING (true);


-- 4. RPC PARA OBTER DADOS DA COMANDA PÚBLICA
CREATE OR REPLACE FUNCTION public.get_comanda_digital(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comanda record;
  v_produtos json;
  v_estabelecimento record;
BEGIN
  -- Busca a comanda pelo token
  SELECT * INTO v_comanda FROM public.caixa_itens WHERE token_publico = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada';
  END IF;

  -- Busca detalhes dos produtos associados
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', cp.id,
      'produto_id', p.id,
      'nome', p.nome,
      'quantidade', cp.quantidade,
      'valor_unitario', cp.valor_unitario,
      'subtotal', cp.quantidade * cp.valor_unitario
    )
  ), '[]') INTO v_produtos
  FROM public.caixa_produtos cp
  JOIN public.produtos p ON p.id = cp.produto_id
  WHERE cp.caixa_item_id = v_comanda.id;

  -- Busca estabelecimento
  SELECT * INTO v_estabelecimento FROM public.estabelecimento WHERE id = v_comanda.estabelecimento_id;

  RETURN json_build_object(
    'id', v_comanda.id,
    'cliente_nome', v_comanda.cliente_nome,
    'servicos', v_comanda.servicos,
    'produtos', v_produtos,
    'valor_total', v_comanda.valor_total,
    'desconto', v_comanda.desconto,
    'status_caixa', v_comanda.status_caixa,
    'created_at', v_comanda.created_at,
    'estabelecimento', json_build_object(
      'nome', v_estabelecimento.nome,
      'logo_url', v_estabelecimento.logo_url
    )
  );
END;
$$;


-- 5. RPC PARA ADICIONAR PRODUTOS À COMANDA (COM BAIXA DE ESTOQUE)
CREATE OR REPLACE FUNCTION public.add_produto_comanda(p_caixa_id uuid, p_produto_id uuid, p_quantidade int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_produto record;
BEGIN
  SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou inativo.';
  END IF;

  IF v_produto.estoque < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente para o produto %.', v_produto.nome;
  END IF;

  -- Insere na comanda
  INSERT INTO public.caixa_produtos (caixa_item_id, produto_id, quantidade, valor_unitario)
  VALUES (p_caixa_id, p_produto_id, p_quantidade, v_produto.preco);

  -- Atualiza o total da comanda
  UPDATE public.caixa_itens 
  SET valor_total = valor_total + (v_produto.preco * p_quantidade)
  WHERE id = p_caixa_id;

  -- Dá baixa no estoque
  UPDATE public.produtos
  SET estoque = estoque - p_quantidade
  WHERE id = p_produto_id;
END;
$$;
