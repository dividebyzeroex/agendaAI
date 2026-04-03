/**
 * api/trigger-workflow.ts — Vercel Serverless
 * v2: + Unicode Sanitization + Workflow Classifier + Rate Limiting
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

  // ✅ 1. Sanitização profunda de todo o body
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

  // Busca regras ativas para este trigger
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
    // ✅ 2. Classifier — valida trigger + action + payload antes de executar
    const classification = classifyWorkflowRequest(trigger, rule.action, payload);
    if (!classification.allowed) {
      actions.push(`BLOCKED [${rule.name}]: ${classification.reason}`);
      console.warn(`[Classifier] Bloqueado: ${classification.reason}`);
      continue;
    }

    console.log(`[Workflow] "${rule.name}" → ${rule.action} [risk: ${classification.risk}]`);

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

      if (!telefone) {
        actions.push(`SEND_SMS skipped: cliente sem telefone.`);
        continue;
      }

      // ✅ 3. Rate limiting para SMS
      const estabelecimentoId = payload?.estabelecimento_id;
      if (estabelecimentoId) {
        const quota = await checkAndIncrement(estabelecimentoId, 'sms');
        if (!quota.allowed) {
          actions.push(`SEND_SMS BLOCKED: limite do plano ${quota.plan} atingido (${quota.current}/${quota.limit})`);
          continue;
        }
      }

      const horario = payload?.start
        ? new Date(payload.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '';
      const servico = sanitizeText(payload?.title || 'Agendamento');

      let msgBody = '';
      if (trigger === 'ON_EVENT_CREATED') {
        msgBody = `✅ Olá, ${nomeCliente}! Agendamento confirmado: *${servico}*${horario ? ` às ${horario}` : ''}. — AgendaAi`;
      } else if (trigger === 'ON_EVENT_CANCELED') {
        msgBody = `😔 Olá, ${nomeCliente}! Agendamento *${servico}* cancelado. Deseja reagendar? — AgendaAi`;
      } else if (trigger === 'ON_REMINDER_DUE') {
        msgBody = `⏰ Lembrete, ${nomeCliente}! Você tem *${servico}* ${horario ? `às ${horario}` : 'em breve'}. Responda CONFIRMAR ou CANCELAR. — AgendaAi`;
      } else {
        msgBody = sanitizeText(rule.message_template || `Olá, ${nomeCliente}! Mensagem do AgendaAi.`);
      }

      const toNormalized = sanitizePhone(telefone);

      if (twClient && twilioFrom) {
        try {
          const result = await twClient.messages.create({ body: msgBody, from: twilioFrom, to: toNormalized });
          actions.push(`SEND_SMS → ${toNormalized} [SID: ${result.sid}]`);
        } catch (e: any) {
          actions.push(`SEND_SMS ERRO: ${e.message}`);
        }
      } else {
        actions.push(`SEND_SMS SIMULADO → ${toNormalized}`);
        console.log(`[SMS SIMULADO] ${toNormalized}: ${msgBody}`);
      }
    }

    if (rule.action === 'NOTIFY_ADMIN') {
      // Registra na tabela agent_tasks para o painel de atividades
      await supabase.from('agent_tasks').insert({
        type: 'NOTIFY_ADMIN',
        payload: { trigger, message: `Trigger "${trigger}" ativo para "${payload?.title}".` },
        status: 'done',
        agent_owner: 'system',
        completed_at: new Date().toISOString(),
      });
      actions.push(`NOTIFY_ADMIN: "${trigger}" registrado.`);
    }

    if (rule.action === 'ADD_TAG') {
      if (payload?.cliente_id && rule.tag_value) {
        await supabase
          .from('clientes')
          .update({ tags: supabase.rpc('array_append', { arr: 'tags', val: rule.tag_value }) })
          .eq('id', payload.cliente_id);
        actions.push(`ADD_TAG: "${rule.tag_value}" → cliente ${payload.cliente_id}`);
      }
    }

    if (rule.action === 'LOG_ACTIVITY') {
      await supabase.from('agent_tasks').insert({
        type: 'LOG',
        payload: sanitizeDeep(payload),
        status: 'done',
        agent_owner: 'logger',
        completed_at: new Date().toISOString(),
      });
      actions.push(`LOG_ACTIVITY: evento "${trigger}" registrado.`);
    }
  }

  return res.status(200).json({
    success: true,
    trigger,
    rulesExecuted: rules.length,
    actionsExecuted: actions.filter(a => !a.startsWith('BLOCKED')).length,
    blocked: actions.filter(a => a.startsWith('BLOCKED')).length,
    actions,
  });
}
