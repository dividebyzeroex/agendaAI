import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  allDay?: boolean;
  cliente_id?: string;
  servico_id?: string;
  profissional_id?: string;
  profissional_nome?: string;
  status?: 'confirmado' | 'pendente' | 'cancelado' | 'concluido';
  observacoes?: string;
  servicos_extras?: any[];
  valor_total?: number;
  cobranca_enviada?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AgendaEventService {
  private supabase = inject(SupabaseService).client;

  private eventsSubject = new BehaviorSubject<AgendaEvent[]>([]);
  events$ = this.eventsSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  isLoading$ = this.isLoadingSubject.asObservable();

  constructor() {
    this.fetchEvents();
    this.subscribeRealtime();
  }

  private async fetchEvents() {
    this.isLoadingSubject.next(true);
    try {
      const { data, error } = await this.supabase
        .from('agenda_events')
        .select('*')
        .order('start');
      if (!error) this.eventsSubject.next(data || []);
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  /** Supabase Realtime: push updates to any client instantly */
  private subscribeRealtime() {
    this.supabase
      .channel('agenda_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_events' }, () => {
        this.fetchEvents();
      })
      .subscribe();
  }

  getEvents(): AgendaEvent[] {
    return this.eventsSubject.getValue();
  }

  async addEvent(event: Omit<AgendaEvent, 'id'>): Promise<AgendaEvent> {
    const { data, error } = await this.supabase
      .from('agenda_events')
      .insert([event])
      .select()
      .single();
    if (error) throw error;
    // Realtime will refresh, but also update local immediately
    this.eventsSubject.next([...this.getEvents(), data]);
    return data;
  }

  async updateEvent(id: string, changes: Partial<AgendaEvent>): Promise<void> {
    const { error } = await this.supabase
      .from('agenda_events')
      .update(changes)
      .eq('id', id);
    if (error) throw error;
    this.eventsSubject.next(
      this.getEvents().map(e => (e.id === id ? { ...e, ...changes } : e))
    );
  }

  async removeEvent(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('agenda_events')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.eventsSubject.next(this.getEvents().filter(e => e.id !== id));
  }

  async updateStatus(id: string, status: AgendaEvent['status']): Promise<void> {
    await this.updateEvent(id, { status });
  }
}
