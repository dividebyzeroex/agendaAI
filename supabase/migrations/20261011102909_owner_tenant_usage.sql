create or replace function public.owner_tenant_usage() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null or not private.is_platform_owner() then raise exception 'Acesso restrito ao proprietário' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(row_data order by created_at desc) from (
 select e.created_at,jsonb_build_object(
 'id',e.id,'nome',e.nome,'slug',e.slug,'owner_verified',exists(select 1 from auth.users u where u.id=e.user_id and u.email_confirmed_at is not null),
 'clients',(select count(*) from clientes c where c.estabelecimento_id=e.id),
 'appointments',(select count(*) from agenda_events a where a.estabelecimento_id=e.id),
 'appointments_7d',(select count(*) from agenda_events a where a.estabelecimento_id=e.id and a.created_at>=now()-interval '7 days'),
 'completed',(select count(*) from agenda_events a where a.estabelecimento_id=e.id and a.status='concluido'),
 'public_bookings',(select count(*) from agenda_events a where a.estabelecimento_id=e.id and a.metadata->>'origin'='public_booking'),
 'latest_record_at',(select max(t) from (select max(created_at) t from clientes where estabelecimento_id=e.id union all select max(created_at) from servicos where estabelecimento_id=e.id union all select max(created_at) from produtos where estabelecimento_id=e.id union all select max(created_at) from agenda_events where estabelecimento_id=e.id) activity),
 'services',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nome',s.titulo,'preco',s.preco,'duracao',s.duracao_min,'ativo',s.ativo) order by s.titulo),'[]') from servicos s where s.estabelecimento_id=e.id),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'preco',p.preco,'estoque',p.estoque,'ativo',p.ativo) order by p.nome),'[]') from produtos p where p.estabelecimento_id=e.id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'ativo',p.ativo,'role',p.role,'last_access',p.ultimo_acesso,'services',(select count(*) from profissional_servicos ps where ps.profissional_id=p.id and ps.estabelecimento_id=e.id),'availability',exists(select 1 from profissional_disponibilidades pd where pd.profissional_id=p.id and pd.estabelecimento_id=e.id and pd.ativo)) order by p.nome),'[]') from profissionais p where p.estabelecimento_id=e.id)
 ) row_data from estabelecimento e
 ) rows),'[]'::jsonb);
end $$;
revoke all on function public.owner_tenant_usage() from public,anon;
grant execute on function public.owner_tenant_usage() to authenticated;
