create or replace function public.owner_tenant_contacts() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_platform_owner() then raise exception 'Acesso restrito ao proprietário' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'email',u.email,'email_verified',u.email_confirmed_at is not null,'last_sign_in_at',u.last_sign_in_at,'telefone',e.telefone,'endereco',coalesce(nullif(e.endereco_completo,''),e.endereco),'cidade',e.cidade,'segmento',e.segmento) order by e.created_at desc) from public.estabelecimento e left join auth.users u on u.id=e.user_id),'[]'::jsonb);
end $$;
revoke all on function public.owner_tenant_contacts() from public, anon;
grant execute on function public.owner_tenant_contacts() to authenticated;
