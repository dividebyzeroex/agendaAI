import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Get raw body for Stripe signature verification
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    let chunks: any[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });

  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypass RLS for admin updates
  );

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { estabelecimentoId, planId, months } = session.metadata || {};

        if (estabelecimentoId && planId && months) {
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + parseInt(months));

          const { error } = await supabase
            .from('estabelecimento')
            .update({
              plano: planId,
              plano_expires_at: expiresAt.toISOString(),
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
            })
            .eq('id', estabelecimentoId);

          if (error) throw error;
          console.log(`[Stripe Webhook] Plano ${planId} ativado para Estabelecimento: ${estabelecimentoId}`);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await supabase
          .from('estabelecimento')
          .update({ plano: 'expired', stripe_subscription_id: null })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Erro ao processar Webhook Stripe:', error);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
}
