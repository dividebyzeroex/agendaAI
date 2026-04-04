import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';

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
  status?: 'confirmado' | 'pendente' | 'cancelado' | 'concluido' | 'noshow' | 'em_atendimento';
  status_confirmacao?: 'pendente' | 'aceito' | 'recusado';
  token_confirmacao?: string;
  observacoes?: string;
  servicos_extras?: any[];
  valor_total?: number;
  cobranca_enviada?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AgendaEventService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);
  private notifService = inject(NotificationService);

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
      if (!error) {
        this.ngZone.run(() => {
          this.eventsSubject.next(data || []);
        });
      }
    } finally {
      this.ngZone.run(() => {
        this.isLoadingSubject.next(false);
      });
    }
  }

  /** Supabase Realtime: push updates to any client instantly */
  private subscribeRealtime() {
    this.supabase
      .channel('realtime_agenda_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_events' }, (payload: any) => {
        console.log('[AgendaRealtime] Change detected:', payload.eventType);
        this.handleRealtimeChange(payload);
        this.fetchEvents();
      })
      .subscribe();
  }

  private handleRealtimeChange(payload: any) {
    const { eventType, new: newRec, old: oldRec } = payload;

    if (eventType === 'INSERT') {
      const msg = `Cliente ${newRec.title} agendado para ${this.formatTime(newRec.start)}.`;
      
      this.ngZone.run(() => {
        // Ephemeral Toast
        this.notifService.showToast({
          type: 'SUCCESS',
          title: 'Novo Agendamento',
          message: msg,
          icon: 'pi pi-calendar-plus'
        });

        // Persistent Notification
        this.notifService.addNotification({
          type: 'SUCCESS',
          title: 'Novo Cliente Agendado',
          message: msg,
          action: { label: 'Abrir Agenda', link: '/admin/agenda' }
        });
      });
    } else if (eventType === 'UPDATE') {
      if (newRec.status !== oldRec.status) {
        this.notifyStatusChange(newRec);
      }
    } else if (eventType === 'DELETE') {
      this.notifService.showToast({
        type: 'WARNING',
        title: 'Agendamento Removido',
        message: `O agendamento de ${oldRec.title || 'um cliente'} foi excluído.`
      });
    }
  }

  private notifyStatusChange(event: any) {
    let title = '';
    let message = '';
    let type: any = 'INFO';
    let icon = '';

    switch (event.status) {
      case 'cancelado':
        title = 'Agendamento Cancelado';
        message = `O horário de ${event.title} foi cancelado.`;
        type = 'WARNING';
        icon = 'pi pi-calendar-times';
        break;
      case 'noshow':
        title = 'No-Show';
        message = `${event.title} não compareceu ao agendamento.`;
        type = 'WARNING';
        icon = 'pi pi-user-minus';
        break;
      case 'em_atendimento':
        title = 'Atendimento Iniciado';
        message = `O atendimento de ${event.title} começou agora.`;
        type = 'SUCCESS';
        icon = 'pi pi-play';
        break;
      case 'concluido':
        title = 'Atendimento Concluído';
        message = `O atendimento de ${event.title} foi finalizado com sucesso.`;
        type = 'SUCCESS';
        icon = 'pi pi-check-circle';
        break;
    }

    if (title) {
      this.notifService.showToast({ type, title, message, icon });
    }
  }

  private formatTime(dt: string): string {
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    this.ngZone.run(() => {
      this.eventsSubject.next([...this.getEvents(), data]);
    });
    return data;
  }

  async updateEvent(id: string, changes: Partial<AgendaEvent>): Promise<void> {
    const { error } = await this.supabase
      .from('agenda_events')
      .update(changes)
      .eq('id', id);
    if (error) throw error;
    this.ngZone.run(() => {
      this.eventsSubject.next(
        this.getEvents().map(e => (e.id === id ? { ...e, ...changes } : e))
      );
    });
  }

  async removeEvent(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('agenda_events')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.ngZone.run(() => {
      this.eventsSubject.next(this.getEvents().filter(e => e.id !== id));
    });
  }

  async updateStatus(id: string, status: AgendaEvent['status']): Promise<void> {
    await this.updateEvent(id, { status });
  }
}
