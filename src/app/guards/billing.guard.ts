import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EstabelecimentoService } from '../services/estabelecimento.service';
import { firstValueFrom, filter, take, timeout } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';
export const billingGuard: CanActivateFn = async (_route, state) => {
  const client = inject(SupabaseService).client;
  const router = inject(Router);
  const est = inject(EstabelecimentoService);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return router.parseUrl('/login');
  try {
    await firstValueFrom(
      est.isLoading$.pipe(
        filter((v) => !v),
        take(1),
        timeout(20000),
      ),
    );
  } catch {
    return router.parseUrl('/login');
  }
  const selected = est.estabelecimento$.value?.id;
  const { data: owned } = await client
    .from('estabelecimento')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const { data: ids, error } = owned
    ? { data: [owned.id], error: null }
    : await client.rpc('get_meus_estabelecimentos');
  if (error || !ids?.length) return router.parseUrl('/login');
  const { data: e, error: lookupError } = await client
    .from('estabelecimento')
    .select('active,trial_ends_at,plano_expires_at')
    .eq('id', selected || ids[0])
    .single();
  if (lookupError || !e) return router.parseUrl('/login');
  // Allow invited founders whose original trial expired to redeem the new
  // access period, without granting access to any other operational module.
  // The program RPC still verifies tenant ownership and invitation status.
  if (state.url.includes('/admin/billing') || state.url.split(/[?#]/)[0] === '/admin/indicacoes') return true;
  const until = Math.max(
    Date.parse(e.trial_ends_at || '') || 0,
    Date.parse(e.plano_expires_at || '') || 0,
  );
  if (e.active && until > Date.now()) return true;
  // A purchase may have arrived after signup or after an existing trial expired.
  // The server matches the verified account email and owns the tenant; never trust client-submitted IDs.
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session?.access_token) {
      const response = await fetch('/api/hotmart-activate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const license = await response.json();
        if (license.status === 'active' && Date.parse(license.expiresAt) > Date.now()) return true;
      }
    }
  } catch {
    /* Keep existing billing fallback. */
  }
  return router.parseUrl('/admin/billing');
};
