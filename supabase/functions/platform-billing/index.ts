import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 1. Authenticate user and verify superadmin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');
    if (user.email !== 'joao.almeida_msbrasil@outlook.com') {
      throw new Error('Forbidden: Only superadmin can access platform billing.');
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is missing');

    // 2. Fetch Subscriptions to calculate MRR and ARR
    const subsResp = await fetch('https://api.stripe.com/v1/subscriptions?status=active&limit=100', {
      headers: { 'Authorization': `Bearer ${stripeKey}` }
    });
    const subsData = await subsResp.json();
    
    let mrr = 0;
    const plansCount: Record<string, { count: number, mrr: number }> = {};
    let totalSubs = 0;

    if (subsData.data) {
      for (const sub of subsData.data) {
        if (sub.items && sub.items.data.length > 0) {
          const item = sub.items.data[0];
          const price = item.price.unit_amount / 100; // in BRL/USD depending on config
          const planName = item.price.metadata?.name || item.price.nickname || item.price.id;
          
          mrr += price;
          totalSubs++;
          
          if (!plansCount[planName]) {
            plansCount[planName] = { count: 0, mrr: 0 };
          }
          plansCount[planName].count++;
          plansCount[planName].mrr += price;
        }
      }
    }

    const arr = mrr * 12;
    const arpu = totalSubs > 0 ? mrr / totalSubs : 0;
    
    // Format plans array for the frontend
    const plans = Object.keys(plansCount).map(name => ({
      name,
      count: plansCount[name].count,
      mrr: plansCount[name].mrr,
      percent: (plansCount[name].mrr / (mrr || 1)) * 100
    }));

    // 3. Fetch Recent Charges for transactions feed
    const chargesResp = await fetch('https://api.stripe.com/v1/charges?limit=15', {
      headers: { 'Authorization': `Bearer ${stripeKey}` }
    });
    const chargesData = await chargesResp.json();

    const transactions = (chargesData.data || []).map((charge: any) => ({
      id: charge.id,
      tenant: charge.billing_details?.email || charge.customer || 'Desconhecido',
      plan: charge.description || 'Pagamento',
      amount: charge.amount / 100,
      date: new Date(charge.created * 1000).toISOString(),
      status: charge.status // 'succeeded', 'failed', 'pending'
    }));

    const responsePayload = {
      metrics: {
        mrr,
        arr,
        arpu,
        churn: 0 // Stubbing churn as it requires complex calculation
      },
      plans,
      transactions
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
