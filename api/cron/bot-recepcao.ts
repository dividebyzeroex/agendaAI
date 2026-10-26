import { runGrowthWorker } from '../../server/growth-worker.js';
import { adminClient } from '../../server/security.js';
import type { VercelRequest, VercelResponse } from '../../server/http.js';
import { runAppointmentMessages } from '../../server/appointment-messaging.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const growth = req.query?.['worker'] === 'growth';
  if (req.method !== (growth ? 'POST' : 'GET')) return res.status(405).end();
  const secret = process.env['CRON_SECRET'];
  const platform = !growth && !!secret && req.headers.authorization === `Bearer ${secret}`;
  if (!growth && !platform) return res.status(401).json({ error: 'Unauthorized CRON.' });
  const token =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization.replace(/^Bearer /, '')
      : '';
  if (growth && !/^[0-9a-f]{64}$/.test(token))
    return res.status(401).json({ error: 'Unauthorized worker.' });
  const db = adminClient();
  let lease: string | null = null;
  try {
    const { data: claim, error } = await db.rpc('claim_growth_worker', {
      p_token: growth ? token : null,
      p_platform: platform,
    });
    if (error) throw error;
    if (!claim?.authorized) return res.status(401).json({ error: 'Unauthorized worker.' });
    if (claim.busy) return res.status(200).json({ busy: true });
    lease = claim.lease;
    const results = await Promise.allSettled([
      platform ? runAppointmentMessages() : Promise.resolve({ status: 'not_scheduled_here' }),
      runGrowthWorker({ db, scheduled: growth }),
    ]);
    const result = {
      ok:
        results.every((r) => r.status === 'fulfilled') &&
        (results[1].status !== 'fulfilled' || results[1].value.ok),
      appointments:
        results[0].status === 'fulfilled'
          ? results[0].value
          : { error: 'Rotina de lembretes indisponível' },
      growth:
        results[1].status === 'fulfilled'
          ? results[1].value
          : { error: 'Rotina de crescimento indisponível' },
    };
    await db.rpc('finish_growth_worker', { p_lease: lease, p_result: { ok: result.ok } });
    return res.status(result.ok ? 200 : 503).json(result);
  } catch {
    if (lease) await db.rpc('finish_growth_worker', { p_lease: lease, p_result: { ok: false } });
    return res
      .status(503)
      .json({
        error: 'Não foi possível conferir a fila. Nenhum retry automático de envio incerto.',
      });
  }
}
