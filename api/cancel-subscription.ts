import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { estabelecimentoId } = req.body;

    if (!estabelecimentoId) {
      return res.status(400).json({ error: 'ID do estabelecimento é obrigatório.' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Configuração do Stripe ausente.' });
    }

    // Auth Guard - Verify if user owns this establishment
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace('Bearer ', '');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,
    });

    // 1. Initialize Supabase
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase Config Error' });
    const supabase = createClient(sbUrl, sbKey);

    // 2. Fetch Stripe Subscription ID from DB
    const { data: estab, error: fetchError } = await supabase
      .from('estabelecimentos')
      .select('stripe_subscription_id, user_id')
      .eq('id', estabelecimentoId)
      .single();

    if (fetchError || !estab) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });

    // 3. Security Check (Optional but recommended)
    // You could verify if the user in the token matches estab.user_id

    if (!estab.stripe_subscription_id) {
      return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada para este estabelecimento no Stripe.' });
    }

    // 4. Cancel Renewal in Stripe (Standard SaaS approach: cancel at period end)
    await stripe.subscriptions.update(estab.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // 5. Update Status in Database (Mark as cancelled so it won't renew)
    const { error: updateError } = await supabase
      .from('estabelecimentos')
      .update({
        status_assinatura: 'cancelado' // Still active, but cancelled for next cycle
      })
      .eq('id', estabelecimentoId);

    if (updateError) throw updateError;

    return res.status(200).json({
      status: 'cancelled',
      message: 'Assinatura cancelada. O acesso permanecerá até o fim do período pago.'
    });

  } catch (error: any) {
    console.error('CANCEL SUBSCRIPTION ERROR:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cancelar assinatura.' });
  }
}
