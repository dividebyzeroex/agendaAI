import {campaignSchedule} from '../../server/business-campaigns.js';
import {appointmentMessagingReady} from '../../server/appointment-messaging.js';
/**
 * api/sms/send.ts — Vercel Serverless
 * v2: + Unicode Sanitization + Rate Limiting
 */
import type { VercelRequest, VercelResponse } from '../../server/http.js';
import twilio from 'twilio';
import { authorizeTenant, handleError, HttpError } from '../../server/security.js';
import { sanitizeText, sanitizePhone } from '../../server/sanitize.js';
import { checkAndIncrement } from '../../server/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if(req.query?.['action']==='campaign-schedule')return campaignSchedule(req,res);
  if(req.method==='GET'){
    try{const id=String(req.query['estabelecimento_id']||'');const db=await authorizeTenant(req,id);const [{data:settings,error},{data:messages,error:queueError}]=await Promise.all([db.from('appointment_messaging_settings').select('enabled').eq('estabelecimento_id',id).maybeSingle(),db.from('appointment_messages').select('id,kind,status,due_at,sent_at,error').eq('estabelecimento_id',id).order('created_at',{ascending:false}).limit(10)]);if(error||queueError)throw new Error('Fila indisponível');return res.status(200).json({ready:appointmentMessagingReady(),enabled:!!settings?.enabled,messages:messages||[],schedule:'Rotina diária às 08h de São Paulo; mensagens não são instantâneas.'});}catch(e){return handleError(res,e);}
  }
  if(req.method==='POST'&&req.query?.['action']==='settings'){
    try{const id=req.body?.estabelecimento_id;const db=await authorizeTenant(req,id);if(typeof req.body?.enabled!=='boolean')throw new HttpError(400,'Configuração inválida');if(req.body.enabled&&!appointmentMessagingReady())throw new HttpError(409,'SMS ainda não configurado e homologado.');const {error}=await db.from('appointment_messaging_settings').upsert({estabelecimento_id:id,enabled:req.body.enabled});if(error)throw error;return res.status(200).json({ok:true});}catch(e){return handleError(res,e);}
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
  const raw = (req.body || {}) as { to?: string; message?: string; tipo?: string; estabelecimento_id?: string };

  // ✅ 1. Sanitização Unicode — remover caracteres invisíveis maliciosos
  const to      = raw.to      ? sanitizePhone(raw.to) : null;
  const message = raw.message ? sanitizeText(raw.message).slice(0, 160) : null;
  const tipo    = raw.tipo    ? sanitizeText(raw.tipo) : 'manual';
  const estabelecimentoId = raw.estabelecimento_id;

  if (!to || !message) {
    return res.status(400).json({ error: 'Campos obrigatórios: to, message' });
  }

  const db = await authorizeTenant(req, estabelecimentoId);
  const { data: customers, error: customerError } = await db.from('clientes').select('telefone').eq('estabelecimento_id', estabelecimentoId);
  if (customerError || !customers?.some(c => sanitizePhone(c.telefone || '') === to)) throw new HttpError(403, 'Destinatário não cadastrado neste estabelecimento.');
  const sid = process.env['TWILIO_ACCOUNT_SID'];
  const token = process.env['TWILIO_AUTH_TOKEN'];
  const from = process.env['TWILIO_PHONE_FROM'];
  if (!sid || !token || !from) throw new HttpError(503, 'Envio de SMS não configurado.');

  // ✅ 2. Rate Limiting — verificar quota de SMS do plano
  if (estabelecimentoId) {
    const quota = await checkAndIncrement(estabelecimentoId, 'sms');
    if (!quota.allowed) {
      return res.status(429).json({
        error: `Limite de SMS atingido para o plano ${quota.plan}.`,
        current: quota.current,
        limit: quota.limit,
        resetAt: quota.resetAt,
        upgrade: 'https://agendaai.vercel.app/#precos',
      });
    }
  }

  try {
    const client = twilio(sid, token);
    const result = await client.messages.create({ body: message, from, to });



    return res.status(200).json({
      success: true,
      sid: result.sid,
      to,
      status: result.status,
    });
  } catch (err: any) {
    console.error('[SMS] Erro Twilio:', err.message);
    return res.status(502).json({ error: 'O provedor não aceitou o envio.' });
  }
  } catch (error) { return handleError(res, error); }
}
