import type { VercelRequest, VercelResponse } from '../server/http.js';
import twilio from 'twilio';
import { Resend } from 'resend';
import { authorizeTenant, escapeHtml, handleError, HttpError, projectOrigin } from '../server/security.js';
import { sanitizePhone } from '../server/sanitize.js';
import { checkAndIncrement } from '../server/rateLimit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { trigger, payload } = req.body || {};
    if (!['ON_EVENT_CREATED', 'ON_EVENT_CANCELED'].includes(trigger) || !payload?.id) throw new HttpError(400, 'Evento e ação obrigatórios.');
    const db = await authorizeTenant(req, payload.estabelecimento_id);
    const { data: event, error } = await db.from('agenda_events').select('*').eq('id', payload.id).eq('estabelecimento_id', payload.estabelecimento_id).single();
    if (error || !event) throw new HttpError(404, 'Agendamento não localizado.');
    if ((trigger === 'ON_EVENT_CANCELED') !== (event.status === 'cancelado')) throw new HttpError(409, 'Ação incompatível com o estado do agendamento.');
    const { data: rules, error: ruleError } = await db.from('workflows').select('*').eq('estabelecimento_id', event.estabelecimento_id).eq('trigger', trigger).eq('active', true);
    if (ruleError) throw new HttpError(503, 'Automações indisponíveis.');
    const actions: { action: string; success: boolean; error?: string }[] = [];
    for (const rule of rules || []) {
      try {
        if (rule.action === 'SEND_SMS') {
          const sid = process.env['TWILIO_ACCOUNT_SID'], token = process.env['TWILIO_AUTH_TOKEN'], from = process.env['TWILIO_PHONE_FROM'];
          if (!sid || !token || !from) throw new Error('SMS não configurado.');
          const { data: customer } = await db.from('clientes').select('nome,telefone').eq('id', event.cliente_id).eq('estabelecimento_id', event.estabelecimento_id).single();
          if (!customer?.telefone) throw new Error('Cliente sem telefone.');
          if (!(await checkAndIncrement(event.estabelecimento_id, 'sms')).allowed) throw new Error('Limite de SMS indisponível ou atingido.');
          await twilio(sid, token).messages.create({ to: sanitizePhone(customer.telefone), from, body: `Olá, ${customer.nome}! Agendamento ${event.title}: ${event.status}. ${new Date(event.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` });
        } else if (rule.action === 'SEND_EMAIL') {
          if (!process.env['RESEND_API_KEY'] || !process.env['RESEND_FROM_EMAIL']) throw new Error('E-mail não configurado.');
          const { data: prof } = await db.from('profissionais').select('nome,email').eq('id', event.profissional_id).eq('estabelecimento_id', event.estabelecimento_id).eq('ativo', true).single();
          if (!prof?.email || !event.token_confirmacao) throw new Error('Profissional indisponível.');
          const url = `${projectOrigin()}/api/respond-appointment?token=${encodeURIComponent(event.token_confirmacao)}`;
          const result = await new Resend(process.env['RESEND_API_KEY']).emails.send({ from: process.env['RESEND_FROM_EMAIL'], to: prof.email, subject: `Agendamento: ${event.title}`, html: `<p>Olá, ${escapeHtml(prof.nome)}.</p><p>${escapeHtml(event.title)} — ${escapeHtml(new Date(event.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</p><p>Status: ${escapeHtml(event.status)}</p>${event.status !== 'cancelado' ? `<a href="${url}">Revisar e responder ao agendamento</a>` : ''}` });
          if (result.error) throw new Error('Provedor recusou o envio.');
        } else if (['NOTIFY_ADMIN', 'LOG_ACTIVITY'].includes(rule.action)) {
          const { error: logError } = await db.from('agent_tasks').insert({ estabelecimento_id: event.estabelecimento_id, type: rule.action, payload: { event_id: event.id, trigger }, status: 'done', agent_owner: 'system', completed_at: new Date().toISOString() });
          if (logError) throw new Error('Falha ao registrar atividade.');
        } else { throw new Error('Ação não suportada.'); }
        actions.push({ action: rule.action, success: true });
      } catch { actions.push({ action: rule.action, success: false, error: 'Ação não concluída; verifique configuração, limite e destinatário.' }); }
    }
    return res.status(actions.some(a => !a.success) ? 502 : 200).json({ success: actions.every(a => a.success), actions });
  } catch (error) { return handleError(res, error); }
}
