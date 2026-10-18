import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from './http.js';
import {
  adminClient,
  authorizeTenant,
  escapeHtml,
  handleError,
  HttpError,
  isUuid,
  projectOrigin,
} from './security.js';
export function campaignReady() {
  return (
    !!process.env['RESEND_API_KEY'] &&
    !!process.env['RESEND_FROM_EMAIL'] &&
    !!process.env['PROJECT_URL']
  );
}
export async function campaignSchedule(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const tenant = req.body?.estabelecimento_id,
      id = req.body?.campaign_id;
    if (!isUuid(id)) throw new HttpError(400, 'Campanha inválida.');
    const db = await authorizeTenant(req, tenant);
    const bearer = String(req.headers.authorization).slice(7);
    const {
      data: { user },
    } = await db.auth.getUser(bearer);
    const { data: owner } = await db
      .from('estabelecimento')
      .select('id')
      .eq('id', tenant)
      .eq('user_id', user?.id)
      .maybeSingle();
    if (!owner) throw new HttpError(403, 'Ação exclusiva do dono.');
    if (!campaignReady())
      throw new HttpError(503, 'O envio por e-mail ainda não está configurado.');
    const { data: camp, error } = await db
      .from('client_campaigns')
      .select('id,channel,status')
      .eq('id', id)
      .eq('estabelecimento_id', tenant)
      .maybeSingle();
    if (error) throw error;
    if (!camp || !['ready', 'scheduled', 'paused'].includes(camp.status))
      throw new HttpError(409, 'Prepare e revise o público antes de agendar.');
    if (camp.channel !== 'email')
      throw new HttpError(
        409,
        'Envio automático deste canal ainda precisa de integração e homologação.',
      );
    const { error: saved } = await db
      .from('client_campaigns')
      .update({ status: 'scheduled' })
      .eq('id', id)
      .eq('estabelecimento_id', tenant)
      .in('status', ['ready', 'scheduled', 'paused']);
    if (saved) throw saved;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return handleError(res, e);
  }
}
/** Runs only campaigns explicitly scheduled by their owner. No auto retry of uncertain sends. */
export async function runCustomerCampaigns(
  deps: {
    db?: any;
    send?: (payload: any, options: any) => Promise<any>;
    pause?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
) {
  if (!campaignReady()) return { ready: false, sent: 0, failed: 0 };
  const db = deps.db || adminClient(),
    resend = new Resend(process.env['RESEND_API_KEY']);
  const now = deps.now || Date.now;
  const deadline = now() + 35000;
  const pause =
    deps.pause || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastAttempt: number | null = null;
  let sent = 0,
    failed = 0,
    suppressed = 0;
  const { data: camps, error } = await db
    .from('client_campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .eq('channel', 'email')
    .lte('due_at', new Date().toISOString())
    .order('due_at')
    .limit(3);
  if (error && ['42P01', 'PGRST205'].includes(error.code))
    return { ready: false, sent: 0, failed: 0 };
  if (error) throw error;
  for (const camp of camps || []) {
    if (now() >= deadline) break;
    const { data: tenant, error: tenantError } = await db
      .from('estabelecimento')
      .select('active,trial_ends_at,plano_expires_at,nome,slug')
      .eq('id', camp.estabelecimento_id)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (
      !tenant?.active ||
      Math.max(
        Date.parse(tenant.trial_ends_at || '') || 0,
        Date.parse(tenant.plano_expires_at || '') || 0,
      ) <= Date.now()
    ) {
      const { error: paused } = await db
        .from('client_campaigns')
        .update({ status: 'paused' })
        .eq('id', camp.id)
        .eq('status', 'scheduled');
      if (paused) throw paused;
      continue;
    }
    const { data: recipients, error: readError } = await db
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', camp.id)
      .eq('status', 'pending')
      .limit(10);
    if (readError) throw readError;
    for (const recipient of recipients || []) {
      if (now() >= deadline) break;
      // Space provider calls, then recheck preferences before claiming the recipient.
      if (lastAttempt !== null) await pause(Math.max(0, 550 - (now() - lastAttempt)));
      if (now() >= deadline) break;
      const { data: pref, error: prefError } = await db
        .from('client_contact_preferences')
        .select('consent')
        .eq('estabelecimento_id', camp.estabelecimento_id)
        .eq('cliente_id', recipient.cliente_id)
        .eq('channel', 'email')
        .maybeSingle();
      if (prefError) throw prefError;
      const { data: current, error: campError } = await db
        .from('client_campaigns')
        .select('status')
        .eq('id', camp.id)
        .maybeSingle();
      if (campError) throw campError;
      let eligible = true;
      if (camp.retention_rule_id) {
        const { data, error } = await db.rpc('retention_recipient_eligible', {
          p_recipient: recipient.id,
        });
        if (error) throw error;
        eligible = data === true;
      }
      if (!pref?.consent || current?.status !== 'scheduled' || !eligible) {
        const { error } = await db
          .from('campaign_recipients')
          .update({ status: 'suppressed' })
          .eq('id', recipient.id)
          .eq('status', 'pending');
        if (error) throw error;
        suppressed++;
        continue;
      }
      const { data: customer, error: customerError } = await db
        .from('clientes')
        .select('email')
        .eq('id', recipient.cliente_id)
        .eq('estabelecimento_id', camp.estabelecimento_id)
        .maybeSingle();
      if (customerError) throw customerError;
      if (!customer?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
        const { error } = await db
          .from('campaign_recipients')
          .update({ status: 'failed' })
          .eq('id', recipient.id)
          .eq('status', 'pending');
        if (error) throw error;
        failed++;
        continue;
      }
      const { data: claim, error: claimError } = await db
        .from('campaign_recipients')
        .update({ status: 'sending' })
        .eq('id', recipient.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;
      try {
        const unsubscribe = projectOrigin() + '/preferencias/' + recipient.token;
        lastAttempt = now();
        const { data, error } = await (deps.send || resend.emails.send.bind(resend.emails))(
          {
            from: `${String(tenant.nome)
              .replace(/[<>\r\n]/g, '')
              .slice(0, 80)} <${process.env['RESEND_FROM_EMAIL']}>`,
            to: [customer.email],
            subject: camp.title,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;color:#172033"><h2>${escapeHtml(tenant.nome)}</h2><p style="white-space:pre-wrap;line-height:1.8">${escapeHtml(camp.message.replaceAll('{negocio}', String(tenant.nome)).replaceAll('{link}', projectOrigin() + '/agendar/' + String(tenant.slug || '')))}</p><hr/><p style="font-size:12px;color:#64748b">Você autorizou este estabelecimento a entrar em contato. <a href="${escapeHtml(unsubscribe)}">Parar de receber mensagens</a></p></div>`,
            headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
          },
          {
            idempotencyKey: 'customer-campaign:' + recipient.id,
            signal: AbortSignal.timeout(8000),
          },
        );
        if (error || !data?.id) throw Error('Provider did not acknowledge');
        const { error: saved } = await db
          .from('campaign_recipients')
          .update({ status: 'sent', provider_id: data.id, sent_at: new Date().toISOString() })
          .eq('id', recipient.id)
          .eq('status', 'sending');
        if (saved) throw saved;
        sent++;
      } catch {
        const { error: saved } = await db
          .from('campaign_recipients')
          .update({ status: 'failed' })
          .eq('id', recipient.id)
          .eq('status', 'sending');
        if (saved) throw saved;
        failed++;
      }
    }
    // Uncertain in-flight sends stay visible for reconciliation, but must not block other campaigns.
    const { data: waiting, error: waitingError } = await db
      .from('campaign_recipients')
      .select('id')
      .eq('campaign_id', camp.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    if (waitingError) throw waitingError;
    if (!waiting) {
      const { error: closed } = await db
        .from('client_campaigns')
        .update({ status: 'completed' })
        .eq('id', camp.id)
        .eq('status', 'scheduled');
      if (closed) throw closed;
    }
  }
  return { ready: true, sent, failed, suppressed };
}
