create or replace function public.configure_client_setup(p_id uuid,p_changes jsonb,p_services jsonb,p_hours jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb; h jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 perform 1 from estabelecimento where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Acesso negado' using errcode='42501'; end if;
 if p_changes is null or p_services is null or p_hours is null or jsonb_typeof(p_changes)<>'object' then raise exception 'Configuração inválida'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_typeof(p_hours)<>'array' or jsonb_array_length(p_services)>50 or jsonb_array_length(p_hours)<>7 then raise exception 'Configuração inválida'; end if;
 if nullif(trim(p_changes->>'nome'),'') is null then raise exception 'Informe o nome do estabelecimento'; end if;
 update estabelecimento set nome=trim(p_changes->>'nome'),cidade=p_changes->>'cidade',telefone=p_changes->>'telefone',segmento=coalesce(nullif(p_changes->>'segmento',''),segmento) where id=p_id;
 for s in select value from jsonb_array_elements(p_services) loop
  if nullif(trim(s->>'titulo'),'') is null or (s->>'preco')::numeric<=0 or (s->>'duracao_min')::int<=0 then raise exception 'Serviço inválido'; end if;
  insert into servicos(estabelecimento_id,titulo,descricao,preco,duracao_min,emoji,ativo)
   select p_id,trim(s->>'titulo'),s->>'descricao',(s->>'preco')::numeric,(s->>'duracao_min')::int,s->>'emoji',true
   where not exists(select 1 from servicos where estabelecimento_id=p_id and lower(trim(titulo))=lower(trim(s->>'titulo')));
 end loop;
 if (select count(distinct (value->>'dia_semana')::int) from jsonb_array_elements(p_hours))<>7 then raise exception 'Dias duplicados'; end if;
 delete from horarios_funcionamento where estabelecimento_id=p_id;
 for h in select value from jsonb_array_elements(p_hours) loop
  if (h->>'dia_semana')::int not between 0 and 6 or (coalesce((h->>'ativo')::boolean,false) and (nullif(h->>'abre','') is null or nullif(h->>'fecha','') is null or (h->>'abre')::time >= (h->>'fecha')::time)) then raise exception 'Horário inválido'; end if;
  insert into horarios_funcionamento(estabelecimento_id,dia_semana,dia_nome,abre,fecha,ativo)
  values(p_id,(h->>'dia_semana')::int,h->>'dia_nome',nullif(h->>'abre','')::time,nullif(h->>'fecha','')::time,coalesce((h->>'ativo')::boolean,false));
 end loop;
 update estabelecimento set onboarding_completo=true where id=p_id;
end $$;
revoke all on function public.configure_client_setup(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.configure_client_setup(uuid,jsonb,jsonb,jsonb) to authenticated;
