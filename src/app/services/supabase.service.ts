import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { boundedFetch } from '../core/helpers/bounded-fetch';
import { environment } from '../../environments/environment';

/**
 * Central Supabase client factory — all services share this singleton.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey, { global: { fetch: boundedFetch }, auth: { storageKey: 'ag-auth-token', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
}
