import { discoveryCandidate, discoveryQuery, PROSPECT_FOCUS } from './prospect-focus.js';
import type { SupabaseClient } from '@supabase/supabase-js';
// One bounded public-business discovery request per UTC day. No personal-email guessing.
export async function discoverBusinesses(db:SupabaseClient){
 const key=process.env['GOOGLE_PLACES_API_KEY'];
 if(!key)return {status:'not_configured',discovered:0};
 const day=new Date().toISOString().slice(0,10);
 const {count,error}=await db.from('commercial_agent_runs').select('id',{head:true,count:'exact'}).eq('agent','discovery').gte('created_at',`${day}T00:00:00Z`);
 if(error)throw error;if(count)return{status:'already_run',discovered:0};
 const {error:startError}=await db.from('commercial_agent_runs').insert({agent:'discovery',status:'started',summary:{day,focus:PROSPECT_FOCUS.id}});if(startError)throw startError;
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
  method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.types,places.businessStatus'},
  body:JSON.stringify({textQuery:discoveryQuery(day,process.env['COMMERCIAL_SEARCH_LOCATIONS']),includedType:'barber_shop',strictTypeFiltering:true,languageCode:'pt-BR',regionCode:'BR',pageSize:10})
 });
 if(!response.ok)throw new Error('Business search unavailable');
 const result=await response.json() as {places?:Array<{id:string;displayName?:{text:string};websiteUri?:string;googleMapsUri?:string;types?:string[];businessStatus?:string}>};
 let discovered=0,excluded=0;
 for(const place of result.places||[]){
  if(!place.id||!discoveryCandidate(place)){excluded++;continue;}
  const {data,error:saveError}=await db.from('commercial_prospects').upsert({business_name:place.displayName!.text.slice(0,160),source_id:`google-places:${place.id}`,source_url:place.websiteUri||place.googleMapsUri||null,segment:'barbearia',status:'new',qualification_note:'Porte pendente: confirmar uma unidade independente e equipe de 1 a 5 profissionais na fonte antes da abordagem.'},{onConflict:'source_id',ignoreDuplicates:true}).select('id');
  if(saveError)throw saveError;discovered+=data?.length||0;
 }
 await db.from('commercial_agent_runs').insert({agent:'discovery',status:'completed',summary:{discovered,excluded,focus:PROSPECT_FOCUS.id,size_verification:'pending',query:discoveryQuery(day,process.env['COMMERCIAL_SEARCH_LOCATIONS']),source:'Google Places',contact_authorization:'not_inferred'}});
 return{status:'completed',discovered};
}
