import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
export const billingGuard: CanActivateFn = async (_route, state) => {
  const client=inject(SupabaseService).client; const router=inject(Router);
  const {data:{user}}=await client.auth.getUser();
  if(!user)return router.parseUrl('/login');
  const {data:owned}=await client.from('estabelecimento').select('id').eq('user_id',user.id).limit(1).maybeSingle();
  const {data:ids,error}=owned?{data:[owned.id],error:null}:await client.rpc('get_meus_estabelecimentos');
  if(error||!ids?.length)return router.parseUrl('/login');
  const {data:e,error:lookupError}=await client.from('estabelecimento').select('active,trial_ends_at,plano_expires_at').eq('id',ids[0]).single();
  if(lookupError||!e)return router.parseUrl('/login');
  if(state.url.includes('/admin/billing'))return true;
  const until=Math.max(Date.parse(e.trial_ends_at||'')||0,Date.parse(e.plano_expires_at||'')||0);
  return e.active&&until>Date.now() ? true : router.parseUrl('/admin/billing');
};
