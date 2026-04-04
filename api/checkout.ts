import { MercadoPagoConfig, Preference } from 'mercadopago';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { estabelecimentoId, planId, price, months, title } = req.body;

    if (!estabelecimentoId || !planId || !price || !months) {
      return res.status(400).json({ error: 'Parâmetros insuficientes para criar checkout.' });
    }

    // JWT Security Guard (Claude-inspired API security)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Acesso negado: Missing Authorization Bearer token.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const sbUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (sbUrl && sbKey && sbUrl !== 'REPLACE_WITH_YOUR_SUPABASE_URL') {
      const supabase = createClient(sbUrl, sbKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error('JWT verification failed:', authError);
        return res.status(401).json({ error: 'Token de sessão inválido ou expirado.' });
      }
    } else {
      console.warn('⚠️ [API Security] Bypass JWT guard in local mock dev.');
    }

    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      console.error("MERCADOPAGO_ACCESS_TOKEN não está configurado.");
      return res.status(500).json({ error: 'Configuração do Mercado Pago ausente no servidor.' });
    }

    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const appUrl = process.env.NEXT_PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:4200');
    const baseUrl = `${appUrl}/admin/billing`;

    const externalReferencePayload = {
      estabelecimentoId,
      planId,
      months,
      type: 'saas_subscription'
    };

    const result = await preference.create({
      body: {
        items: [
          {
            id: planId,
            title: title || `Assinatura SaaS - ${months} Mes(es)`,
            description: `Acesso à plataforma por ${months} mês(es).`,
            quantity: 1,
            unit_price: Number(price),
            currency_id: 'BRL',
          },
        ],
        back_urls: {
          success: baseUrl,
          failure: baseUrl,
          pending: baseUrl,
        },
        auto_return: 'approved',
        external_reference: JSON.stringify(externalReferencePayload),
      },
    });

    return res.status(200).json({
      preferenceId: result.id,
      init_point: result.init_point,
    });
  } catch (error: any) {
    console.error('Erro no checkout Mercado Pago:', error);
    return res.status(500).json({ error: error.message || 'Erro ao gerar checkout' });
  }
}
