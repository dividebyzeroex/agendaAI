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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { servicoId, estabelecimentoId, agendaEventId, origin } = await req.json();

    // Buscar informações do serviço
    const { data: servico } = await supabase.from('servicos').select('*').eq('id', servicoId).single();
    if (!servico || !servico.aceita_pagamento_antecipado) {
      throw new Error("Serviço inválido ou não aceita pré-pagamento");
    }

    // Buscar informações do estabelecimento para o Stripe Connect
    const { data: estab } = await supabase.from('estabelecimento').select('stripe_account_id').eq('id', estabelecimentoId).single();
    if (!estab || !estab.stripe_account_id) {
      throw new Error("Estabelecimento não possui conta financeira configurada");
    }

    // O valor cobrado é o valor antecipado configurado (em reais)
    const valorEmCentavos = Math.round(servico.valor_antecipado * 100);
    // A taxa da plataforma é de 8%
    const applicationFeeAmount = Math.round(valorEmCentavos * 0.08);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'], // Suporta cartão e PIX!
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `Pré-pagamento: ${servico.titulo}`,
              description: `Reserva garantida para ${servico.titulo}`,
            },
            unit_amount: valorEmCentavos,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: estab.stripe_account_id,
        },
      },
      success_url: `${origin}/agendar/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/agendar/cancel`,
      client_reference_id: agendaEventId,
      metadata: {
        agenda_event_id: agendaEventId,
        estabelecimento_id: estabelecimentoId
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
