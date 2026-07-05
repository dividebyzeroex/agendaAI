import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const zernioApiKey = Deno.env.get("ZERNIO_API_KEY");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!zernioApiKey) {
      throw new Error("ZERNIO_API_KEY is not configured on the server.");
    }

    if (req.method !== 'POST') {
      throw new Error("Method not allowed");
    }

    const body = await req.json();
    const { channel_id, to, text } = body;

    if (!channel_id || !to || !text) {
      throw new Error("Missing channel_id, to, or text parameters");
    }

    console.log(`Sending message to ${to} via channel ${channel_id}`);

    const response = await fetch(`https://zernio.com/api/v1/inbox/conversations/${to}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zernioApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: channel_id,
        message: text
      })
    });

    if (!response.ok) {
       throw new Error(`Zernio API responded with status ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
