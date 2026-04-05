import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { session_id, estabelecimentoId } = req.query;

    if (!session_id || !estabelecimentoId) {
      return res.status(400).json({ error: 'Parâmetros session_id e estabelecimentoId são obrigatórios.' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Configuração do Stripe ausente.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,
    });

    // 1. Verify Session with Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id as string);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ status: 'unpaid', error: 'O pagamento ainda não foi confirmado.' });
    }

    // 2. Initialize Supabase
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role to bypass RLS for billing sync
    
    if (!sbUrl || !sbKey) {
      return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
    }

    const supabase = createClient(sbUrl, sbKey);

    // 3. Extract Metadata
    const planId = session.metadata?.planId;
    const months = parseInt(session.metadata?.months || '1');
    const stripeSubscriptionId = session.subscription as string;

    // 4. Update Establishment in Database
    const now = new Date();
    // Fetch current expire date to stack if possible
    const { data: estab } = await supabase
      .from('estabelecimentos')
      .select('plano_expires_at')
      .eq('id', estabelecimentoId)
      .single();

    let currentExpires = (estab?.plano_expires_at) ? new Date(estab.plano_expires_at) : now;
    if (currentExpires < now) currentExpires = now;
    
    // Add months
    currentExpires.setMonth(currentExpires.getMonth() + months);

    const { error: updateError } = await supabase
      .from('estabelecimentos')
      .update({
        plano: planId,
        plano_expires_at: currentExpires.toISOString(),
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: session.customer as string,
        status_assinatura: 'ativo'
      })
      .eq('id', estabelecimentoId);

    if (updateError) throw updateError;

    return res.status(200).json({
      status: 'success',
      planId,
      expiresAt: currentExpires.toISOString()
    });

  } catch (error: any) {
    console.error('VERIFY SESSION ERROR:', error);
    return res.status(500).json({ error: error.message || 'Erro ao verificar sessão.' });
  }
}
