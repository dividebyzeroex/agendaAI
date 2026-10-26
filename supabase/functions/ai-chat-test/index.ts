import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/** Retired test agent: never accept legacy writes bypassing the booking workflow. */
Deno.serve((_request: Request) => new Response(
 JSON.stringify({error:"Este assistente de teste foi desativado. Abra o Intelligence Hub.",code:"AI_LEGACY_RETIRED"}),
 {status:410,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}}
));