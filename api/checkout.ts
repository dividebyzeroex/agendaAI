import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Check for Secret Key early to avoid crash
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('CRITICAL: STRIPE_SECRET_KEY is missing in environment variables.');
      return res.status(200).json({ 
        error: true, 
        message: 'Configuração do Stripe (Secret Key) ausente nas variáveis de ambiente da Vercel. Por favor, adicione-a no painel do projeto.' 
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,
    });

    const { estabelecimentoId, planId, price, months, title } = req.body;

    if (!estabelecimentoId || !planId || !price || !months) {
      return res.status(400).json({ error: 'Parâmetros insuficientes para criar checkout.' });
    }

    // JWT Security Guard
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Acesso negado: Missing Authorization Bearer token.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (sbUrl && sbKey) {
      const supabase = createClient(sbUrl, sbKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: 'Token de sessão inválido ou expirado.' });
      }
    }

    const appUrl = (process.env.NEXT_PUBLIC_URL || 'https://agenda-ai-xi.vercel.app').replace(/\/$/, '');
    const baseUrl = `${appUrl}/admin/billing`;

    // Map planIds to Stripe Price IDs
    const priceMap: Record<string, string | undefined> = {
      '1_month': process.env.STRIPE_PRICE_ID_1_MONTH,
      '3_months': process.env.STRIPE_PRICE_ID_3_MONTHS,
      '6_months': process.env.STRIPE_PRICE_ID_6_MONTHS,
      '12_months': process.env.STRIPE_PRICE_ID_12_MONTHS,
    };

    const stripePriceId = priceMap[planId];

    const sessionData: any = {
      payment_method_types: ['card'],
      line_items: stripePriceId 
        ? [{ price: stripePriceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'brl',
                product_data: {
                  name: title || `Assinatura SaaS - ${months} Mes(es)`,
                  description: `Acesso à plataforma por ${months} mês(es).`,
                },
                unit_amount: Math.round(price * 100), // Convert to cents
                recurring: { interval: 'month', interval_count: months },
              },
              quantity: 1,
            },
          ],
      mode: 'subscription',
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}`,
      client_reference_id: estabelecimentoId,
      metadata: {
        estabelecimentoId,
        planId,
        months: months.toString(),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionData);

    return res.status(200).json({
      sessionId: session.id,
      init_point: session.url,
    });
  } catch (error: any) {
    console.error('FATAL API ERROR:', error);
    return res.status(200).json({ 
      error: true, 
      message: `Erro de Runtime: ${error.message || 'Falha na inicialização da função'}. Verifique se todas as dependências (stripe, supabase-js) estão corretamente instaladas.` 
    });
  }
}
