import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error('DB VALIDATION FAILED:',e.message);process.exit(1)});
const snapshot=JSON.parse(await readFile(new URL('./schema-fixture.json',import.meta.url),'utf8'));
const db=new PGlite({extensions:{btree_gist}});
const qid=x=>'"'+x.replaceAll('"','""')+'"';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_admin superuser;
create schema auth; create schema extensions; create schema vault;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.email() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.email',true),'')$$;
create function auth.role() returns text language sql stable as $$select current_user::text$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'email',auth.email())$$;
grant usage on schema auth to anon,authenticated,service_role;
create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
create table vault.decrypted_secrets(name text,decrypted_secret text);`);
const enums=new Map();for(const e of snapshot.enums||[]){if(!enums.has(e.name))enums.set(e.name,[]);enums.get(e.name).push(e.value);}
for(const [name,values]of enums)await db.exec(`create type ${qid(name)} as enum (${values.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')})`);
const tables=new Map();for(const c of snapshot.columns){if(!tables.has(c.table))tables.set(c.table,[]);tables.get(c.table).push(c);}
for(const [name,cols]of tables){await db.exec(`create table public.${qid(name)} (${cols.map(c=>`${qid(c.name)} ${c.type}${c.default?' default '+c.default:''}${c.name==='id'?' primary key':''}`).join(',')}); alter table public.${qid(name)} enable row level security; grant all on public.${qid(name)} to anon,authenticated,service_role;`);}
// Load observed function definitions, resolving SQL-function dependency order.
let pending=[...snapshot.functions];
for(let pass=0;pending.length&&pass<5;pass++){
 const next=[];for(const fn of pending){try{await db.exec(fn);}catch(e){next.push(fn);if(pass===4)throw new Error(fn.slice(0,140)+'\n'+e.message);}}pending=next;
}
for(const p of snapshot.policies){if(!tables.has(p.table))continue; await db.exec(`create policy ${qid(p.name)} on public.${qid(p.table)} for ${p.cmd} to ${p.roles.map(qid).join(',')}${p.qual?' using ('+p.qual+')':''}${p.check?' with check ('+p.check+')':''}`);}
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',tenant='20000000-0000-4000-8000-000000000001';
await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,'joao.almeida_msbrasil@outlook.com',now()),($2,'other@example.test',now())`,[owner,other]);
for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort()){
 if(!f.endsWith('.sql'))continue;
 await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 console.log('APPLIED LOCALLY',f);
}
await db.query(`insert into public.estabelecimento(id,user_id,nome,slug) values($1,$2,'Test Business','test-business')`,[tenant,owner]);
const trial=await db.query(`select round(extract(epoch from trial_ends_at-now())/86400) as days from estabelecimento where id=$1`,[tenant]);
assert.equal(Number(trial.rows[0].days),30);
async function asRole(role,id,sql,params=[]){await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${id||''}',false);`);try{return await db.query(sql,params);}finally{await db.exec('reset role');}}
await assert.rejects(()=>asRole('anon','',`select public.get_platform_metrics()`));
await assert.rejects(()=>asRole('authenticated',other,`select public.get_platform_metrics()`));
const metrics=await asRole('authenticated',owner,`select public.get_platform_metrics() as data`);
assert.equal(metrics.rows[0].data.totalTenants,1);assert.equal(metrics.rows[0].data.totalMrr,0);
await assert.rejects(()=>asRole('authenticated',owner,`update public.estabelecimento set plano_expires_at=now()+interval '1 year' where id=$1`,[tenant]));
await assert.rejects(()=>asRole('authenticated',other,`select public.get_user_profile_safe($1)`,[owner]));
await assert.rejects(()=>asRole('anon','',`select * from public.profissional_otps`));
const pub=await asRole('anon','',`select user_id,stripe_customer_id,trial_ends_at from public.get_public_estabelecimento_by_slug('test-business')`);
assert.equal(pub.rows[0].user_id,null);assert.equal(pub.rows[0].stripe_customer_id,null);assert.equal(pub.rows[0].trial_ends_at,null);
assert.equal((await asRole('authenticated',other,`select * from public.commercial_prospects`)).rows.length,0);
const lock1=await asRole('service_role','',`select public.commercial_acquire_lock() as lock`);
const lock2=await asRole('service_role','',`select public.commercial_acquire_lock() as lock`);
assert.equal(lock1.rows[0].lock,true);assert.equal(lock2.rows[0].lock,false);
// The exclusion constraint serializes competing reservations at the database layer.
await db.query(`insert into agenda_events(id,estabelecimento_id,start,"end",status) values(gen_random_uuid(),$1,now()+interval '1 day',now()+interval '1 day 1 hour','confirmado')`,[tenant]);
await assert.rejects(()=>db.query(`insert into agenda_events(id,estabelecimento_id,start,"end",status) values(gen_random_uuid(),$1,now()+interval '1 day 30 minutes',now()+interval '1 day 2 hours','confirmado')`,[tenant]));
for(let i=0;i<5;i++)assert.equal((await asRole('service_role','',`select consume_public_booking_limit('test-hash') as allowed`)).rows[0].allowed,true);
assert.equal((await asRole('service_role','',`select consume_public_booking_limit('test-hash') as allowed`)).rows[0].allowed,false);
await assert.rejects(()=>asRole('authenticated',owner,`update estabelecimento set stripe_livemode=true where id=$1`,[tenant]));
await db.query(`update estabelecimento set stripe_subscription_status='active',stripe_mrr_cents=9700,plano_expires_at=now()+interval '1 month',stripe_livemode=false where id=$1`,[tenant]);
assert.equal((await asRole('authenticated',owner,`select get_platform_metrics() as data`)).rows[0].data.totalMrr,0);
await db.query(`update estabelecimento set stripe_livemode=true where id=$1`,[tenant]);
assert.equal((await asRole('authenticated',owner,`select get_platform_metrics() as data`)).rows[0].data.totalMrr,97);
await db.query(`update estabelecimento set plano_expires_at=null where id=$1`,[tenant]);
for(let i=0;i<5;i++)await db.query(`insert into profissionais(id,estabelecimento_id,nome,ativo) values(gen_random_uuid(),$1,'Professional',true)`,[tenant]);
await assert.rejects(()=>db.query(`insert into profissionais(id,estabelecimento_id,nome,ativo) values(gen_random_uuid(),$1,'Excess',true)`,[tenant]));
const pendingOwner='10000000-0000-4000-8000-000000000003';
await db.query(`insert into auth.users(id,email) values($1,'joao.almeida.msbrasil@gmail.com')`,[pendingOwner]);
assert.equal((await db.query(`select count(*)::int n from private.platform_owners where user_id=$1`,[pendingOwner])).rows[0].n,0);
await db.query(`update auth.users set email_confirmed_at=now() where id=$1`,[pendingOwner]);
assert.equal((await db.query(`select count(*)::int n from private.platform_owners where user_id=$1`,[pendingOwner])).rows[0].n,1);
const paiolOwner='10000000-0000-4000-8000-000000000004';
await db.query(`insert into auth.users(id,email) values($1,'paiol4@gmail.com')`,[paiolOwner]);
assert.equal((await db.query(`select count(*)::int n from private.platform_owners where user_id=$1`,[paiolOwner])).rows[0].n,0);
await db.query(`update auth.users set email_confirmed_at=now() where id=$1`,[paiolOwner]);
assert.equal((await asRole('authenticated',paiolOwner,`select is_platform_owner() as allowed`)).rows[0].allowed,true);
assert.equal((await asRole('authenticated',paiolOwner,`select get_platform_metrics() as data`)).rows[0].data.prospects,0);
await db.query(`update estabelecimento set trial_ends_at=now()-interval '1 day' where id=$1`,[tenant]);
assert.equal((await asRole('authenticated',owner,`select * from get_meus_estabelecimentos()`)).rows.length,0);
assert.equal((await asRole('authenticated',owner,`select id from estabelecimento where id=$1`,[tenant])).rows.length,1);
console.log('PASS: local migration compatibility, 30-day trial, owner authorization, private fields, anonymous denial, billing tamper prevention, CRM isolation, worker lock.');
await db.close();
