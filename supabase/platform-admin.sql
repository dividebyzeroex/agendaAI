-- Supabase RPCs for Platform Admin (SaaS Owner)
-- These functions return platform-wide metrics across all tenants.

-- 0. Garantir que as colunas existam
ALTER TABLE public.estabelecimento 
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS slug text;

CREATE OR REPLACE FUNCTION get_platform_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Needs to bypass RLS to count all tenants
AS $$
DECLARE
  v_total_tenants int;
  v_active_tenants int;
  v_total_appointments int;
  v_total_mrr numeric;
  v_ai_messages int;
  v_requester_email text;
BEGIN
  -- Security check: Ensure only the platform owner can execute this
  SELECT auth.email() INTO v_requester_email;
  IF v_requester_email != 'joao.almeida_msbrasil@outlook.com' THEN
    RAISE EXCEPTION 'Unauthorized: Only the platform owner can access global metrics.';
  END IF;

  -- 1. Tenants metrics
  SELECT count(*) INTO v_total_tenants FROM public.estabelecimento;
  SELECT count(*) INTO v_active_tenants FROM public.estabelecimento WHERE active = true; -- Adjust column name if different

  -- 2. Appointments metrics
  SELECT count(*) INTO v_total_appointments FROM public.agenda_events;

  -- 3. Mock MRR based on active tenants (e.g., 97 BRL per tenant on average)
  v_total_mrr := v_active_tenants * 97.00;

  -- 4. Mock AI messages
  v_ai_messages := v_total_appointments * 3;

  RETURN json_build_object(
    'totalTenants', COALESCE(v_total_tenants, 0),
    'activeTenants', COALESCE(v_active_tenants, 0),
    'totalMrr', v_total_mrr,
    'totalAppointments', COALESCE(v_total_appointments, 0),
    'aiMessagesSent', v_ai_messages
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_platform_tenants()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requester_email text;
  v_result json;
BEGIN
  -- Security check: Ensure only the platform owner can execute this
  SELECT auth.email() INTO v_requester_email;
  IF v_requester_email != 'joao.almeida_msbrasil@outlook.com' THEN
    RAISE EXCEPTION 'Unauthorized: Only the platform owner can access tenants list.';
  END IF;

  SELECT json_agg(
    json_build_object(
      'id', id,
      'nome', nome,
      'slug', slug,
      'status', CASE WHEN active THEN 'active' ELSE 'blocked' END,
      'plano', 'pro', -- mock for now
      'created_at', created_at
    ) ORDER BY created_at DESC
  ) INTO v_result
  FROM public.estabelecimento;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
