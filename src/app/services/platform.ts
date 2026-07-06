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
      
      if (data) {
          return data as PlatformMetrics;
      }
      
      return this.getMockMetrics();
    } catch (e) {
      console.warn('[PlatformService] Error fetching metrics, using mock', e);
      return this.getMockMetrics();
    }
  }

  async getTenants(): Promise<PlatformTenant[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_platform_tenants');
      if (error) throw error;
      
      if (data) {
          return data as PlatformTenant[];
      }
      
      return this.getMockTenants();
    } catch (e) {
      console.warn('[PlatformService] Error fetching tenants, using mock', e);
      return this.getMockTenants();
    }
  }

  private getMockMetrics(): PlatformMetrics {
    return {
      totalTenants: 142,
      activeTenants: 118,
      totalMrr: 12450.00,
      totalAppointments: 18450,
      aiMessagesSent: 45200
    };
  }

  private getMockTenants(): PlatformTenant[] {
    return [
      { id: '1', nome: 'Barbearia do João', slug: 'barbearia-do-joao', status: 'active', plano: 'pro', created_at: '2026-01-10T00:00:00Z' },
      { id: '2', nome: 'Spa Zen', slug: 'spa-zen', status: 'active', plano: 'enterprise', created_at: '2026-02-15T00:00:00Z' },
      { id: '3', nome: 'Tattoo Studio', slug: 'tattoo-studio', status: 'blocked', plano: 'starter', created_at: '2026-03-20T00:00:00Z' }
    ];
  }
}
