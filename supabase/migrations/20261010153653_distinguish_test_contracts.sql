create or replace function public.get_platform_tenants() returns json language plpgsql security definer set search_path='' as $$
declare result json;
begin
 if not private.is_platform_owner() then raise exception 'Unauthorized' using errcode='42501'; end if;
 select coalesce(json_agg(json_build_object('id',id,'nome',nome,'slug',slug,'status',case when not active then 'blocked' when plano_expires_at>now() and stripe_livemode then 'paid' when plano_expires_at>now() then 'test_payment' when trial_ends_at>now() then 'trial' else 'expired' end,'plano',plano,'created_at',created_at,'trial_ends_at',trial_ends_at) order by created_at desc),'[]'::json) into result from public.estabelecimento;
 return result;
end; $$;
