import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { BillingError, objectId, operationalBillingReadiness } from './billing.js';
import type { VercelRequest, VercelResponse } from './http.js';

export function validateOwnerTest(session: Stripe.Checkout.Session, userId?: string) {
  const ownerId = session.metadata?.['ownerUserId'];
  if (session.metadata?.['purpose'] !== 'owner_live_test' || !ownerId || session.client_reference_id !== ownerId
    || (userId && ownerId !== userId) || session.mode !== 'payment' || session.livemode !== true
    || session.amount_total !== 100 || session.currency !== 'brl') throw new BillingError(400, 'Sessão de teste inválida.');
  return ownerId;
}
export async function recordOwnerTest(db: SupabaseClient, session: Stripe.Checkout.Session, eventId?: string) {
  const ownerId = validateOwnerTest(session);
  if (session.payment_status !== 'paid' || session.status !== 'complete') return false;
  const at = new Date().toISOString();
  const patch = { status: 'paid', payment_intent_id: objectId(session.payment_intent),
    ...(eventId ? {webhook_at: at, webhook_event_id: eventId} : {verified_at: at}) };
  const {data,error} = await db.from('owner_payment_tests').update(patch).eq('id',session.id).eq('user_id',ownerId).select('id');
  if (error || !data?.length) throw new BillingError(503,'Não foi possível registrar a confirmação do teste.');
  return true;
}
export async function ownerPaymentTest(req: VercelRequest, res: VercelResponse, db: SupabaseClient, stripe: Stripe, user: {id:string;email?:string}) {
  const client = createClient(process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!, {
    global:{headers:{Authorization: String(req.headers.authorization)}},auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:owner,error:ownerError}=await client.rpc('is_platform_owner');
  if(ownerError || owner!==true) throw new BillingError(403,'Teste exclusivo do proprietário da plataforma.');
  if(req.query['action']==='owner-test-checkout') {
    if(req.body?.confirmed!==true) throw new BillingError(400,'Confirme a cobrança real de R$1.');
    const requestId=req.body?.requestId;
    if(typeof requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new BillingError(400,'Identificador de tentativa inválido.');
    const readiness=await operationalBillingReadiness();
    if(!readiness.ready || readiness.mode!=='live') throw new BillingError(503,'O Stripe precisa estar pronto em produção para este teste.');
    const origin=new URL(process.env['PROJECT_URL'] || '').origin;
    if(!origin.startsWith('https://')) throw new BillingError(503,'URL de produção inválida.');
    const base=origin+'/platform-admin/billing';
    const metadata={purpose:'owner_live_test',ownerUserId:user.id};
    const session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:user.email,
      line_items:[{quantity:1,price_data:{currency:'brl',unit_amount:100,product_data:{name:'AgendaAI — teste de produção do Owner',description:'Cobrança única de R$1. Sem assinatura ou renovação.'}}}],
      client_reference_id:user.id,metadata,payment_intent_data:{metadata},
      success_url:base+'?owner_test_session={CHECKOUT_SESSION_ID}',cancel_url:base+'?owner_test_cancelled=1'
    },{idempotencyKey:'owner-test:'+user.id+':'+requestId});
    validateOwnerTest(session,user.id);
    const {error}=await db.from('owner_payment_tests').upsert({id:session.id,user_id:user.id},{onConflict:'id',ignoreDuplicates:true});
    if(error) throw new BillingError(503,'Falha ao registrar o teste. Tente novamente.');
    return res.status(200).json({url:session.url});
  }
  const sessionId=req.query['session_id'];
  if(sessionId!==undefined) {
    if(typeof sessionId!=='string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new BillingError(400,'Sessão inválida.');
    const {data:registered,error}=await db.from('owner_payment_tests').select('id').eq('id',sessionId).eq('user_id',user.id).maybeSingle();
    if(error) throw new BillingError(503,'Falha ao consultar teste.');
    if(!registered) throw new BillingError(404,'Teste não encontrado para esta conta.');
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    validateOwnerTest(session,user.id);
    await recordOwnerTest(db,session);
    if(session.status==='expired') {
      const {error:expireError}=await db.from('owner_payment_tests').update({status:'expired'}).eq('id',sessionId).eq('status','pending');
      if(expireError) throw new BillingError(503,'Falha ao atualizar o teste.');
    }
  }
  const {data,error}=await db.from('owner_payment_tests').select('id,status,amount_cents,currency,payment_intent_id,verified_at,webhook_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);
  if(error) throw new BillingError(503,'Falha ao carregar histórico de testes.');
  return res.status(200).json({tests:data});
}
