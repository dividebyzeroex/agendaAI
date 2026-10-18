-- Create a function to search for public establishments
CREATE OR REPLACE FUNCTION search_public_estabelecimentos(p_query text default null)
RETURNS SETOF public.estabelecimento
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_query IS NULL OR p_query = '' THEN
    RETURN QUERY 
      SELECT * FROM public.estabelecimento 
      WHERE slug IS NOT NULL AND slug != ''
      LIMIT 12;
  ELSE
    RETURN QUERY 
      SELECT * FROM public.estabelecimento 
      WHERE (nome ILIKE '%' || p_query || '%' OR descricao ILIKE '%' || p_query || '%')
        AND slug IS NOT NULL AND slug != ''
      LIMIT 20;
  END IF;
END;
$$;
