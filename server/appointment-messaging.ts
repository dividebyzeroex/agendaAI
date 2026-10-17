import { createDecipheriv } from 'node:crypto';
import twilio from 'twilio';
import { adminClient } from './security.js';
import { checkAndIncrement } from './rateLimit.js';
export function appointmentMessagingReady(){
 return process.env['APPOINTMENT_SMS_VERIFIED']==='true' && !!process.env['TWILIO_ACCOUNT_SID'] && !!process.env['TWILIO_AUTH_TOKEN'] && !!process.env['TWILIO_PHONE_FROM'];
}
export function reminderPhone(value:string,key?:string|null){
 let plain=value||'';
 if(!/^\+?[\d\s().-]{10,20}$/.test(plain)){
  if(!key)throw Error('Contato indisponível');
  const bytes=Buffer.from(plain,'base64');if(bytes.length<29)throw Error('Contato inválido');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(bytes.length-16));
  plain=Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');
 }
 const digits=plain.replace(/\D/g,'');
 if(/^[1-9]\d{9,10}$/.test(digits))return '+55'+digits;
 if(/^55[1-9]\d{9,10}$/.test(digits))return '+'+digits;
 throw Error('Telefone brasileiro inválido');
}
export function operationalMessage(kind:string,business:string,start:string){
 const when=new Date(start).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const action=kind==='canceled'?'Horario cancelado':kind==='changed'?'Horario alterado':kind==='created'?'Agendamento registrado':'Lembrete do seu horario';
 return `${business.slice(0,45)}: ${action} para ${when}. Para ajustes, fale com o estabelecimento.`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').slice(0,160);
}
export async function runAppointmentMessages(deps?:{db?:any;send?:(to:string,body:string)=>Promise<{sid:string}>;quota?:(id:string)=>Promise<{allowed:boolean}>}){
 if(!appointmentMessagingReady())return {status:'not_configured_or_verified',sent:0,failed:0,skipped:0};
 const db=deps?.db||adminClient();
 const checked=async(q:any)=>{const r=await q;if(r.error)throw Error('Fila de notificações indisponível');return r;};
 // Uncertain sends require reconciliation at the provider, never blind automatic retry.
 await checked(db.from('appointment_messages').update({status:'failed',error:'Envio incerto: conferir provedor antes de qualquer nova tentativa.'}).eq('status','sending').lt('locked_at',new Date(Date.now()-15*60000).toISOString()));
 const {data:messages}=await checked(db.from('appointment_messages').select('*').eq('status','queued').lte('due_at',new Date().toISOString()).order('due_at').limit(10));
 const send=deps?.send||((to:string,body:string)=>twilio(process.env['TWILIO_ACCOUNT_SID']!,process.env['TWILIO_AUTH_TOKEN']!,{timeout:8000,autoRetry:false}).messages.create({to,body,from:process.env['TWILIO_PHONE_FROM']!}));
 let sent=0,failed=0,skipped=0;const notified=new Set<string>();const deadline=Date.now()+40000;
 for(const m of messages||[]){
  if(Date.now()>=deadline)break;
  const {data:claim}=await checked(db.from('appointment_messages').update({status:'sending',locked_at:new Date().toISOString()}).eq('id',m.id).eq('status','queued').select('id').maybeSingle());
  if(!claim)continue;
  let providerId:string|null=null;
  try{
   const {data:c}=await checked(db.rpc('appointment_message_context',{p_message:m.id}));
   const stale=!c||!c.enabled||!c.active||!Number.isFinite(Date.parse(c.access_until||''))||Date.parse(c.access_until||'')<=Date.now()||c.opt_out||Date.parse(c.start)<=Date.now()||Date.parse(c.start)!==Date.parse(m.event_start)||Date.parse(c.end)!==Date.parse(m.event_end)||
    (m.kind==='canceled'?c.status!=='cancelado':!['confirmado','pendente'].includes(c.status)||Date.parse(c.start)<=Date.now());
   if(stale||notified.has(m.event_id)){await checked(db.from('appointment_messages').update({status:'suppressed',error:'Preferência, acesso ou agendamento alterado.'}).eq('id',m.id).eq('status','sending'));skipped++;continue;}
   const to=reminderPhone(c.phone,c.key);
   const quota=await(deps?.quota?deps.quota(m.estabelecimento_id):checkAndIncrement(m.estabelecimento_id,'sms'));
   if(!quota.allowed){await checked(db.from('appointment_messages').update({status:'suppressed',error:'Limite do plano ou acesso indisponível.'}).eq('id',m.id));skipped++;continue;}
   const response=await send(to,operationalMessage(m.kind,c.business,c.start));
   if(!response.sid)throw Error('Envio não confirmado');
   providerId=response.sid;notified.add(m.event_id);
   await checked(db.from('appointment_messages').update({status:'sent',provider_id:response.sid,sent_at:new Date().toISOString(),error:null}).eq('id',m.id).eq('status','sending'));
   sent++;
  }catch{
   await checked(db.from('appointment_messages').update({status:'failed',provider_id:providerId,error:'Envio não confirmado. Conferir provedor antes de repetir.'}).eq('id',m.id).eq('status','sending'));failed++;
  }
 }
 return {status:'completed',sent,failed,skipped};
}
