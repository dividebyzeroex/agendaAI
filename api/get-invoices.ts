import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { estabelecimentoId } = req.query;

    if (!estabelecimentoId) {
      return res.status(400).json({ error: 'ID do estabelecimento é obrigatório.' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Configuração do Stripe ausente.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16' as any,
    });

    // 1. Initialize Supabase
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase Config Error' });
    const supabase = createClient(sbUrl, sbKey);

    // 2. Fetch Customer ID from DB
    const { data: estab, error: fetchError } = await supabase
      .from('estabelecimentos')
      .select('stripe_customer_id')
      .eq('id', estabelecimentoId)
      .single();

    if (fetchError || !estab || !estab.stripe_customer_id) {
      return res.status(200).json({ invoices: [], message: 'Cliente sem histórico de faturamento no Stripe ainda.' });
    }

    // 3. Fetch Invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: estab.stripe_customer_id,
      limit: 10,
    });

    // 4. Format for UI
    const formattedInvoices = invoices.data.map(inv => ({
      id: inv.number || inv.id,
      date: new Date(inv.created * 1000).toISOString().split('T')[0],
      amount: inv.amount_paid / 100,
      status: inv.status === 'paid' ? 'Paga' : 'Pendente',
      pdfUrl: inv.invoice_pdf || inv.hosted_invoice_url
    }));

    return res.status(200).json({
      invoices: formattedInvoices
    });

  } catch (error: any) {
    console.error('GET INVOICES ERROR:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar faturas.' });
  }
}
