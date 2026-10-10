import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class BillingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const PRICES = { basico: 9700, completo: 19700, premium: 34900 } as const;
const DISCOUNTS: Record<number, number> = { 1: 0, 3: 5, 6: 10, 12: 20 };
export function quote(planId: unknown, months: unknown) {
  if (typeof planId !== 'string' || !Object.hasOwn(PRICES, planId) || typeof months !== 'number' || !Object.hasOwn(DISCOUNTS, months)) {
    throw new BillingError(400, 'Plano ou ciclo inválido.');
  }
  return { planId, months, amount: Math.round(PRICES[planId as keyof typeof PRICES] * months * (100 - DISCOUNTS[months]) / 100) };
}
export function billingReadiness(env: Record<string,string|undefined> = process.env) {
  const key = env['STRIPE_SECRET_KEY'] || '';
  const mode = /^sk_live_/.test(key) ? 'live' : /^sk_test_/.test(key) ? 'test' : 'unconfigured';
  const ready = mode !== 'unconfigured' && !!env['STRIPE_WEBHOOK_SECRET']
    && env['CONTRACT_READY'] === 'true'
    && ['BUSINESS_LEGAL_NAME','BUSINESS_TAX_ID','BUSINESS_CONTACT_EMAIL','BUSINESS_ADDRESS'].every(k => !!env[k]);
  return { ready, mode };
}

export async function operationalBillingReadiness() {
  const configuration = billingReadiness();
  if (!configuration.ready) return { ...configuration, reason: 'configuration' };
  try {
    const { stripe } = billingClients();
    const [account, endpoints] = await Promise.all([stripe.accounts.retrieve(null), stripe.webhookEndpoints.list({limit:100})]);
    const origin = new URL(process.env['PROJECT_URL'] || '').origin;
    const endpoint = endpoints.data.find(e => e.url === `${origin}/api/webhook` && e.status === 'enabled' && e.livemode === (configuration.mode === 'live'));
    const events = ['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'];
    const webhookReady = !!endpoint && (endpoint.enabled_events.includes('*') || events.every(e => endpoint.enabled_events.includes(e as any)));
    const ready = webhookReady && (configuration.mode !== 'live' || account.charges_enabled === true);
    return { ...configuration, ready, reason: ready ? null : webhookReady ? 'stripe_account' : 'webhook_endpoint' };
  } catch { return { ...configuration, ready:false, reason:'stripe_connection' }; }
}

export function billingClients() {
  const url = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  if (!url || !key || !stripeKey) throw new BillingError(503, 'Faturamento temporariamente indisponível.');
  return { stripe: new Stripe(stripeKey), db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
export async function authenticate(db: SupabaseClient, header: unknown) {
  if (typeof header !== 'string' || !/^Bearer \S+$/i.test(header)) throw new BillingError(401, 'Autenticação necessária.');
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user) throw new BillingError(401, 'Sessão inválida.');
  return data.user;
}
export async function ownedEstablishment(db: SupabaseClient, id: unknown, userId: string) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new BillingError(400, 'Estabelecimento inválido.');
  const { data, error } = await db.from('estabelecimento').select('id,user_id,stripe_subscription_id,stripe_customer_id,plano,plano_expires_at').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new BillingError(503, 'Não foi possível consultar o estabelecimento.');
  if (!data) throw new BillingError(403, 'Acesso negado.');
  return data;
}
export function objectId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return undefined;
}
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): string {
  // Since Basil, periods live on subscription items. Retain support for legacy webhook versions.
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const periods = subscription.items?.data.map(item => item.current_period_end).filter(n => Number.isFinite(n) && n > 0) || [];
  const timestamp = periods.length ? Math.min(...periods) : legacy;
  if (!timestamp || !Number.isFinite(timestamp)) throw new BillingError(502, 'Período da assinatura inválido.');
  return new Date(timestamp * 1000).toISOString();
}
export function subscriptionPatch(subscription: Stripe.Subscription, invoice: Stripe.Invoice | null, fallbackPlan?: string) {
  const planId = subscription.metadata?.['planId'] || fallbackPlan;
  const patch: Record<string, unknown> = {
    stripe_subscription_status: subscription.cancel_at_period_end && subscription.status === 'active' ? 'canceled_at_period_end' : subscription.status,
    stripe_customer_id: objectId(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_mrr_cents: 0,
    stripe_livemode: subscription.livemode === true,
    stripe_current_period_end: subscriptionPeriodEnd(subscription),
  };
  // An active status alone is not proof that the renewed period was paid.
  if (subscription.status === 'active' && invoice?.status === 'paid' && objectId(subscription.latest_invoice) === invoice.id && planId && Object.hasOwn(PRICES, planId)) {
    patch['stripe_mrr_cents'] = subscription.items.data.reduce((sum, item) => {
      const price = item.price;
      if (price.currency !== 'brl' || price.recurring?.interval !== 'month') return sum;
      return sum + Math.round((price.unit_amount || 0) * (item.quantity || 1) / price.recurring.interval_count);
    }, 0);
    patch['plano'] = planId;
    patch['plano_expires_at'] = patch['stripe_current_period_end'];
  }
  if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'incomplete_expired') {
    patch['stripe_mrr_cents'] = 0;
    patch['plano'] = 'starter';
    patch['plano_expires_at'] = new Date(0).toISOString();
  }
  return patch;
}
export async function syncSubscription(stripe: Stripe, db: SupabaseClient, subscriptionId: string, establishmentId?: string, fallbackPlan?: string) {
  // Retrieve current Stripe state even for replayed/out-of-order events. Never add months to stored dates.
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  const latestId = objectId(sub.latest_invoice);
  const invoice = latestId ? (typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(latestId) : sub.latest_invoice as Stripe.Invoice) : null;
  const patch = subscriptionPatch(sub, invoice, fallbackPlan);
  let query = db.from('estabelecimento').update(patch);
  if (establishmentId) query = query.eq('id', establishmentId).or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${subscriptionId}`);
  else query = query.eq('stripe_subscription_id', subscriptionId);
  const { data, error } = await query.select('id');
  if (error) throw new BillingError(503, 'Não foi possível atualizar a assinatura.');
  if (establishmentId && !data?.length) throw new BillingError(409, 'Assinatura vinculada a outro contrato.');
  return patch;
}

export async function recordPaidInvoice(db: SupabaseClient, invoice: Stripe.Invoice, subscriptionId: string) {
  if (invoice.status !== 'paid') return;
  const { data: estab, error: readError } = await db.from('estabelecimento').select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle();
  if (readError) throw new BillingError(503, 'Falha ao consultar contrato.');
  if (!estab) return;
  const { error } = await db.from('commercial_payments').upsert({
    id: invoice.id, estabelecimento_id: estab.id, amount_cents: invoice.amount_paid,
    currency: invoice.currency, status: 'paid', livemode: invoice.livemode === true,
    paid_at: new Date((invoice.status_transitions.paid_at || invoice.created) * 1000).toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new BillingError(503, 'Falha ao registrar pagamento.');
}
