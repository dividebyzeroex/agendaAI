import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './http.js';
import { adminClient, isUuid } from './security.js';
export async function businessPublic(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const action = String(req.query['action'] || '');
  if (!['feedback-info', 'feedback-submit', 'checkin', 'unsubscribe'].includes(action))
    return res.status(400).json({ error: 'Ação inválida.' });
  const token = req.body?.token;
  if (!isUuid(token)) return res.status(400).json({ error: 'Link inválido.' });
  const secret = process.env['PUBLIC_BOOKING_RATE_SECRET'];
  if (!secret) return res.status(503).json({ error: 'Serviço temporariamente indisponível.' });
  try {
    const db = adminClient();
    const ip = String(
      req.headers['x-vercel-forwarded-for'] ||
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        'unknown',
    )
      .split(',')[0]
      .trim();
    const key = createHmac('sha256', secret)
      .update('customer-action:' + token + ':' + ip)
      .digest('hex');
    const { data: allowed, error: limitError } = await db.rpc('consume_public_booking_limit', {
      p_key: key,
    });
    if (limitError) return res.status(503).json({ error: 'Não foi possível conferir o link.' });
    if (!allowed)
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
    if (action === 'unsubscribe') {
      const { data, error } = await db.rpc('unsubscribe_campaign', { p_token: token });
      if (error) return res.status(404).json({ error: 'Link indisponível.' });
      return res.status(200).json(data);
    }
    if (action.startsWith('feedback')) {
      if (action === 'feedback-submit') {
        const rating = Number(req.body?.rating),
          comment = String(req.body?.comment || '').trim();
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 2000)
          return res
            .status(400)
            .json({ error: 'Informe uma nota de 1 a 5 e um comentário com até 2000 caracteres.' });
        const { data, error } = await db.rpc('submit_service_feedback', {
          p_token: token,
          p_rating: rating,
          p_comment: comment,
        });
        if (error)
          return res.status(400).json({ error: 'Link inválido, expirado ou indisponível.' });
        return res.status(200).json(data);
      }
      const { data: f, error } = await db
        .from('service_feedback')
        .select('submitted_at,created_at,estabelecimento_id')
        .eq('token', token)
        .maybeSingle();
      if (error) return res.status(503).json({ error: 'Não foi possível conferir a avaliação.' });
      if (!f || Date.parse(f.created_at) < Date.now() - 30 * 86400000)
        return res.status(404).json({ error: 'Link inválido ou expirado.' });
      const { data: tenant } = await db
        .from('estabelecimento')
        .select('nome')
        .eq('id', f.estabelecimento_id)
        .maybeSingle();
      return res
        .status(200)
        .json({ name: tenant?.nome || 'Seu atendimento', received: !!f.submitted_at });
    }
    const { data: event, error } = await db
      .from('agenda_events')
      .select('id,start,end,status,metadata,estabelecimento_id')
      .eq('token_confirmacao', token)
      .maybeSingle();
    if (error) return res.status(503).json({ error: 'Não foi possível conferir o atendimento.' });
    if (
      !event ||
      event.status !== 'confirmado' ||
      Date.parse(event.start) - Date.now() > 2 * 3600000 ||
      Date.parse(event.end) < Date.now()
    )
      return res.status(409).json({
        error:
          'O check-in fica disponível nas duas horas anteriores ao atendimento confirmado, até o fim do horário reservado.',
      });
    // Only append the arrival marker. Do not start service, confirm a pending request or expose contacts.
    const metadata = {
      ...(event.metadata || {}),
      checked_in_at: event.metadata?.['checked_in_at'] || new Date().toISOString(),
    };
    const { error: updateError } = await db
      .from('agenda_events')
      .update({ metadata })
      .eq('id', event.id)
      .eq('status', 'confirmado');
    if (updateError)
      return res.status(503).json({ error: 'Não foi possível registrar sua chegada.' });
    return res.status(200).json({ received: true });
  } catch {
    return res.status(503).json({ error: 'Serviço indisponível. Tente novamente.' });
  }
}
