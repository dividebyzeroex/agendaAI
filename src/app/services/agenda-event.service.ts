import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { EstabelecimentoService } from './estabelecimento.service';
import { SecurityService } from './security.service';

export interface AgendaEvent {
  id: string;
  estabelecimento_id?: string;
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
  private estService = inject(EstabelecimentoService);
  private security = inject(SecurityService);

  private eventsSubject = new BehaviorSubject<AgendaEvent[]>([]);
  events$ = this.eventsSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  isLoading$ = this.isLoadingSubject.asObservable();

  constructor() {
    this.estService.activeId$.subscribe(id => {
      if (id) this.fetchEvents();
    });
    this.subscribeRealtime();
  }

  private async fetchEvents() {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) return;

    this.isLoadingSubject.next(true);
    try {
      const { data, error } = await this.supabase
        .rpc('get_agenda_events_by_estab', { p_estab_id: estId });
      
      if (!error) {
        const decrypted = await Promise.all((data as AgendaEvent[] || []).map((e: AgendaEvent) => 
          this.security.decryptObject(e, ['title', 'observacoes'])
        ));

        this.ngZone.run(() => {
          this.eventsSubject.next(decrypted || []);
        });
      }
    } finally {
      this.ngZone.run(() => {
        this.isLoadingSubject.next(false);
      });
    }
  }

  private subscribeRealtime() {
    this.supabase
      .channel('realtime_agenda_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_events' }, (payload: any) => {
        this.handleRealtimeChange(payload);
        this.fetchEvents();
      })
      .subscribe();
  }

  private async handleRealtimeChange(payload: any) {
    const { eventType, new: newRec, old: oldRec } = payload;

    if (eventType === 'INSERT') {
      const decryptedTitle = await this.security.decryptData(newRec.title);
      const msg = `Cliente ${decryptedTitle} agendado para ${this.formatTime(newRec.start)}.`;
      
      this.ngZone.run(() => {
        this.notifService.showToast({
          type: 'SUCCESS',
          title: 'Novo Agendamento',
          message: msg,
          icon: 'pi pi-calendar-plus'
        });

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
      const decryptedTitle = await this.security.decryptData(oldRec.title);
      this.notifService.showToast({
        type: 'WARNING',
        title: 'Agendamento Removido',
        message: `O agendamento de ${decryptedTitle || 'um cliente'} foi excluído.`
      });
    }
  }

  private async notifyStatusChange(event: any) {
    let title = '';
    let message = '';
    let type: any = 'INFO';
    let icon = '';

    const decryptedTitle = await this.security.decryptData(event.title);

    switch (event.status) {
      case 'cancelado':
        title = 'Agendamento Cancelado';
        message = `O horário de ${decryptedTitle} foi cancelado.`;
        type = 'WARNING';
        icon = 'pi pi-calendar-times';
        break;
      case 'noshow':
        title = 'No-Show';
        message = `${decryptedTitle} não compareceu ao agendamento.`;
        type = 'WARNING';
        icon = 'pi pi-user-minus';
        break;
      case 'em_atendimento':
        title = 'Atendimento Iniciado';
        message = `O atendimento de ${decryptedTitle} começou agora.`;
        type = 'SUCCESS';
        icon = 'pi pi-play';
        break;
      case 'concluido':
        title = 'Atendimento Concluído';
        message = `O atendimento de ${decryptedTitle} foi finalizado com sucesso.`;
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
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) throw new Error('Contexto de estabelecimento não encontrado.');

    const encrypted = await this.security.encryptObject(event, ['title', 'observacoes']);

    const { data: encryptedData, error } = await this.supabase
      .rpc('create_agenda_event_safe', { 
        p_data: { ...encrypted, estabelecimento_id: estId } 
      })
      .maybeSingle<AgendaEvent>();
    
    if (error) throw error;
    
    const decrypted = await this.security.decryptObject(encryptedData as AgendaEvent, ['title', 'observacoes']);

    this.ngZone.run(() => {
      this.eventsSubject.next([...this.getEvents(), decrypted]);
    });
    return decrypted;
  }

  async updateEvent(id: string, changes: Partial<AgendaEvent>): Promise<void> {
    const encrypted = await this.security.encryptObject(changes, ['title', 'observacoes']);

    const { error } = await this.supabase
      .rpc('update_event_safe', { p_id: id, p_changes: encrypted });
    
    if (error) throw error;
    
    const decryptedChanges = await this.security.decryptObject(changes, ['title', 'observacoes']);

    this.ngZone.run(() => {
      this.eventsSubject.next(
        this.getEvents().map(e => (e.id === id ? { ...e, ...decryptedChanges } : e))
      );
    });
  }

  async removeEvent(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('delete_event_safe', { p_id: id });
    if (error) throw error;
    this.ngZone.run(() => {
      this.eventsSubject.next(this.getEvents().filter(e => e.id !== id));
    });
  }

  async updateStatus(id: string, status: AgendaEvent['status']): Promise<void> {
    await this.updateEvent(id, { status });
  }
}
