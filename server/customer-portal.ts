import { createHmac } from 'node:crypto';
import { adminClient, isUuid, HttpError, handleError } from './security.js';
import type { VercelRequest, VercelResponse } from './http.js';
export async function customerPortal(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const token = req.body?.token,
      action = String(req.query['action']);
    if (!isUuid(token)) throw new HttpError(404, 'Link inválido ou expirado.');
    const secret = process.env['PUBLIC_BOOKING_RATE_SECRET'];
    if (!secret) throw new HttpError(503, 'Portal indisponível.');
    const db = adminClient(),
      ip = String(
        req.headers['x-vercel-forwarded-for'] ||
          req.headers['x-forwarded-for'] ||
          req.socket?.remoteAddress ||
          'unknown',
      ).split(',')[0];
    const { data: allowed, error: rateError } = await db.rpc('consume_public_booking_limit', {
      p_key: createHmac('sha256', secret)
        .update('portal:' + token + ':' + ip)
        .digest('hex'),
    });
    if (rateError) throw new HttpError(503, 'Não foi possível conferir o acesso.');
    if (!allowed) throw new HttpError(429, 'Aguarde alguns minutos antes de tentar novamente.');
    if (action === 'portal-cancel' && (!isUuid(req.body?.event) || req.body?.confirmed !== true))
      throw new HttpError(400, 'Confirme o cancelamento do horário.');
    if (!['portal-info', 'portal-cancel'].includes(action))
      throw new HttpError(400, 'Ação inválida.');
    const { data, error } = await db.rpc(
      action === 'portal-info' ? 'portal_snapshot' : 'portal_cancel',
      action === 'portal-info' ? { p_token: token } : { p_token: token, p_event: req.body.event },
    );
    if (error)
      throw new HttpError(
        409,
        action === 'portal-info' ? 'Link inválido, expirado ou indisponível.' : error.message,
      );
    return res.status(200).json(data);
  } catch (e) {
    return handleError(res, e);
  }
}
