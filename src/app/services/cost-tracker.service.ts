import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { EstabelecimentoService } from './estabelecimento.service';

export interface UsageQuota {
  tokensUsed: number;
  tokensLimit: number;
  smsUsed: number;
  smsLimit: number;
  agendamentosUsed: number;
  agendamentosLimit: number;
}

const PLAN_LIMITS: Record<string, any> = {
  starter:  { agendamentos: 100,  sms: 50,  tokens: 50000 },
  pro:      { agendamentos: 500,  sms: 300, tokens: 250000 },
  business: { agendamentos: 9999, sms: 9999, tokens: 1000000 },
};

@Injectable({
  providedIn: 'root'
})
export class CostTrackerService {
  private supabase = inject(SupabaseService).client;
  private estabService = inject(EstabelecimentoService);
  private usageChannel: any = null;

  private quotaSubject = new BehaviorSubject<UsageQuota>({
    tokensUsed: 0,
    tokensLimit: 50000,
    smsUsed: 0,
    smsLimit: 50,
    agendamentosUsed: 0,
    agendamentosLimit: 100
  });

  quota$ = this.quotaSubject.asObservable();

  constructor() {
    this.init();
  }

  private async init() {
    // Escuta mudanças no estabelecimento para recalcular limites e buscar uso
    this.estabService.estabelecimento$.subscribe(estab => {
      if (estab?.id) {
        this.fetchUsage(estab.id, estab.plano || 'starter');
        this.subscribeUsageChanges(estab.id);
      }
    });
  }

  private async fetchUsage(estabId: string, plano: string) {
    const monthKey = new Date().toISOString().slice(0, 7); // "2026-04"
    const limits = PLAN_LIMITS[plano] || PLAN_LIMITS['starter'];

    const { data } = await this.supabase
      .rpc('get_usage_quotas_by_estab', { 
        p_estab_id: estabId, 
        p_month: monthKey 
      });

    const usageMap: Record<string, number> = {};
    (data as any[] || []).forEach((row: any) => usageMap[row.resource] = row.count);

    this.quotaSubject.next({
      tokensUsed: usageMap['tokens'] || 0,
      tokensLimit: limits.tokens,
      smsUsed: usageMap['sms'] || 0,
      smsLimit: limits.sms,
      agendamentosUsed: usageMap['agendamentos'] || 0,
      agendamentosLimit: limits.agendamentos
    });
  }

  private subscribeUsageChanges(estabId: string) {
    // Limpa subscrição anterior se existir
    if (this.usageChannel) {
      this.supabase.removeChannel(this.usageChannel);
    }

    this.usageChannel = this.supabase
      .channel(`usage-counts-${estabId}`) // Nome único por estabelecimento
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'usage_quotas', filter: `estabelecimento_id=eq.${estabId}` }, 
        () => {
          const currentEstab = this.estabService.estabelecimento$.value;
          if (currentEstab) this.fetchUsage(currentEstab.id!, currentEstab.plano || 'starter');
        }
      )
      .subscribe();
  }

  getQuota(): UsageQuota {
    return this.quotaSubject.getValue();
  }

  // Record an SMS send event (locally, the real increment happens on API/Server)
  trackSms() {
    const current = this.getQuota();
    this.quotaSubject.next({
      ...current,
      smsUsed: current.smsUsed + 1
    });
  }
}
