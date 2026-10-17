import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
export const platformOwnerGuard: CanActivateFn = async () => {
  const client=inject(SupabaseService).client; const router=inject(Router);
  const {data:{user}}=await client.auth.getUser();
  if(!user)return router.parseUrl('/login');
  const {data,error}=await client.rpc('is_platform_owner');
  return !error && data===true ? true : router.parseUrl('/login');
};
