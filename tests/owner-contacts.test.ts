import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('only platform owners can read responsible account contacts', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table private.platform_owners(user_id uuid);
    create function private.is_platform_owner() returns boolean language sql as $$select exists(select 1 from private.platform_owners where user_id=auth.uid())$$;
    create table auth.users(id uuid,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
    create table public.estabelecimento(id uuid,user_id uuid,telefone text,endereco text,endereco_completo text,cidade text,segmento text,created_at timestamptz);
    insert into private.platform_owners values('10000000-0000-4000-8000-000000000001');
    insert into auth.users values('20000000-0000-4000-8000-000000000001','owner@example.com',now(),now());
    insert into estabelecimento values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','11999999999','Old street','New street','São Paulo','salao',now());`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261011123443_owner_tenant_contacts.sql', import.meta.url), 'utf8'));
  await db.exec('set role anon');
  await expect(db.query('select public.owner_tenant_contacts()')).rejects.toThrow();
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false)");
  await expect(db.query('select public.owner_tenant_contacts()')).rejects.toThrow('Acesso restrito');
  await db.query("select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false)");
  const result = await db.query<{data: any[]}>('select public.owner_tenant_contacts() as data');
  expect(result.rows[0].data[0]).toMatchObject({email:'owner@example.com',email_verified:true,endereco:'New street'});
  expect(Object.keys(result.rows[0].data[0]).sort()).toEqual(['cidade','email','email_verified','endereco','id','last_sign_in_at','segmento','telefone'].sort());
  await db.close();
});
