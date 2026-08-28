-- supabase-comanda-fisica.sql
-- Adiciona colunas para controle de comanda física e e-mail do cliente na tabela caixa_itens.

ALTER TABLE public.caixa_itens 
ADD COLUMN IF NOT EXISTS comanda_fisica text,
ADD COLUMN IF NOT EXISTS email_cliente text;
