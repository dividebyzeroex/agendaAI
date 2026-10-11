create table public.support_messages (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id),
 estabelecimento_id uuid references public.estabelecimento(id),
 category text not null check(category in ('falha','sugestao','duvida')),
 body text not null check(length(trim(body)) between 10 and 3000),
 page_path text not null default '' check(length(page_path)<=300),
 status text not null default 'aberto' check(status in ('aberto','em_analise','respondido','resolvido')),
 owner_reply text check(length(owner_reply)<=3000),
 created_at timestamptz not null default now(),
 replied_at timestamptz
);
create index support_messages_user_created on public.support_messages(user_id,created_at desc);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon,authenticated;
grant select on public.support_messages to authenticated;
grant insert(category,body,page_path,estabelecimento_id) on public.support_messages to authenticated;
grant update(status,owner_reply,replied_at) on public.support_messages to authenticated;
create policy support_read on public.support_messages for select to authenticated using(user_id=(select auth.uid()) or (select private.is_platform_owner()));
create policy support_submit on public.support_messages for insert to authenticated with check(user_id=(select auth.uid()) and (estabelecimento_id is null or estabelecimento_id in (select public.get_meus_estabelecimentos())) and status='aberto' and owner_reply is null and replied_at is null);
create policy support_owner_update on public.support_messages for update to authenticated using((select private.is_platform_owner())) with check((select private.is_platform_owner()));
