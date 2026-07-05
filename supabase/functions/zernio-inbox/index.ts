import "jsr:@supabase/functions-js/edge-runtime.d.ts";
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const zernioApiKey = Deno.env.get("ZERNIO_API_KEY");

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!zernioApiKey) {
      throw new Error("ZERNIO_API_KEY is not configured on the server.");
    }

    const url = new URL(req.url);
    let conversationId = url.searchParams.get('conversation_id');
    let accountId = url.searchParams.get('account_id');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.conversation_id) conversationId = body.conversation_id;
        if (body.account_id) accountId = body.account_id;
      } catch (e) {
        // Body might be empty or invalid, ignore
      }
    }

    let fetchUrl = "https://zernio.com/api/v1/inbox/conversations";
    if (conversationId && accountId) {
       fetchUrl = `https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages?account_id=${accountId}&sort_order=asc`;
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${zernioApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
       throw new Error(`Zernio API responded with status ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
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
