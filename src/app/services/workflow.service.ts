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
    const { data, error } = await this.supabase.from('workflows').insert([rule]).select().single();
    if (error) throw error;
    this.rules$.next([...this.rules$.value, data as WorkflowRule]);
    return data as WorkflowRule;
  }

  async deleteRule(id: string): Promise<void> {
    await this.supabase.from('workflows').delete().eq('id', id);
    this.rules$.next(this.rules$.value.filter(r => r.id !== id));
  }

  private listenToEvents() {
    this.previousEventsCount = this.agendaService.getEvents().length;
    this.agendaService.events$.subscribe(events => {
      const n = events.length;
      if (n > this.previousEventsCount) this.executeRulesFor('ON_EVENT_CREATED', events[events.length - 1]);
      else if (n < this.previousEventsCount) this.executeRulesFor('ON_EVENT_CANCELED', null);
      this.previousEventsCount = n;
    });
  }

  private async executeRulesFor(trigger: string, payload: any) {
    const active = this.rules$.value.filter(r => r.trigger === trigger && r.active);
    for (const rule of active) {
      try {
        await fetch('/api/trigger-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: rule.trigger, payload })
        });
        if (rule.action === 'SEND_SMS') this.costTracker.trackSms();
      } catch {
        if (rule.action === 'SEND_SMS') this.costTracker.trackSms();
      }
    }
  }
}
