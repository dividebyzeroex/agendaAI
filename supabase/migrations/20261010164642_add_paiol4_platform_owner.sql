create or replace function private.bootstrap_verified_platform_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if lower(new.email) in ('joao.almeida.msbrasil@gmail.com','paiol4@gmail.com')
    and new.email_confirmed_at is not null then
  insert into private.platform_owners(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function private.bootstrap_verified_platform_owner() from public,anon,authenticated;
insert into private.platform_owners(user_id)
select id from auth.users
where lower(email)='paiol4@gmail.com' and email_confirmed_at is not null
on conflict do nothing;
