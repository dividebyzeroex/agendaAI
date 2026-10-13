import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../server/http.js';

export default async function handler(req: VercelRequest,res: VercelResponse) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
 const url=process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
 const service=process.env['SUPABASE_SERVICE_ROLE_KEY'];
 if(!url||!service) return res.status(503).json({error:'Integração não configurada'});
 const authorization=req.headers.authorization;
 const jwt=typeof authorization==='string' && authorization.startsWith('Bearer ')?authorization.slice(7):'';
 if(!jwt) return res.status(401).json({error:'Autenticação necessária'});
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(jwt);
 if(authError || !user?.id || !user.email || !user.email_confirmed_at)
   return res.status(401).json({error:'Confirme o e-mail da conta para ativar a licença'});
 const {data:estab,error:estabError}=await db.from('estabelecimento')
   .select('id').eq('user_id',user.id).limit(1).maybeSingle();
 if(estabError || !estab) return res.status(409).json({error:'Conclua o cadastro da barbearia antes da ativação'});
 const {data:licenses,error:lookupError}=await db.from('hotmart_licenses')
   .select('transaction_id,estabelecimento_id,activated_at,expires_at')
   .eq('buyer_email',user.email.toLowerCase()).eq('status','approved')
   .order('created_at',{ascending:true}).limit(30);
 if(lookupError) return res.status(503).json({error:'Falha ao consultar compras'});
 const license=licenses?.find(l=>l.estabelecimento_id===estab.id || !l.estabelecimento_id);
 if(!license) return res.status(200).json({status:'no_purchase'});
 const {data,error}=await db.rpc('redeem_hotmart_license',{
   p_transaction:license.transaction_id,p_email:user.email.toLowerCase(),p_estabelecimento:estab.id
 });
 if(error) return res.status(409).json({error:'Não foi possível ativar a licença'});
 return res.status(200).json({status:'active',expiresAt:data?.[0]?.expires_at,activatedNow:data?.[0]?.redeemed});
}