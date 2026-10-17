create table public.owner_payment_tests (
 id text primary key check(id like 'cs_%'),
 user_id uuid not null references auth.users(id),
 amount_cents integer not null default 100 check(amount_cents=100),
 currency text not null default 'brl' check(currency='brl'),
 status text not null default 'pending' check(status in ('pending','paid','expired')),
 payment_intent_id text,
 verified_at timestamptz,
 webhook_at timestamptz,
 webhook_event_id text,
 created_at timestamptz not null default now()
);
alter table public.owner_payment_tests enable row level security;
revoke all on public.owner_payment_tests from anon,authenticated;
grant select on public.owner_payment_tests to authenticated;
grant all on public.owner_payment_tests to service_role;
create policy owner_payment_tests_read on public.owner_payment_tests for select to authenticated
 using(user_id=(select auth.uid()) and (select private.is_platform_owner()));
