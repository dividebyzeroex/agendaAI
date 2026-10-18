import { createHmac, timingSafeEqual } from 'node:crypto';
import { adminClient } from './security.js';
import { checked, credentials, unseal } from './integrations.js';
import type { VercelRequest, VercelResponse } from './http.js';
export function validMetaSignature(raw: Buffer, signature: unknown, secret: string) {
  if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), 'hex'),
    createHmac('sha256', secret).update(raw).digest(),
  );
}
export function deliveryAdvance(current: string, next: string) {
  const rank: Record<string, number> = {
    pending: 0,
    sending: 1,
    sent: 2,
    delivered: 3,
    read: 4,
    failed: 2,
  };
  return (
    ['sent', 'delivered', 'read', 'failed'].includes(next) &&
    rank[next] >= (rank[current] ?? 0) &&
    !(current === 'failed' && next === 'sent')
  );
}
export function whatsappPhone(raw: unknown) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 10 || p.length === 11) p = '55' + p;
  return /^55\d{10,11}$/.test(p) ? p : null;
}
export async function whatsappWebhook(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const verify = process.env['WHATSAPP_VERIFY_TOKEN'],
    appSecret = process.env['WHATSAPP_APP_SECRET'];
  if (req.method === 'GET') {
    if (
      verify &&
      req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === verify &&
      typeof req.query['hub.challenge'] === 'string'
    )
      return res.status(200).send(req.query['hub.challenge']);
    return res.status(403).json({ error: 'Verification failed' });
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (!appSecret) return res.status(503).json({ error: 'Webhook unavailable' });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    size += b.length;
    if (size > 1048576) return res.status(413).end();
    chunks.push(b);
  }
  const raw = Buffer.concat(chunks);
  if (!validMetaSignature(raw, req.headers['x-hub-signature-256'], appSecret))
    return res.status(401).json({ error: 'Invalid signature' });
  try {
    const data = JSON.parse(raw.toString()),
      db = adminClient();
    for (const entry of data.entry || [])
      for (const change of entry.changes || []) {
        const value = change.value || {},
          phone = String(value.metadata?.phone_number_id || '');
        const config = await checked(
          db
            .from('tenant_integrations')
            .select('estabelecimento_id')
            .eq('whatsapp_phone_id', phone)
            .maybeSingle(),
        );
        if (!config) continue;
        for (const status of value.statuses || [])
          await checked(
            db.rpc('whatsapp_status', {
              p_phone: phone,
              p_id: String(status.id),
              p_status: String(status.status),
            }),
          );
        for (const message of value.messages || []) {
          if (
            !['sair', 'parar', 'stop'].includes(
              String(message.text?.body || '')
                .trim()
                .toLowerCase(),
            )
          )
            continue;
          const from = whatsappPhone(message.from);
          if (!from) continue;
          await checked(
            db.rpc('whatsapp_unsubscribe', { p_tenant: config.estabelecimento_id, p_phone: from }),
          );
        }
      }
    return res.status(200).json({ received: true });
  } catch {
    return res.status(503).json({ error: 'Webhook processing unavailable' });
  }
}
export async function runWhatsApp(db: any = adminClient()) {
  if (!process.env['INTEGRATION_ENCRYPTION_KEY'] || !process.env['WHATSAPP_APP_SECRET'])
    return { configured: false };
  await checked(db.rpc('prepare_whatsapp_notifications'));
  const rows = await checked(
    db
      .from('whatsapp_deliveries')
      .select('*')
      .eq('status', 'pending')
      .order('created_at')
      .limit(10),
  );
  let sent = 0,
    suppressed = 0;
  const started = Date.now();
  for (const row of rows || []) {
    if (Date.now() - started > 22000) break;
    const [config, event, pref, customer, tenant] = await Promise.all([
      checked(
        db
          .from('tenant_integrations')
          .select('*')
          .eq('estabelecimento_id', row.estabelecimento_id)
          .maybeSingle(),
      ),
      checked(db.from('agenda_events').select('start,status').eq('id', row.event_id).maybeSingle()),
      checked(
        db
          .from('client_contact_preferences')
          .select('consent')
          .eq('estabelecimento_id', row.estabelecimento_id)
          .eq('cliente_id', row.cliente_id)
          .eq('channel', 'whatsapp')
          .maybeSingle(),
      ),
      checked(
        db
          .from('clientes')
          .select('nome,telefone')
          .eq('id', row.cliente_id)
          .eq('estabelecimento_id', row.estabelecimento_id)
          .maybeSingle(),
      ),
      checked(
        db
          .from('estabelecimento')
          .select('nome,active,trial_ends_at,plano_expires_at')
          .eq('id', row.estabelecimento_id)
          .maybeSingle(),
      ),
    ]);
    const phone = whatsappPhone(customer?.telefone);
    if (
      !config?.whatsapp_enabled ||
      !event ||
      !pref?.consent ||
      !phone ||
      !tenant?.active ||
      Math.max(
        Date.parse(tenant.trial_ends_at || '') || 0,
        Date.parse(tenant.plano_expires_at || '') || 0,
      ) <= Date.now() ||
      (row.kind !== 'change' &&
        (!['confirmado', 'pendente'].includes(event.status) ||
          Date.parse(event.start) <= Date.now() + 1800000))
    ) {
      await checked(
        db
          .from('whatsapp_deliveries')
          .update({ status: 'suppressed' })
          .eq('id', row.id)
          .eq('status', 'pending'),
      );
      suppressed++;
      continue;
    }
    const secrets = await credentials(db, row.estabelecimento_id);
    if (!secrets.whatsapp_token) continue;
    const token = unseal(secrets.whatsapp_token);
    const claim = await checked(
      db
        .from('whatsapp_deliveries')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle(),
    );
    if (!claim) continue;
    try {
      const version = process.env['WHATSAPP_GRAPH_VERSION'] || 'v23.0';
      if (!/^v\d+\.\d+$/.test(version)) throw Error('Version unavailable');
      const r = await fetch(
        'https://graph.facebook.com/' + version + '/' + config.whatsapp_phone_id + '/messages',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: config.whatsapp_template,
              language: { code: 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    customer.nome,
                    tenant.nome,
                    new Date(event.start).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                    }),
                    event.status,
                  ].map((text) => ({ type: 'text', text: String(text).slice(0, 200) })),
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const d = await r.json();
      if (!r.ok) {
        await checked(
          db
            .from('whatsapp_deliveries')
            .update({
              status: 'failed',
              error: 'Envio recusado pelo WhatsApp. Confira o modelo e as permissões.',
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id),
        );
        continue;
      }
      if (!d.messages?.[0]?.id) throw Error('Unknown provider outcome');
      await checked(
        db
          .from('whatsapp_deliveries')
          .update({
            status: 'sent',
            provider_id: d.messages[0].id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id),
      );
      await checked(
        db.rpc('whatsapp_status', {
          p_phone: config.whatsapp_phone_id,
          p_id: d.messages[0].id,
          p_status: 'sent',
        }),
      );
      sent++;
    } catch {
      await checked(
        db
          .from('whatsapp_deliveries')
          .update({
            error: 'Resultado incerto. Confira no Meta antes de repetir.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id),
      );
    }
  }
  return { configured: true, sent, suppressed };
}
