import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { adminClient, escapeHtml, handleError, HttpError, isUuid } from '../server/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).send('Método inválido.');
  try {
    const token = req.method === 'POST' ? req.body?.token : req.query.token;
    if (!isUuid(token)) throw new HttpError(400, 'Token inválido.');
    const db = adminClient();
    const { data: event } = await db.from('agenda_events').select('id,title,start,status,status_confirmacao,profissional_id').eq('token_confirmacao', token).single();
    if (!event || !event.profissional_id || new Date(event.start).getTime() <= Date.now() || ['cancelado', 'concluido'].includes(event.status)) throw new HttpError(404, 'Link expirado ou agendamento indisponível.');
    if (req.method === 'GET') return res.status(200).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Confirmar agendamento</title><body><h1>${escapeHtml(event.title)}</h1><p>Confirme sua decisão abaixo.</p><form method="post"><input type="hidden" name="token" value="${token}"><button name="action" value="aceitar">Aceitar</button><button name="action" value="recusar">Recusar</button></form></body></html>`);
    const action = req.body?.action;
    if (!['aceitar', 'recusar'].includes(action)) throw new HttpError(400, 'Ação inválida.');
    const update = action === 'aceitar' ? { status_confirmacao: 'aceito', status: 'confirmado', token_confirmacao: randomUUID() } : { status_confirmacao: 'recusado', status: 'pendente', profissional_id: null, token_confirmacao: randomUUID() };
    const { data: changed, error } = await db.from('agenda_events').update(update).eq('id', event.id).eq('token_confirmacao', token).select('id').maybeSingle();
    if (error || !changed) throw new HttpError(409, 'Resposta já processada ou agendamento alterado.');
    return res.status(200).send(action === 'aceitar' ? 'Atendimento confirmado. Obrigado!' : 'Recusa registrada. O responsável poderá atribuir outro profissional.');
  } catch (error) { return handleError(res, error); }
}
