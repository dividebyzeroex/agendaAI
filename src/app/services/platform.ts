import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  totalMrr: number;
  totalAppointments: number;
  aiMessagesSent: number;
}

export interface PlatformTenant {
  id: string;
  nome: string;
  slug: string;
  status: string;
  plano: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlatformService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async getGlobalMetrics(): Promise<PlatformMetrics> {
    try {
      const { data, error } = await this.supabase.rpc('get_platform_metrics');
      if (error) throw error;
      
      return data as PlatformMetrics;
    } catch (e) {
      console.error('[PlatformService] Error fetching metrics:', e);
      throw e;
    }
  }

  async getTenants(): Promise<PlatformTenant[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_platform_tenants');
      if (error) throw error;
      
      return data as PlatformTenant[];
    } catch (e) {
      console.error('[PlatformService] Error fetching tenants:', e);
      throw e;
    }
  }

  async getBillingData(): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke('platform-billing');
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[PlatformService] Error fetching billing:', e);
      throw e;
    }
  }

  async getSocialData(): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke('platform-social');
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[PlatformService] Error fetching social:', e);
      throw e;
    }
  }

}
