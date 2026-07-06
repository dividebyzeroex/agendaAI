import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import Stripe from "npm:stripe@^14.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY is not set.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
  });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    // Lógica para pegar o estabelecimento do usuário
    const { data: estabData } = await supabase
      .from('estabelecimento')
      .select('id, stripe_account_id')
      .limit(1)
      .single();

    if (!estabData) throw new Error("Estabelecimento não encontrado");

    let accountId = estabData.stripe_account_id;

    if (!accountId) {
      // Criar nova conta Express no Stripe Connect
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'BR', // Focado no Brasil para PIX
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
      });
      accountId = account.id;

      // Salvar no DB
      await supabase.from('estabelecimento').update({ stripe_account_id: accountId }).eq('id', estabData.id);
    }

    // Criar link de onboarding
    const origin = req.headers.get('origin') || 'http://localhost:4200';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin/configuracoes?connect=refresh`,
      return_url: `${origin}/admin/configuracoes?connect=success`,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
