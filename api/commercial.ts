import { createHmac } from 'node:crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { discoverBusinesses } from '../server/discovery.js';
import { Resend } from 'resend';
import { eligible,nextStage,messageFor,unsubscribeToken,validUnsubscribe,TERMS_VERSION } from '../server/commercial.js';

const env=(key:string)=>process.env[key]||'';
function config(){
 const required=['COMMERCIAL_UNSUBSCRIBE_SECRET','RESEND_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','COMMERCIAL_FROM','COMMERCIAL_REPLY_TO','COMMERCIAL_UNSUBSCRIBE_SECRET','PROJECT_URL','BUSINESS_LEGAL_NAME','BUSINESS_TAX_ID','BUSINESS_CONTACT_EMAIL'];
 const missing=required.filter(k=>!env(k));
 if(env('PROJECT_URL')&&!/^https:\/\//.test(env('PROJECT_URL'))) missing.push('PROJECT_URL_HTTPS');
 return {enabled:env('COMMERCIAL_ENABLED')==='true',ready:missing.length===0,missing,dailyLimit:Math.min(50,Math.max(1,Number(env('COMMERCIAL_DAILY_LIMIT'))||10))};
}
function db(){
 const url=env('NEXT_PUBLIC_SUPABASE_URL')||env('SUPABASE_URL');
 if(!url||!env('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('Database unavailable');
 return createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
}
async function owner(sb:SupabaseClient,token:string){
 const anon=env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY')||env('SUPABASE_ANON_KEY');
 if(!anon) return false;
 const client=createClient(env('NEXT_PUBLIC_SUPABASE_URL')||env('SUPABASE_URL'),anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data,error}=await client.rpc('is_platform_owner'); return !error&&data===true;
}
async function checked<T extends {error:any}>(promise:PromiseLike<T>):Promise<T>{const r=await promise;if(r.error)throw r.error;return r;}

export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try {
  const action=String(req.query['action']||'status');
  if(action==='terms'&&req.method==='GET') return res.status(200).json({name:env('BUSINESS_LEGAL_NAME'),taxId:env('BUSINESS_TAX_ID'),contact:env('BUSINESS_CONTACT_EMAIL'),address:env('BUSINESS_ADDRESS'),ready:env('CONTRACT_READY')==='true'});
  const sb=db();
  if(action==='interest' && req.method==='POST') {
   const b=req.body||{};
   const name=String(b.business_name||'').trim();
   const email=String(b.email||'').trim().toLowerCase();
   if (b.website) return res.status(202).json({ok:true});
   if (b.termsAccepted!==true || name.length<2 || name.length>160 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Informe seu negócio, um e-mail válido e aceite as condições.'});
   const secret=env('PUBLIC_BOOKING_RATE_SECRET');
   if(!secret)return res.status(503).json({error:'Cadastro temporariamente indisponível.'});
   const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
   const key=createHmac('sha256',secret).update(`pilot-interest:${ip}`).digest('hex');
   const {data:allowed,error:limitError}=await sb.rpc('consume_public_booking_limit',{p_key:key});
   if(limitError)return res.status(503).json({error:'Não foi possível registrar agora.'});
   if(!allowed)return res.status(429).json({error:'Muitas tentativas. Tente novamente em 15 minutos.'});
   // A public form is an interest request, not verified identity or marketing opt-in.
   await checked(sb.from('commercial_prospects').upsert({business_name:name,email,segment:'beleza',source_url:env('PROJECT_URL'),status:'new',consent_at:null,consent_source:'pilot-interest:2026-10-10'},{onConflict:'email',ignoreDuplicates:true}));
   return res.status(202).json({ok:true});
  }
  if(action==='unsubscribe'){
   const id=String(req.query['id']||'');const token=String(req.query['token']||'');
   if(!validUnsubscribe(id,token,env('COMMERCIAL_UNSUBSCRIBE_SECRET'))) return res.status(400).send('Link inválido.');
   if(req.method==='GET') { res.setHeader('Content-Type','text/html; charset=utf-8'); return res.status(200).send('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Descadastro AgendaAI</title><body><h1>Parar de receber mensagens comerciais</h1><p>Seu acesso à plataforma será mantido conforme seu plano.</p><form method="post"><button>Confirmar descadastro</button></form></body></html>'); }
   if(req.method!=='POST') return res.status(405).end();
   await checked(sb.from('commercial_prospects').update({unsubscribed_at:new Date().toISOString(),status:'unsubscribed'}).eq('id',id));
   await checked(sb.from('commercial_messages').update({status:'suppressed'}).eq('prospect_id',id).eq('status','queued'));
   return res.status(200).send('Descadastro concluído. Você não receberá novas mensagens comerciais.');
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const cron=action==='run'&&!!env('CRON_SECRET')&&token===env('CRON_SECRET');
  const {data:{user},error:authError}=cron?{data:{user:null},error:null}:await sb.auth.getUser(token);
  if(!cron&&(authError||!user)) return res.status(401).json({error:'Autenticação necessária.'});
  if(action==='enroll'){
   if(req.method!=='POST'||!user) return res.status(405).end();
   if(req.body?.termsAccepted!==true) return res.status(400).json({error:'Aceite os termos para continuar.'});
   await checked(sb.from('commercial_terms_acceptances').upsert({user_id:user.id,version:TERMS_VERSION,marketing_consent:req.body.marketingConsent===true},{onConflict:'user_id,version',ignoreDuplicates:true}));
   if(req.body.marketingConsent===true&&user.email&&user.email_confirmed_at){
    const {data:estab}=await checked(sb.from('estabelecimento').select('id,nome,segmento').eq('user_id',user.id).limit(1).maybeSingle());
    if(estab) await checked(sb.from('commercial_prospects').upsert({business_name:estab.nome,email:user.email.toLowerCase(),segment:estab.segmento||'servicos',estabelecimento_id:estab.id,status:'trial',consent_at:new Date().toISOString(),consent_source:`signup:${TERMS_VERSION}`},{onConflict:'email',ignoreDuplicates:true}));
   }
   return res.status(200).json({ok:true});
  }
  if(!cron&&!await owner(sb,token)) return res.status(403).json({error:'Acesso exclusivo ao proprietário da plataforma.'});
  if(action==='status'&&req.method==='GET'){
   const [{data:lastRuns},{data:prospects}]=await Promise.all([checked(sb.from('commercial_agent_runs').select('*').order('created_at',{ascending:false}).limit(20)),checked(sb.from('commercial_prospects').select('status'))]);
   return res.status(200).json({...config(),lastRuns,counts:{prospects:prospects?.length||0,contacted:prospects?.filter(p=>p.status==='contacted').length||0,trial:prospects?.filter(p=>p.status==='trial').length||0,won:prospects?.filter(p=>p.status==='won').length||0},discoveryReady:!!env('GOOGLE_PLACES_API_KEY')});
  }
  if(action==='prospect'&&req.method==='POST'){
   const b=req.body||{};const email=String(b.email||'').trim().toLowerCase();const name=String(b.business_name||'').trim();
   if(name.length<2||name.length>160||!/^\S+@\S+\.\S+$/.test(email)||email.length>254) return res.status(400).json({error:'Informe nome e e-mail válidos.'});
   if(b.source_url&&!/^https?:\/\//.test(b.source_url))return res.status(400).json({error:'Fonte deve ser um endereço HTTP válido.'});
   const {error}=await sb.from('commercial_prospects').insert({business_name:name,email,segment:String(b.segment||'servicos').slice(0,80),source_url:b.source_url||null,status:b.consent===true?'qualified':'new',consent_at:b.consent===true?new Date().toISOString():null,consent_source:b.consent===true?'owner_recorded':null});
   if(error) return res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'Este contato já está cadastrado.':'Não foi possível salvar.'});
   return res.status(201).json({ok:true});
  }
  if(action==='stage'&&req.method==='POST'){
   const allowed=['replied','lost'];
   if(!allowed.includes(req.body?.status))return res.status(400).json({error:'Etapa inválida.'});
   await checked(sb.from('commercial_prospects').update({status:req.body.status}).eq('id',req.body.id).is('unsubscribed_at',null));
   await checked(sb.from('commercial_messages').update({status:'suppressed'}).eq('prospect_id',req.body.id).eq('status','queued'));
   return res.status(200).json({ok:true});
  }
  if(action==='tenant'&&req.method==='POST'){
   if(typeof req.body?.active!=='boolean'||typeof req.body?.id!=='string') return res.status(400).json({error:'Dados inválidos.'});
   const {data}=await checked(sb.from('estabelecimento').update({active:req.body.active}).eq('id',req.body.id).select('id').single());
   await checked(sb.from('commercial_agent_runs').insert({agent:'owner',status:'completed',summary:{action:'tenant_access',id:data.id,active:req.body.active}}));
   return res.status(200).json({ok:true});
  }
  if(action==='run'&&(req.method==='POST'||(cron&&req.method==='GET')))return res.status(200).json(await run(sb));
  return res.status(405).json({error:'Operação não disponível.'});
 }catch(error){console.error('[commercial]',error instanceof Error?error.message:'operation failed');return res.status(503).json({error:'Operação indisponível. Verifique a configuração e as migrações no painel.'});}
}

async function run(sb:SupabaseClient){
 const c=config();
 if(!c.enabled||!c.ready){await checked(sb.from('commercial_agent_runs').insert({agent:'orchestrator',status:'blocked',summary:{missing:c.missing,enabled:c.enabled}}));return{status:'blocked',missing:c.missing,queued:0,sent:0,skipped:0};}
 const {data:locked}=await checked(sb.rpc('commercial_acquire_lock'));if(!locked)return{status:'busy',queued:0,sent:0,skipped:0};
 let sent=0,queued=0,skipped=0;
 try{
  const discovery = await discoverBusinesses(sb).catch(async () => { await checked(sb.from('commercial_agent_runs').insert({agent:'discovery',status:'failed',summary:{reason:'Provider or database unavailable'}})); return {status:'failed',discovered:0}; });
  // Reconcile CRM state before sending. Replies and opt-outs always stop nurture.
  const {data:prospects}=await checked(sb.from('commercial_prospects').select('*').is('unsubscribed_at',null).not('consent_at','is',null).in('status',['qualified','contacted','trial','won']).order('created_at').limit(100));
  for(const p of prospects||[]){
   let trialEnd:string|null=null;
   if(p.estabelecimento_id){
    const {data:e}=await checked(sb.from('estabelecimento').select('trial_ends_at,plano_expires_at,active').eq('id',p.estabelecimento_id).single());
    if(!e.active){skipped++;continue;}
    if(e.plano_expires_at&&Date.parse(e.plano_expires_at)>Date.now()){await checked(sb.from('commercial_prospects').update({status:'won'}).eq('id',p.id));p.status='won';}
    trialEnd=p.status==='won'?null:e.trial_ends_at;
   }
   const stage=nextStage(p,trialEnd);if(!stage||!eligible(p)){skipped++;continue;}
   const message=messageFor(stage,p.business_name,env('PROJECT_URL').replace(/\/$/,''));
   const {data}=await checked(sb.from('commercial_messages').upsert({prospect_id:p.id,stage,...message},{onConflict:'prospect_id,stage',ignoreDuplicates:true}).select('id'));
   queued+=data?.length||0;
  }
  const since=new Date(Date.now()-86400000).toISOString();
  const {count}=await checked(sb.from('commercial_messages').select('id',{count:'exact',head:true}).gte('locked_at',since).in('status',['sent','sending','failed']));
  const remaining=Math.max(0,c.dailyLimit-(count||0));
  if(remaining){
   const {data:messages}=await checked(sb.from('commercial_messages').select('*').eq('status','queued').lte('due_at',new Date().toISOString()).order('created_at').limit(remaining));
   const resend=new Resend(env('RESEND_API_KEY'));
   for(const m of messages||[]){
    const {data:p}=await checked(sb.from('commercial_prospects').select('*').eq('id',m.prospect_id).single());
    if(!eligible(p)||p.last_contact_at&&Date.now()-Date.parse(p.last_contact_at)<3*86400000){skipped++;continue;}
    const {data:claimed}=await checked(sb.from('commercial_messages').update({status:'sending',locked_at:new Date().toISOString(),attempts:m.attempts+1}).eq('id',m.id).eq('status','queued').select('id'));
    if(!claimed?.length)continue;
    const optout=`${env('PROJECT_URL')}/api/commercial?action=unsubscribe&id=${p.id}&token=${unsubscribeToken(p.id,env('COMMERCIAL_UNSUBSCRIBE_SECRET'))}`;
    try{
     const {data,error}=await resend.emails.send({from:env('COMMERCIAL_FROM'),to:p.email,replyTo:env('COMMERCIAL_REPLY_TO'),subject:m.subject,text:`${m.body}\n\n${env('BUSINESS_LEGAL_NAME')} · ${env('BUSINESS_TAX_ID')}\nContato: ${env('BUSINESS_CONTACT_EMAIL')}\nPara não receber novos e-mails: ${optout}`,headers:{'List-Unsubscribe':`<${optout}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}},{idempotencyKey:`commercial/${m.id}`});
     if(error||!data?.id)throw new Error(error?.message||'Provider rejected');
     await checked(sb.from('commercial_messages').update({status:'sent',provider_id:data.id,sent_at:new Date().toISOString()}).eq('id',m.id));
     await checked(sb.from('commercial_prospects').update({last_contact_at:new Date().toISOString(),...(p.status==='qualified'?{status:'contacted'}:{})}).eq('id',p.id));sent++;
    }catch{await checked(sb.from('commercial_messages').update({status:'failed',error:'Envio não confirmado. Revisão necessária antes de nova tentativa.'}).eq('id',m.id));}
   }
  }
  await checked(sb.from('commercial_agent_runs').insert({agent:'qualification-and-nurture',status:'completed',summary:{queued,sent,skipped}}));
  return{status:'completed',queued,sent,skipped,discovered:discovery.discovered};
 }finally{await checked(sb.rpc('commercial_release_lock'));}
}
