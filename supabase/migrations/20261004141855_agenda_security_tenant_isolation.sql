-- Close AgendaAI RPC and row-policy authorization gaps. No unrelated app tables.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION public.get_meus_estabelecimentos()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT id FROM public.estabelecimento WHERE user_id = (SELECT auth.uid())
 UNION
 SELECT estabelecimento_id FROM public.profissionais WHERE user_id = (SELECT auth.uid()) AND ativo = true;
$$;

-- Identity lookup never accepts a caller-supplied identity as proof of identity.
CREATE OR REPLACE FUNCTION public.get_user_profile_safe(p_user_id uuid DEFAULT NULL, p_email text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_estab record; v_prof record; v_email text; v_phone text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
 SELECT CASE WHEN email_confirmed_at IS NOT NULL THEN email END,
        CASE WHEN phone_confirmed_at IS NOT NULL THEN phone END INTO v_email, v_phone FROM auth.users WHERE id = v_uid;
 IF p_email IS NOT NULL AND lower(p_email) IS DISTINCT FROM lower(v_email) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
 IF p_phone IS NOT NULL AND regexp_replace(p_phone,'[^0-9]','','g') IS DISTINCT FROM regexp_replace(v_phone,'[^0-9]','','g') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
 SELECT id,nome,onboarding_completo INTO v_estab FROM public.estabelecimento WHERE user_id=v_uid LIMIT 1;
 IF FOUND THEN RETURN json_build_object('id',v_estab.id,'nome',v_estab.nome,'role','dono','email',v_email,'primeiro_acesso',false,'onboarding_concluido',v_estab.onboarding_completo); END IF;
 SELECT id,nome,role,email,primeiro_acesso,onboarding_concluido INTO v_prof FROM public.profissionais
 WHERE ativo=true AND (user_id=v_uid OR (user_id IS NULL AND (
  (p_email IS NOT NULL AND lower(email)=lower(v_email)) OR
  (p_phone IS NOT NULL AND regexp_replace(telefone,'[^0-9]','','g')=regexp_replace(v_phone,'[^0-9]','','g'))))) LIMIT 1;
 IF FOUND THEN RETURN row_to_json(v_prof); END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.link_user_to_professional(p_professional_id uuid,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_phone text;
BEGIN
 IF v_uid IS NULL OR p_user_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT CASE WHEN email_confirmed_at IS NOT NULL THEN email END,
        CASE WHEN phone_confirmed_at IS NOT NULL THEN phone END INTO v_email,v_phone FROM auth.users WHERE id=v_uid;
 UPDATE public.profissionais SET user_id=v_uid
 WHERE id=p_professional_id AND ativo=true AND (user_id=v_uid OR (user_id IS NULL AND (
   lower(email)=lower(v_email) OR (v_phone IS NOT NULL AND regexp_replace(telefone,'[^0-9]','','g')=regexp_replace(v_phone,'[^0-9]','','g')))));
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified invitation not found' USING ERRCODE='42501'; END IF;
END $$;

-- Keep original return types for client compatibility, populate only public fields.
CREATE OR REPLACE FUNCTION public.get_public_estabelecimento_by_slug(p_slug text)
RETURNS SETOF public.estabelecimento LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_populate_record(NULL::public.estabelecimento,jsonb_build_object(
 'id',id,'nome',nome,'telefone',telefone,'endereco',endereco,'endereco_completo',endereco_completo,
 'cidade',cidade,'logo_url',logo_url,'segmento',segmento,'cor_primaria',cor_primaria,'descricao',descricao,'slug',slug,'active',active))
 FROM public.estabelecimento WHERE slug=p_slug AND nullif(slug,'') IS NOT NULL AND active=true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.search_public_estabelecimentos(p_query text DEFAULT NULL)
RETURNS SETOF public.estabelecimento LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_populate_record(NULL::public.estabelecimento,jsonb_build_object(
 'id',id,'nome',nome,'telefone',telefone,'endereco',endereco,'endereco_completo',endereco_completo,
 'cidade',cidade,'logo_url',logo_url,'segmento',segmento,'cor_primaria',cor_primaria,'descricao',descricao,'slug',slug,'active',active))
 FROM public.estabelecimento WHERE nullif(slug,'') IS NOT NULL AND active=true
 AND (nullif(p_query,'') IS NULL OR nome ILIKE '%'||left(p_query,200)||'%' OR descricao ILIKE '%'||left(p_query,200)||'%')
 ORDER BY nome LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_profissionais_by_estab(p_estab_id uuid)
RETURNS SETOF public.profissionais LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_estab_id IN (SELECT public.get_meus_estabelecimentos()) THEN
  RETURN QUERY SELECT * FROM public.profissionais WHERE estabelecimento_id=p_estab_id ORDER BY nome;
 ELSE
  RETURN QUERY SELECT jsonb_populate_record(NULL::public.profissionais,jsonb_build_object(
  'id',p.id,'nome',p.nome,'especialidade',p.especialidade,'bio',p.bio,'foto_url',p.foto_url,
  'cor_agenda',p.cor_agenda,'ativo',p.ativo,'cargo',p.cargo,'estabelecimento_id',p.estabelecimento_id))
  FROM public.profissionais p JOIN public.estabelecimento e ON e.id=p.estabelecimento_id
  WHERE p.estabelecimento_id=p_estab_id AND p.ativo=true AND e.active=true AND nullif(e.slug,'') IS NOT NULL ORDER BY p.nome;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_events_by_day(p_estab_id uuid,p_date_start timestamp,p_date_end timestamp)
RETURNS SETOF public.agenda_events LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_populate_record(NULL::public.agenda_events,jsonb_build_object('start',a.start,'end',a."end",'profissional_id',a.profissional_id))
 FROM public.agenda_events a JOIN public.estabelecimento e ON e.id=a.estabelecimento_id
 WHERE a.estabelecimento_id=p_estab_id AND a.start >= p_date_start AT TIME ZONE 'America/Sao_Paulo'
 AND a.start <= p_date_end AT TIME ZONE 'America/Sao_Paulo'
 AND p_date_end >= p_date_start AND p_date_end-p_date_start <= interval '7 days'
 AND coalesce(a.status,'') NOT IN ('cancelado','cancelled') AND e.active=true AND nullif(e.slug,'') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_profissional_servicos_by_estab(p_estab_id uuid)
RETURNS SETOF public.profissional_servicos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_estab_id IN (SELECT public.get_meus_estabelecimentos()) THEN
  RETURN QUERY SELECT * FROM public.profissional_servicos WHERE estabelecimento_id=p_estab_id;
 ELSE
  RETURN QUERY SELECT jsonb_populate_record(NULL::public.profissional_servicos,jsonb_build_object(
   'id',s.id,'profissional_id',s.profissional_id,'servico_id',s.servico_id,'valor_proprio',s.valor_proprio,'estabelecimento_id',s.estabelecimento_id))
  FROM public.profissional_servicos s JOIN public.estabelecimento e ON e.id=s.estabelecimento_id
  WHERE s.estabelecimento_id=p_estab_id AND e.active=true AND nullif(e.slug,'') IS NOT NULL;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_produto_comanda(p_caixa_id uuid,p_produto_id uuid,p_quantidade integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_produto public.produtos; v_estab uuid;
BEGIN
 IF p_quantidade IS NULL OR p_quantidade<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
 SELECT estabelecimento_id INTO v_estab FROM public.caixa_itens WHERE id=p_caixa_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Comanda not found or not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_produto FROM public.produtos WHERE id=p_produto_id AND estabelecimento_id=v_estab AND ativo=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found or not authorized' USING ERRCODE='42501'; END IF;
 IF v_produto.estoque IS NULL OR v_produto.estoque<p_quantidade THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
 INSERT INTO public.caixa_produtos(caixa_item_id,produto_id,quantidade,valor_unitario) VALUES(p_caixa_id,p_produto_id,p_quantidade,v_produto.preco);
 UPDATE public.caixa_itens SET valor_total=coalesce(valor_total,0)+v_produto.preco*p_quantidade WHERE id=p_caixa_id;
 UPDATE public.produtos SET estoque=estoque-p_quantidade WHERE id=p_produto_id;
END $$;

-- Sensitive reads and writes now execute with the caller's row-level policies.
ALTER FUNCTION public.get_agenda_events_by_estab(uuid) SECURITY INVOKER;
ALTER FUNCTION public.update_profissional_controles(uuid,jsonb) SECURITY INVOKER;
ALTER FUNCTION public.remover_profissional_servico(uuid) SECURITY INVOKER;
ALTER FUNCTION public.upsert_profissional_completo(uuid,uuid,text,text,text,text,text,uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.increment_usage_quota(uuid,text,text) SECURITY INVOKER;
CREATE OR REPLACE FUNCTION public.set_onboarding_concluido(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 UPDATE public.profissionais SET onboarding_concluido=true,primeiro_acesso=false WHERE id=p_id;
$$;
CREATE OR REPLACE FUNCTION public.get_analytics_consolidado(p_estabelecimento_id uuid,p_inicio timestamp,p_fim timestamp)
RETURNS json LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT json_build_object('faturamento_total',coalesce(sum(valor_total),0),'agendamentos_totais',count(*))
 FROM public.agenda_events WHERE estabelecimento_id=p_estabelecimento_id AND start BETWEEN p_inicio AND p_fim AND status='concluido';
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_establishment_key(p_establishment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_key text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.estabelecimento WHERE id=p_establishment_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='est_key_'||p_establishment_id;
 IF v_key IS NULL THEN
  v_key:=encode(extensions.gen_random_bytes(32),'base64');
  PERFORM vault.create_secret(v_key,'est_key_'||p_establishment_id,'AgendaAI establishment encryption key');
 END IF;
 RETURN v_key;
END $$;

CREATE OR REPLACE FUNCTION public.log_security_event(p_user_id uuid,p_estabelecimento_id uuid,p_acao text,p_detalhes jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() OR p_estabelecimento_id NOT IN (SELECT public.get_meus_estabelecimentos()) OR p_estabelecimento_id IS NULL THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.logs_seguranca(user_id,estabelecimento_id,acao,detalhes,ip_address) VALUES(auth.uid(),p_estabelecimento_id,left(p_acao,200),p_detalhes,inet_client_addr());
END $$;

-- No browser may read OTPs, generate codes, or consume another person's codes.
DROP POLICY IF EXISTS "Permitir leitura de OTP por pro_id" ON public.profissional_otps;
DROP POLICY IF EXISTS "Permitir inserção de OTP" ON public.profissional_otps;
DROP POLICY IF EXISTS "Permitir exclusão de OTP usado" ON public.profissional_otps;
REVOKE ALL ON public.profissional_otps FROM anon,authenticated;

-- Legacy mailbox/workflows lacked a tenant key. New rows belong to their author;
-- historical unattributed rows remain server-only rather than guessing ownership.
ALTER TABLE public.agent_mailbox ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.agent_mailbox ALTER COLUMN owner_user_id SET DEFAULT auth.uid();
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS estabelecimento_id uuid REFERENCES public.estabelecimento(id);
ALTER TABLE public.workflows ALTER COLUMN owner_user_id SET DEFAULT auth.uid();
DROP POLICY IF EXISTS "Autenticado gerencia mailbox" ON public.agent_mailbox;
DROP POLICY IF EXISTS "Autenticado gerencia workflows" ON public.workflows;
DROP POLICY IF EXISTS "Autenticado gerencia agent_tasks" ON public.agent_tasks;
CREATE POLICY mailbox_owner ON public.agent_mailbox FOR ALL TO authenticated USING(owner_user_id=(SELECT auth.uid())) WITH CHECK(owner_user_id=(SELECT auth.uid()));
CREATE POLICY workflow_owner ON public.workflows FOR ALL TO authenticated USING(owner_user_id=(SELECT auth.uid()) AND estabelecimento_id IN (SELECT public.get_meus_estabelecimentos())) WITH CHECK(owner_user_id=(SELECT auth.uid()) AND estabelecimento_id IN (SELECT public.get_meus_estabelecimentos()));
CREATE POLICY task_tenant ON public.agent_tasks FOR ALL TO authenticated USING(estabelecimento_id IN (SELECT public.get_meus_estabelecimentos())) WITH CHECK(estabelecimento_id IN (SELECT public.get_meus_estabelecimentos()));

-- A team member cannot change tenant membership or elevate their role via direct SQL API.
CREATE OR REPLACE FUNCTION private.protect_professional_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF TG_OP='UPDATE' AND (NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
   RAISE EXCEPTION 'Membership is managed by verified invitations' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND NEW.user_id IS NOT NULL THEN RAISE EXCEPTION 'Use verified invitation linking' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.estabelecimento WHERE id=NEW.estabelecimento_id AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'Only the owner can create professional identities' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.ativo IS DISTINCT FROM OLD.ativo OR NEW.auth_type IS DISTINCT FROM OLD.auth_type OR NEW.email IS DISTINCT FROM OLD.email OR NEW.telefone IS DISTINCT FROM OLD.telefone)
    AND NOT EXISTS(SELECT 1 FROM public.estabelecimento WHERE id=OLD.estabelecimento_id AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'Only the owner can manage professional identity' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_professional_identity BEFORE INSERT OR UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION private.protect_professional_identity();

-- Explicit allowlist: only deliberately public booking/catalog RPCs remain anon-callable.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
 'get_user_profile_safe','link_user_to_professional','get_or_create_establishment_key','log_security_event',
 'get_agenda_events_by_estab','update_profissional_controles','get_meus_estabelecimentos','increment_usage_quota',
 'upsert_chatbot_robot_safe','get_chatbot_robots','get_analytics_consolidado','remover_profissional_servico',
 'set_onboarding_concluido','upsert_profissional_completo','add_produto_comanda']) LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.sig);
 EXECUTE format('ALTER FUNCTION %s SET search_path=public,pg_temp',f.sig);
 END LOOP;
END $$;

