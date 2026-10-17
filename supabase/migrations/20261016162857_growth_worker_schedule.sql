-- Credential is generated inside the private schema and is never returned to a browser.
create table private.growth_worker_control(
 singleton boolean primary key default true check(singleton),
 token text not null default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
 lease_id uuid,lease_until timestamptz,last_run_at timestamptz,last_result jsonb,
 scheduler_enabled boolean not null default false
);
insert into private.growth_worker_control(singleton) values(true);
alter table private.growth_worker_control enable row level security;
revoke all on private.growth_worker_control from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,update on private.growth_worker_control to service_role;
create function public.claim_growth_worker(p_token text,p_platform boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c private.growth_worker_control; key uuid:=gen_random_uuid();
begin
 select * into c from private.growth_worker_control where singleton for update;
 if not p_platform and (p_token is null or length(p_token)<>64 or p_token<>c.token) then return jsonb_build_object('authorized',false); end if;
 if c.lease_until>now() then return jsonb_build_object('authorized',true,'busy',true); end if;
 update private.growth_worker_control set lease_id=key,lease_until=now()+interval '90 seconds' where singleton;
 return jsonb_build_object('authorized',true,'busy',false,'lease',key);
end $$;
create function public.finish_growth_worker(p_lease uuid,p_result jsonb) returns void language sql security invoker set search_path='' as $$
 update private.growth_worker_control set lease_until=null,lease_id=null,last_run_at=now(),last_result=p_result where singleton and lease_id=p_lease;
$$;
revoke all on function public.claim_growth_worker(text,boolean),public.finish_growth_worker(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_growth_worker(text,boolean),public.finish_growth_worker(uuid,jsonb) to service_role;
create function private.growth_worker_status(t uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.business_owner(t) then raise exception 'Acesso negado' using errcode='42501'; end if;
 return(select jsonb_build_object('scheduled',scheduler_enabled,'last_run_at',last_run_at,'running',lease_until>now(),'healthy',last_run_at>now()-interval '20 minutes' and coalesce((last_result->>'ok')::boolean,false)) from private.growth_worker_control where singleton);
end $$;
revoke all on function private.growth_worker_status(uuid) from public,anon;
grant execute on function private.growth_worker_status(uuid) to authenticated;
create function public.growth_worker_status(p_tenant uuid) returns jsonb language sql security invoker set search_path='' as $$select private.growth_worker_status(p_tenant)$$;
revoke all on function public.growth_worker_status(uuid) from public,anon;
grant execute on function public.growth_worker_status(uuid) to authenticated;
create function private.dispatch_growth_worker() returns void language plpgsql security definer set search_path='' as $$
declare credential text;
begin
 select token into credential from private.growth_worker_control where singleton;
 perform net.http_post(url:='https://agenda-ai-beryl.vercel.app/api/cron/bot-recepcao?worker=growth',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb,timeout_milliseconds:=50000);
end $$;
revoke all on function private.dispatch_growth_worker() from public,anon,authenticated,service_role;
-- Local migration tests do not install network/cron extensions. Production already has both.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
  perform cron.schedule('agendaai-growth-workers','*/5 * * * *','select private.dispatch_growth_worker()');
  update private.growth_worker_control set scheduler_enabled=true where singleton;
 end if;
end $$;
notify pgrst,'reload schema';
