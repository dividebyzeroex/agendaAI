import type Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '../server/http.js';
import { billingClients, objectId, recordPaidInvoice, syncSubscription } from '../server/billing.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).send('Method Not Allowed'); }
  const secret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret) return res.status(503).json({ error: 'Webhook unavailable' });
  try {
    const { stripe, db } = billingClients();
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') return res.status(400).json({ error: 'Invalid signature' });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1048576) return res.status(413).json({ error: 'Payload too large' });
      chunks.push(buffer);
    }
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, secret); }
    catch { return res.status(400).json({ error: 'Invalid signature' }); }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.['estabelecimentoId'];
      const subId = objectId(session.subscription);
      if (session.mode === 'subscription' && session.payment_status === 'paid' && id && id === session.client_reference_id && subId) {
        await syncSubscription(stripe, db, subId, id, session.metadata?.['planId']);
      }
    } else if (['customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.created'].includes(event.type)) {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(stripe, db, sub.id);
    } else if (['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = objectId(invoice.parent?.subscription_details?.subscription) || objectId((invoice as unknown as { subscription?: unknown }).subscription);
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscription(stripe, db, subId, sub.metadata?.['estabelecimentoId']);
        // Retrieve the event's invoice too: historical paid invoices belong in the revenue ledger.
        if (event.type !== 'invoice.payment_failed') await recordPaidInvoice(db, await stripe.invoices.retrieve(invoice.id), subId);
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
