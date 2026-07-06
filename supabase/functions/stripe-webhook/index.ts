import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import Stripe from "npm:stripe@^14.0.0";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response('STRIPE_SECRET_KEY is not set', { status: 500 });
  }
  
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
  });
  const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature || !endpointSecret) {
    return new Response('Missing stripe signature or endpoint secret', { status: 400 });
  }

  const body = await req.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed:`, err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const estabelecimentoId = session.client_reference_id; // Passado na criação do checkout
      const customerId = session.customer as string;

      const agendaEventId = session.metadata?.agenda_event_id;

      if (agendaEventId) {
        // É um pré-pagamento de agendamento
        await supabaseAdmin
          .from('agenda_events')
          .update({
            payment_status: 'pago_online',
            status: 'confirmado',
            stripe_session_id: session.id
          })
          .eq('id', agendaEventId);
        
        console.log(`Agendamento ${agendaEventId} confirmado com sucesso via Stripe.`);
      } else if (estabelecimentoId) {
        // É uma assinatura de plano PRO
        await supabaseAdmin
          .from('estabelecimento')
          .update({ plano_ativo: 'pro', stripe_customer_id: customerId })
          .eq('id', estabelecimentoId);
          
        console.log(`Estabelecimento ${estabelecimentoId} atualizado para plano PRO.`);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      await supabaseAdmin
        .from('estabelecimento')
        .update({ plano_ativo: 'free' })
        .eq('stripe_customer_id', customerId);
        
      console.log(`Subscription cancelada. Customer ${customerId} voltou pro plano FREE.`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error("Erro interno processando webhook Stripe:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
