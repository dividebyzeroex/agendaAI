-- Enforce paid/trial access at database boundaries, not only Angular navigation.
CREATE OR REPLACE FUNCTION public.get_meus_estabelecimentos()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id FROM public.estabelecimento e
 WHERE e.active AND greatest(e.trial_ends_at,e.plano_expires_at)>now()
 AND (e.user_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.profissionais p WHERE p.estabelecimento_id=e.id AND p.user_id=(SELECT auth.uid()) AND p.ativo));
$$;
-- Owners may still read their own expired account and manage billing.
DROP POLICY establishment_member_read ON public.estabelecimento;
CREATE POLICY establishment_member_read ON public.estabelecimento FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR id IN (SELECT public.get_meus_estabelecimentos()));

-- Atomic overlap prevention for appointments assigned to the same professional.
-- NULL professional represents one unassigned calendar. Preflight must check legacy overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET search_path=public,extensions;
ALTER TABLE public.agenda_events ADD CONSTRAINT agenda_no_overlap EXCLUDE USING gist (
 estabelecimento_id WITH =,
 (coalesce(profissional_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
 tstzrange(start,"end",'[)') WITH &&
) WHERE (coalesce(status,'') NOT IN ('cancelado','cancelled'));
RESET search_path;

CREATE TABLE private.public_request_limits (key text primary key,hits integer not null,expires_at timestamptz not null);
ALTER TABLE private.public_request_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.public_request_limits TO service_role;
CREATE FUNCTION public.consume_public_booking_limit(p_key text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 DELETE FROM private.public_request_limits WHERE expires_at<now();
 INSERT INTO private.public_request_limits(key,hits,expires_at) VALUES(p_key,1,now()+interval '15 minutes')
 ON CONFLICT(key) DO UPDATE SET hits=private.public_request_limits.hits+1 RETURNING hits INTO n;
 RETURN n<=5;
END; $$;
REVOKE ALL ON FUNCTION public.consume_public_booking_limit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_booking_limit(text) TO service_role;
