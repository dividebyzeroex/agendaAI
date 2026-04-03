-- ============================================================
-- Correção: Remover linha seed duplicada sem user_id
-- Execute DEPOIS de já ter feito login pelo menos uma vez,
-- para garantir que sua linha com user_id já existe.
-- ============================================================

-- Remove a linha seed genérica (sem dono) que o schema.sql criou
DELETE FROM public.estabelecimento WHERE user_id IS NULL;

-- Remove também serviços e horários duplicados do seed, se quiser começar do zero:
-- (Só execute estas linhas se você ainda não cadastrou seus próprios dados)
-- DELETE FROM public.servicos WHERE created_at < NOW() - INTERVAL '1 minute';
-- DELETE FROM public.horarios_funcionamento WHERE created_at < NOW() - INTERVAL '1 minute';
