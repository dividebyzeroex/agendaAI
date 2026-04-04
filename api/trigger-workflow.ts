/**
 * api/trigger-workflow.ts — Vercel Serverless
 * v3: + SEND_EMAIL with iCal + Professional Confirmation
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { sanitizeText, sanitizePhone, sanitizeDeep } from './utils/sanitize.js';
import { classifyWorkflowRequest } from './utils/workflowClassifier.js';
import { checkAndIncrement } from './utils/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = sanitizeDeep(req.body) as { trigger: string; payload: any };
  const { trigger, payload } = body;

  if (!trigger) return res.status(400).json({ error: 'trigger requerido' });

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
  const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY']!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const twilioSid   = process.env['TWILIO_ACCOUNT_SID'];
  const twilioToken = process.env['TWILIO_AUTH_TOKEN'];
  const twilioFrom  = process.env['TWILIO_PHONE_FROM'];
  const twClient = (twilioSid && twilioToken) ? twilio(twilioSid, twilioToken) : null;

  const { data: rules } = await supabase
    .from('workflows')
    .select('*')
    .eq('trigger', trigger)
    .eq('active', true);

  if (!rules || rules.length === 0) {
    return res.status(200).json({ success: true, message: 'Nenhuma regra ativa.', trigger });
  }

  const actions: string[] = [];

  for (const rule of rules) {
    const classification = classifyWorkflowRequest(trigger, rule.action, payload);
    if (!classification.allowed) {
      actions.push(`BLOCKED [${rule.name}]: ${classification.reason}`);
      continue;
    }

    if (rule.action === 'SEND_SMS') {
      const clienteId = payload?.cliente_id;
      let telefone: string | null = null;
      let nomeCliente = 'cliente';

      if (clienteId) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('nome, telefone')
          .eq('id', clienteId)
          .maybeSingle();
        telefone = cliente?.telefone || null;
        nomeCliente = sanitizeText(cliente?.nome || 'cliente');
      }

      const estabelecimentoId = payload?.estabelecimento_id;
      if (estabelecimentoId) {
        const quota = await checkAndIncrement(estabelecimentoId, 'sms');
        if (!quota.allowed) {
          actions.push(`SEND_SMS BLOCKED: limite do plano ${quota.plan} atingido`);
          continue;
        }
      }

      if (telefone && twClient && twilioFrom) {
        const horario = payload?.start ? new Date(payload.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const servico = sanitizeText(payload?.title || 'Agendamento');
        let msgBody = trigger === 'ON_EVENT_CREATED' ? `✅ Olá, ${nomeCliente}! Agendamento confirmado: *${servico}*${horario ? ` às ${horario}` : ''}.` : `Olá, ${nomeCliente}! Agendamento ${servico} atualizado.`;
        
        try {
          await twClient.messages.create({ body: msgBody, from: twilioFrom, to: sanitizePhone(telefone) });
          actions.push(`SEND_SMS → ${telefone}`);
        } catch (e: any) {
          actions.push(`SEND_SMS ERRO: ${e.message}`);
        }
      }
    }

    if (rule.action === 'SEND_EMAIL') {
      const { Resend } = require('resend');
      const resend = new Resend(process.env['RESEND_API_KEY']);
      
      const profId = payload?.profissional_id;
      if (profId) {
        const { data: prof } = await supabase.from('profissionais').select('nome, email').eq('id', profId).single();
        if (prof?.email) {
          const start = new Date(payload.start);
          const end   = new Date(payload.end || (start.getTime() + 60 * 60 * 1000));
          const ics   = generateICS(payload.title, start, end, prof.nome);
          const token = payload.token_confirmacao || '';
          
          const baseUrl = process.env['PROJECT_URL'] || `https://${req.headers.host}`;
          const acceptUrl = `${baseUrl}/api/respond-appointment?token=${token}&action=aceitar`;
          const denyUrl   = `${baseUrl}/api/respond-appointment?token=${token}&action=recusar`;

          try {
            await resend.emails.send({
              from: 'AgendaAi <notificacoes@agendaai.com.br>',
              to: prof.email,
              subject: `✂️ Novo Serviço: ${payload.title}`,
              html: `
                <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
                  <h2 style="color: #1a73e8;">Olá, ${prof.nome}!</h2>
                  <p>Um novo agendamento foi atribuído a você:</p>
                  <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <strong>${payload.title}</strong><br>
                    📅 ${start.toLocaleString('pt-BR')}<br>
                  </div>
                  <p>Por favor, confirme ou recuse este atendimento:</p>
                  <div style="margin-top: 20px;">
                    <a href="${acceptUrl}" style="background: #1a73e8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">ACEITAR</a>
                    <a href="${denyUrl}" style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin-left: 10px;">RECUSAR</a>
                  </div>
                </div>
              `,
              attachments: [{ filename: 'convite.ics', content: Buffer.from(ics).toString('base64') }],
            });
            actions.push(`SEND_EMAIL → ${prof.email}`);
          } catch (e: any) {
            actions.push(`SEND_EMAIL ERRO: ${e.message}`);
          }
        }
      }
    }

    if (rule.action === 'NOTIFY_ADMIN') {
      await supabase.from('agent_tasks').insert({ type: 'NOTIFY_ADMIN', payload: { trigger, message: payload?.title }, status: 'done', agent_owner: 'system', completed_at: new Date().toISOString() });
      actions.push(`NOTIFY_ADMIN registered.`);
    }

    if (rule.action === 'LOG_ACTIVITY') {
      await supabase.from('agent_tasks').insert({ type: 'LOG', payload: sanitizeDeep(payload), status: 'done', agent_owner: 'logger', completed_at: new Date().toISOString() });
      actions.push(`LOG_ACTIVITY registered.`);
    }
  }

  return res.status(200).json({ success: true, trigger, rulesExecuted: rules.length, actions });
}

function generateICS(title: string, start: Date, end: Date, prof: string) {
  const formatDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const now = formatDate(new Date());
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AgendaAi//NONSGML v1.0//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `DTSTAMP:${now}`, `UID:${now}-${Math.random().toString(36).substring(7)}`, `DTSTART:${formatDate(start)}`, `DTEND:${formatDate(end)}`, `SUMMARY:${title}`, 'DESCRIPTION:Agendamento via plataforma AgendaAi', `ORGANIZER;CN=${prof}:MAILTO:agenda@agendaai.com.br`, 'STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}
