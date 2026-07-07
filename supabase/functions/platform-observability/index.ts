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
      throw new Error('Forbidden: Only superadmin can access platform observability.');
    }

    // Since we don't have a real centralized logging database table yet for everything,
    // we will fetch actual AI logs if they existed in a table, or just return empty arrays 
    // to remove the fake data flash. 
    // In a real scenario, you would query your `system_logs` or `ai_inferences` table here.
    
    // For now, we return 0/empty to clear out any fake data on the frontend.
    const responsePayload = {
      metrics: {
        latency: 0,
        successRate: 0,
        tokensUsed: 0,
        errorsToday: 0
      },
      logs: []
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
