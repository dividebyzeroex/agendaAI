import { EstabelecimentoService } from './estabelecimento.service';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AgendaEventService } from './agenda-event.service';
import { CostTrackerService } from './cost-tracker.service';

export interface WorkflowRule {
  id: string;
  name: string;
  trigger: 'ON_EVENT_CREATED' | 'ON_EVENT_CANCELED';
  action: 'SEND_SMS' | 'SEND_EMAIL' | 'NOTIFY_ADMIN';
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private establishments = inject(EstabelecimentoService);
  private supabase = inject(SupabaseService).client;
  private costTracker = inject(CostTrackerService);
  private agendaService = inject(AgendaEventService);

  rules$ = new BehaviorSubject<WorkflowRule[]>([]);
  private previousEventsCount = 0;

  constructor() {
    this.fetchRules();
    this.listenToEvents();
  }

  async fetchRules() {
    const { data, error } = await this.supabase.from('workflows').select('*').order('created_at');
    if (!error) this.rules$.next((data as WorkflowRule[]) || []);
  }

  getRules(): WorkflowRule[] {
    return this.rules$.value;
  }

  async toggleRule(id: string): Promise<void> {
    const rule = this.rules$.value.find(r => r.id === id);
    if (!rule) return;
    const newActive = !rule.active;
    const { error } = await this.supabase.from('workflows').update({ active: newActive }).eq('id', id);
    if (error) throw error;
    this.rules$.next(this.rules$.value.map(r => (r.id === id ? { ...r, active: newActive } : r)));
  }

  async addRule(rule: Omit<WorkflowRule, 'id'>): Promise<WorkflowRule> {
    const { data, error } = await this.supabase.from('workflows').insert([{...rule, estabelecimento_id:this.establishments.estabelecimento$.value?.id}]).select().single();
    if (error) throw error;
    this.rules$.next([...this.rules$.value, data as WorkflowRule]);
    return data as WorkflowRule;
  }

  async deleteRule(id: string): Promise<void> {
    await this.supabase.from('workflows').delete().eq('id', id);
    this.rules$.next(this.rules$.value.filter(r => r.id !== id));
  }

  private listenToEvents() {
    this.agendaService.workflowEvents$.subscribe(({ trigger, payload }) => {
      void this.executeRulesFor(trigger, payload);
    });
  }

  private async executeRulesFor(trigger: string, payload: any) {
    if (!payload?.id || !payload?.estabelecimento_id) return;
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;
    try {
      const response = await fetch('/api/trigger-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ trigger, payload })
      });
      const result = await response.json();
      for (const action of result.actions || []) {
        if (action.action === 'SEND_SMS' && action.success) this.costTracker.trackSms();
      }
    } catch { /* A failed request is never counted as a sent message. */ }
  }
}
