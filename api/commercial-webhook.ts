import type {VercelRequest,VercelResponse} from '@vercel/node';
import {Resend} from 'resend';
import {adminClient} from '../server/security.js';
export const config={api:{bodyParser:false}};
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return res.status(405).end();
 if(!process.env['RESEND_WEBHOOK_SECRET']||!process.env['RESEND_API_KEY'])return res.status(503).json({error:'Integration unavailable'});
 try{
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)return res.status(413).end();chunks.push(Buffer.from(chunk));}
  const resend=new Resend(process.env['RESEND_API_KEY']);
  let event;
  try{event=resend.webhooks.verify({payload:Buffer.concat(chunks).toString(),headers:{id:String(req.headers['svix-id']||''),timestamp:String(req.headers['svix-timestamp']||''),signature:String(req.headers['svix-signature']||'')},webhookSecret:process.env['RESEND_WEBHOOK_SECRET']});}catch{return res.status(401).json({error:'Invalid signature'});}
  const db=adminClient();
  if(event.type==='email.received'){
   const raw=event.data.from;const email=(raw.match(/<([^>]+)>/)?.[1]||raw).trim().toLowerCase();
   const {data:p,error}=await db.from('commercial_prospects').select('id,status,unsubscribed_at').eq('email',email).maybeSingle();if(error)throw error;
   if(p&&!p.unsubscribed_at){
    const {error:updated}=await db.from('commercial_prospects').update({status:'replied'}).eq('id',p.id);if(updated)throw updated;
    const {error:suppressed}=await db.from('commercial_messages').update({status:'suppressed'}).eq('prospect_id',p.id).eq('status','queued');if(suppressed)throw suppressed;
   }
  }
  if(['email.bounced','email.complained','email.suppressed'].includes(event.type)){
   const data=event.data as {email_id?:string};
   if(data.email_id){
    const {data:message,error}=await db.from('commercial_messages').select('prospect_id').eq('provider_id',data.email_id).maybeSingle();if(error)throw error;
    if(message){const {error:updated}=await db.from('commercial_prospects').update({status:'unsubscribed',unsubscribed_at:new Date().toISOString()}).eq('id',message.prospect_id);if(updated)throw updated;}
   }
  }
  return res.status(200).json({received:true});
 }catch{return res.status(503).json({error:'Webhook processing failed'});}
}
