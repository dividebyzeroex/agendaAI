import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate, billingReadiness, BillingError, billingClients, objectId, ownedEstablishment, quote, syncSubscription } from '../server/billing.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = req.query['action'];
    if (action === 'status' && req.method === 'GET') return res.status(200).json(billingReadiness());
    const methods: Record<string, string> = { checkout: 'POST', verify: 'GET', cancel: 'POST', invoices: 'GET' };
    if (typeof action !== 'string' || !methods[action]) throw new BillingError(400, 'Ação inválida.');
    if (req.method !== methods[action]) { res.setHeader('Allow', methods[action]); throw new BillingError(405, 'Método não permitido.'); }
    const { db, stripe } = billingClients();
    const user = await authenticate(db, req.headers.authorization);

    if (action === 'verify') {
      const sessionId = req.query['session_id'];
      if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) throw new BillingError(400, 'Sessão inválida.');
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const estab = await ownedEstablishment(db, session.metadata?.['estabelecimentoId'], user.id);
      if (session.client_reference_id !== estab.id || session.mode !== 'subscription' || session.payment_status !== 'paid' || session.status !== 'complete') throw new BillingError(400, 'Pagamento não confirmado.');
      const subscriptionId = objectId(session.subscription);
      if (!subscriptionId) throw new BillingError(400, 'Assinatura não encontrada.');
      const patch = await syncSubscription(stripe, db, subscriptionId, estab.id, session.metadata?.['planId']);
      if (!patch['plano_expires_at'] || patch['plano'] === 'starter') throw new BillingError(409, 'Assinatura sem pagamento ativo.');
      return res.status(200).json({ status: 'success', planId: patch['plano'], expiresAt: patch['plano_expires_at'] });
    }

    const estab = await ownedEstablishment(db, action === 'invoices' ? req.query['estabelecimentoId'] : req.body?.estabelecimentoId, user.id);
    if (action === 'checkout') {
      if(!billingReadiness().ready) throw new BillingError(503,'Contratação indisponível enquanto os dados contratuais são finalizados.');
      if (req.body?.termsAccepted !== true) throw new BillingError(400, 'Aceite as condições da assinatura.');
      if (req.body?.planId !== 'basico') throw new BillingError(400, 'Plano indisponível na oferta de lançamento.');
      const { planId, months, amount } = quote(req.body?.planId, req.body?.months);
      if (estab.stripe_subscription_id) {
        const current = await stripe.subscriptions.retrieve(estab.stripe_subscription_id);
        if (!['canceled', 'incomplete_expired'].includes(current.status)) throw new BillingError(409, 'Já existe uma assinatura. Gerencie ou cancele o contrato atual antes de contratar outro.');
        // Clear only the confirmed terminated subscription, allowing a new contract to bind.
        const { error } = await db.from('estabelecimento').update({ stripe_subscription_id: null }).eq('id', estab.id).eq('stripe_subscription_id', current.id);
        if (error) throw new BillingError(503, 'Não foi possível preparar a assinatura.');
      }
      const configuredUrl = process.env['PROJECT_URL'];
      if (!configuredUrl || new URL(configuredUrl).protocol !== 'https:') throw new BillingError(503, 'URL de faturamento não configurada.');
      const baseUrl = `${new URL(configuredUrl).origin}/admin/billing`;
      const metadata = { estabelecimentoId: estab.id, planId, months: String(months) };
      const { error: acceptanceError } = await db.from('commercial_terms_acceptances').upsert({ user_id:user.id, version:'2026-10-10', marketing_consent:false }, { onConflict:'user_id,version', ignoreDuplicates:true });
      if (acceptanceError) throw new BillingError(503, 'Não foi possível registrar as condições da assinatura.');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription', payment_method_types: ['card'],
        ...(estab.stripe_customer_id ? { customer: estab.stripe_customer_id } : { customer_email: user.email }),
        line_items: [{ quantity: 1, price_data: { currency: 'brl', unit_amount: amount, recurring: { interval: 'month', interval_count: months }, product_data: { name: `Agenda AI — ${planId}`, description: `Assinatura recorrente de ${months} mês(es).` } } }],
        success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`, cancel_url: baseUrl,
        client_reference_id: estab.id, metadata, subscription_data: { metadata },
      }, { idempotencyKey: `checkout:${estab.id}:${planId}:${months}:${Math.floor(Date.now() / 1800000)}` });
      return res.status(200).json({ sessionId: session.id, init_point: session.url });
    }
    if (action === 'cancel') {
      if (!estab.stripe_subscription_id) throw new BillingError(400, 'Assinatura não encontrada.');
      await stripe.subscriptions.update(estab.stripe_subscription_id, { cancel_at_period_end: true });
      await syncSubscription(stripe, db, estab.stripe_subscription_id);
      return res.status(200).json({ status: 'cancelled', message: 'Renovação cancelada. Acesso mantido até o fim do período pago.' });
    }
    if (!estab.stripe_customer_id) return res.status(200).json({ invoices: [] });
    const invoices = await stripe.invoices.list({ customer: estab.stripe_customer_id, limit: 10 });
    return res.status(200).json({ invoices: invoices.data.map(inv => ({ id: inv.number || inv.id, date: new Date(inv.created * 1000).toISOString().split('T')[0], amount: inv.amount_paid / 100, status: inv.status === 'paid' ? 'Paga' : 'Pendente', pdfUrl: inv.invoice_pdf || inv.hosted_invoice_url })) });
  } catch (error) {
    if (error instanceof BillingError) return res.status(error.status).json({ error: error.message });
    console.error('Billing operation failed', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({ error: 'Não foi possível processar o faturamento. Tente novamente.' });
  }
}
