-- Select the professional profile of the active unit, not the first linked profile.
create or replace function public.unit_context(p_tenant uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'segmento',e.segmento,'telefone',e.telefone,'cidade',e.cidade,'logo_url',e.logo_url,'cor_primaria',e.cor_primaria,'onboarding_completo',e.onboarding_completo,'trial_ends_at',e.trial_ends_at,'plano_expires_at',e.plano_expires_at,'plano',e.plano,'active',e.active,'cnpj',e.cnpj,'endereco',e.endereco,'endereco_completo',e.endereco_completo,'descricao',e.descricao,'config_fidelidade',e.config_fidelidade,'role',public.unit_access_role(e.id),'profile_id',case when e.user_id=auth.uid() then e.id else (select p.id from public.profissionais p where p.estabelecimento_id=e.id and p.user_id=auth.uid() and p.ativo limit 1) end)
 from public.estabelecimento e where e.id=p_tenant and public.unit_access_role(e.id) is not null;
$$;
revoke all on function public.unit_context(uuid) from public,anon;
grant execute on function public.unit_context(uuid) to authenticated;
notify pgrst,'reload schema';
