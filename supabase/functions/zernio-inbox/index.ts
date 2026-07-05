import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

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

    const response = await fetch("https://zernio.com/api/v1/inbox/conversations", {
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
