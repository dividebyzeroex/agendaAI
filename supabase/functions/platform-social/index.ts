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
      throw new Error('Forbidden: Only superadmin can access platform social.');
    }

    const zernioToken = Deno.env.get('ZERNIO_ACCESS_TOKEN');
    if (!zernioToken) throw new Error('ZERNIO_ACCESS_TOKEN is missing');

    // 2. Fetch posts from Zernio
    const zernioResp = await fetch('https://api.zernio.com/v1/posts?limit=50', {
      headers: { 'Authorization': `Bearer ${zernioToken}` }
    });
    
    if (!zernioResp.ok) {
      throw new Error(`Zernio API returned ${zernioResp.status}`);
    }

    const zernioData = await zernioResp.json();
    const rawPosts = zernioData.data || [];

    let scheduled = 0;
    let publishedToday = 0;
    let failed = 0;
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const queue = rawPosts.map((post: any) => {
      // Map Zernio status to our status
      let status = 'scheduled';
      if (post.status === 'PUBLISHED') status = 'published';
      else if (post.status === 'FAILED') status = 'failed';
      else if (post.status === 'SCHEDULED') status = 'scheduled';
      
      // Calculate stats
      if (status === 'scheduled') scheduled++;
      if (status === 'failed') failed++;
      if (status === 'published') {
        const publishDate = new Date(post.published_at || post.created_at);
        if (publishDate >= today) {
          publishedToday++;
        }
      }

      return {
        id: post.id,
        tenant: post.profile?.name || post.account?.name || 'Conta Zernio',
        platform: (post.platform || 'instagram').toLowerCase(),
        scheduledFor: post.scheduled_at || post.created_at,
        status: status,
        content: post.text || post.caption || 'Sem legenda'
      };
    });

    const responsePayload = {
      isZernioConnected: true,
      stats: {
        scheduled,
        publishedToday,
        failed
      },
      queue
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message, isZernioConnected: false, stats: { scheduled: 0, publishedToday: 0, failed: 0 }, queue: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // Returning 400 but frontend will handle it
    });
  }
});
