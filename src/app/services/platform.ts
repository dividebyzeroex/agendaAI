import { SupabaseService } from './supabase.service';
import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

export interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  payingTenants: number;
  prospects: number;
  revenueMonth: number;
  commercialSent: number;
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
  trial_ends_at: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class PlatformService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = inject(SupabaseService).client;
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

  async getBillingData(): Promise<{ metrics: PlatformMetrics; payments: PlatformPayment[]; tenants: PlatformTenant[] }> {
    const [metrics, tenants, result] = await Promise.all([
      this.getGlobalMetrics(), this.getTenants(),
      this.supabase.from('commercial_payments').select('id,estabelecimento_id,amount_cents,currency,status,paid_at,created_at').order('created_at', { ascending: false }).limit(100)
    ]);
    if (result.error) throw result.error;
    return { metrics, tenants, payments: (result.data ?? []) as PlatformPayment[] };
  }

  async setTenantActive(id: string, active: boolean): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/commercial?action=tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, active })
    });
    if (!response.ok) throw new Error('Não foi possível atualizar o acesso do cliente.');
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

  async getObservabilityData(): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke('platform-observability');
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[PlatformService] Error fetching observability:', e);
      throw e;
    }
  }

}

export interface PlatformPayment {
  id: string;
  estabelecimento_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}
