import type { SupabaseClient } from '@supabase/supabase-js';
// One bounded public-business discovery request per UTC day. No personal-email guessing.
export async function discoverBusinesses(db:SupabaseClient){
 const key=process.env['GOOGLE_PLACES_API_KEY'];
 if(!key)return {status:'not_configured',discovered:0};
 const day=new Date().toISOString().slice(0,10);
 const {count,error}=await db.from('commercial_agent_runs').select('id',{head:true,count:'exact'}).eq('agent','discovery').gte('created_at',`${day}T00:00:00Z`);
 if(error)throw error;if(count)return{status:'already_run',discovered:0};
 const {error:startError}=await db.from('commercial_agent_runs').insert({agent:'discovery',status:'started',summary:{day}});if(startError)throw startError;
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
  method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.websiteUri,places.googleMapsUri'},
  body:JSON.stringify({textQuery:process.env['COMMERCIAL_SEARCH_QUERY']||'salões de beleza e barbearias em São Paulo',languageCode:'pt-BR',pageSize:10})
 });
 if(!response.ok)throw new Error('Business search unavailable');
 const result=await response.json() as {places?:Array<{id:string;displayName?:{text:string};websiteUri?:string;googleMapsUri?:string}>};
 let discovered=0;
 for(const place of result.places||[]){
  if(!place.id||!place.displayName?.text)continue;
  const {data,error:saveError}=await db.from('commercial_prospects').upsert({business_name:place.displayName.text.slice(0,160),source_id:`google-places:${place.id}`,source_url:place.websiteUri||place.googleMapsUri||null,segment:'beleza',status:'new'},{onConflict:'source_id',ignoreDuplicates:true}).select('id');
  if(saveError)throw saveError;discovered+=data?.length||0;
 }
 await db.from('commercial_agent_runs').insert({agent:'discovery',status:'completed',summary:{discovered,source:'Google Places',contact_authorization:'not_inferred'}});
 return{status:'completed',discovered};
}
