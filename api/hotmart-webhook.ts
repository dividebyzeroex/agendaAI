import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../server/http.js';

const respond = (res: VercelResponse, status: number, body: object) => res.status(status).json(body);
const eq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
};
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST') return respond(res,405,{error:'Método não permitido'});
  const url=process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key=process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const hottok=process.env['HOTMART_HOTTOK'];
  const product=process.env['HOTMART_PRODUCT_ID'];
  if(!url || !key || !hottok || !product) return respond(res,503,{error:'Hotmart não configurada'});
  const header=req.headers['x-hotmart-hottok'];
  const token=Array.isArray(header)?header[0]:header;
  if(!token || !eq(token,hottok)) return respond(res,401,{error:'Não autorizado'});
  const payload=req.body || {};
  const event=String(payload.event || '');
  if(!['PURCHASE_APPROVED','PURCHASE_REFUNDED','PURCHASE_CHARGEBACK','PURCHASE_CANCELED'].includes(event))
    return respond(res,200,{ignored:true});
  const data=payload.data || {};
  const tx=String(data.purchase?.transaction || '').trim();
  const pid=String(data.product?.id || '');
  const email=String(data.buyer?.email || '').trim().toLowerCase();
  if(pid !== product) return respond(res,200,{ignored:true});
  if(!tx || !email || email.length>320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return respond(res,400,{error:'Dados inválidos'});
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const revoked=event !== 'PURCHASE_APPROVED';
  const {data:existing,error:readError}=await db.from('hotmart_licenses').select('*').eq('transaction_id',tx).maybeSingle();
  if(readError) return respond(res,503,{error:'Falha ao consultar licença'});
  // A reversal is terminal; stale out-of-order approval must never restore it.
  if(existing?.status==='revoked' && !revoked) return respond(res,200,{ok:true,ignored:'terminal'});
  const record={
    transaction_id:tx,product_id:pid,buyer_email:email,
    buyer_name:String(data.buyer?.name || '').slice(0,200),
    status:revoked?'revoked':'approved',event_id:String(payload.id||'').slice(0,150),
    updated_at:new Date().toISOString()
  };
  const {error}=await db.from('hotmart_licenses').upsert(record,{onConflict:'transaction_id'});
  if(error) return respond(res,503,{error:'Falha ao registrar compra'});
  if(revoked && existing?.estabelecimento_id && existing.expires_at) {
    // Only revoke entitlement when Hotmart is the current source of the exact expiration
    // and there is no Stripe subscription; never cancel unrelated paid access.
    const {data:e}=await db.from('estabelecimento').select('plano_expires_at,stripe_subscription_id').eq('id',existing.estabelecimento_id).maybeSingle();
    if(e && !e.stripe_subscription_id && e.plano_expires_at===existing.expires_at) {
      await db.from('estabelecimento').update({plano_expires_at:new Date().toISOString()})
        .eq('id',existing.estabelecimento_id).eq('plano_expires_at',existing.expires_at);
    }
  }
  return respond(res,200,{ok:true});
}
