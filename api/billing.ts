import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Configuração do Stripe ausente.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16' as any,
  });

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sbAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  try {
    switch (action) {
      case 'checkout':
        return await handleCheckout(req, res, stripe, sbUrl, sbAnonKey);
      case 'verify':
        return await handleVerify(req, res, stripe, sbUrl, sbKey);
      case 'cancel':
        return await handleCancel(req, res, stripe, sbUrl, sbKey);
      case 'invoices':
        return await handleInvoices(req, res, stripe, sbUrl, sbKey);
      default:
        return res.status(400).json({ error: 'Ação inválida ou não informada.' });
    }
  } catch (error: any) {
    console.error(`BILLING API ERROR [${action}]:`, error);
    return res.status(500).json({ error: error.message || 'Erro interno no processamento de faturamento.' });
  }
}

// --- CHECKOUT LOGIC ---
async function handleCheckout(req: VercelRequest, res: VercelResponse, stripe: Stripe, sbUrl?: string, sbKey?: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { estabelecimentoId, planId, price, months, title } = req.body;
  console.log('[Billing API] Checkout Attempt Body:', req.body);

  if (!estabelecimentoId || !planId || !price || !months) {
    return res.status(400).json({ error: 'Parâmetros insuficientes para criar checkout.' });
  }

  // Security Guard
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');

  if (sbUrl && sbKey) {
    const supabase = createClient(sbUrl, sbKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Token inválido.' });
  }

  const appUrl = 'https://agenda-ai-xi.vercel.app';
  const baseUrl = `${appUrl}/admin/billing`;

  const priceMap: Record<string, string | undefined> = {
    'basico': process.env.STRIPE_PRICE_ID_BASICO,
    'completo': process.env.STRIPE_PRICE_ID_COMPLETO,
    'premium': process.env.STRIPE_PRICE_ID_PREMIUM,
  };

  const stripePriceId = priceMap[planId];

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: stripePriceId 
      ? [{ price: stripePriceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'brl',
            product_data: {
              name: title || `Assinatura SaaS - ${months} Mes(es)`,
              description: `Acesso à plataforma por ${months} mês(es).`,
            },
            unit_amount: Math.round(price * 100),
            recurring: { interval: 'month', interval_count: months },
          },
          quantity: 1,
        }],
    mode: 'subscription',
    success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: baseUrl,
    client_reference_id: estabelecimentoId,
    metadata: { estabelecimentoId, planId, months: months.toString() },
  });

  return res.status(200).json({ sessionId: session.id, init_point: session.url });
}

// --- VERIFY SESSION LOGIC ---
async function handleVerify(req: VercelRequest, res: VercelResponse, stripe: Stripe, sbUrl?: string, sbKey?: string) {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  const session = await stripe.checkout.sessions.retrieve(session_id as string);
  const estabelecimentoId = session.metadata?.estabelecimentoId;
  
  if (!estabelecimentoId) {
    return res.status(400).json({ error: 'ID do estabelecimento não encontrado nos metadados da sessão.' });
  }

  if (session.payment_status !== 'paid') return res.status(400).json({ status: 'unpaid' });

  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase Error' });
  const supabase = createClient(sbUrl, sbKey);

  const planId = session.metadata?.planId;
  const months = parseInt(session.metadata?.months || '1');
  const stripeSubscriptionId = session.subscription as string;

  const now = new Date();
  const { data: estab } = await supabase.from('estabelecimento').select('plano_expires_at').eq('id', estabelecimentoId).single();
  let currentExpires = (estab?.plano_expires_at) ? new Date(estab.plano_expires_at) : now;
  if (currentExpires < now) currentExpires = now;
  currentExpires.setMonth(currentExpires.getMonth() + months);

  const { error: updateError } = await supabase.from('estabelecimento').update({
    plano: planId,
    plano_expires_at: currentExpires.toISOString(),
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: session.customer as string
  }).eq('id', estabelecimentoId);

  if (updateError) throw updateError;
  return res.status(200).json({ status: 'success', planId, expiresAt: currentExpires.toISOString() });
}

// --- CANCEL SUBSCRIPTION LOGIC ---
async function handleCancel(req: VercelRequest, res: VercelResponse, stripe: Stripe, sbUrl?: string, sbKey?: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { estabelecimentoId } = req.body;

  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase Error' });
  const supabase = createClient(sbUrl, sbKey);

  const { data: estab } = await supabase.from('estabelecimento').select('stripe_subscription_id').eq('id', estabelecimentoId).single();
  if (!estab?.stripe_subscription_id) return res.status(400).json({ error: 'No subscription found' });

  await stripe.subscriptions.update(estab.stripe_subscription_id, { cancel_at_period_end: true });
  await supabase.from('estabelecimento').update({ status_assinatura: 'cancelado' }).eq('id', estabelecimentoId);

  return res.status(200).json({ status: 'cancelled' });
}

// --- GET INVOICES LOGIC ---
async function handleInvoices(req: VercelRequest, res: VercelResponse, stripe: Stripe, sbUrl?: string, sbKey?: string) {
  const { estabelecimentoId } = req.query;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase Error' });
  const supabase = createClient(sbUrl, sbKey);

  const { data: estab } = await supabase.from('estabelecimento').select('stripe_customer_id').eq('id', estabelecimentoId).single();
  if (!estab?.stripe_customer_id) return res.status(200).json({ invoices: [] });

  const invoices = await stripe.invoices.list({ customer: estab.stripe_customer_id, limit: 10 });
  const formatted = invoices.data.map(inv => ({
    id: inv.number || inv.id,
    date: new Date(inv.created * 1000).toISOString().split('T')[0],
    amount: inv.amount_paid / 100,
    status: inv.status === 'paid' ? 'Paga' : 'Pendente',
    pdfUrl: inv.invoice_pdf || inv.hosted_invoice_url
  }));

  return res.status(200).json({ invoices: formatted });
}
