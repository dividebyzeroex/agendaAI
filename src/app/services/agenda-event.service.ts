import { Injectable, inject, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { EstabelecimentoService } from './estabelecimento.service';
import { SecurityService } from './security.service';
import { ProfessionalIdentityService } from './professional-identity.service';
import { parseSupabaseError } from '../core/helpers/error-parser';

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
  comanda_fisica?: string;
  metadata?: any;
}

@Injectable({ providedIn: 'root' })
export class AgendaEventService {
  private supabase = inject(SupabaseService).client;
  private ngZone = inject(NgZone);
  private notifService = inject(NotificationService);
  private estService = inject(EstabelecimentoService);
  private security = inject(SecurityService);
  private identity = inject(ProfessionalIdentityService);

  readonly workflowEvents$ = new Subject<{ trigger: string; payload: AgendaEvent }>();
  private eventsSubject = new BehaviorSubject<AgendaEvent[]>([]);
  events$ = this.eventsSubject.asObservable();
  get currentEvents(): AgendaEvent[] { return this.eventsSubject.value; }

  readonly error$ = new BehaviorSubject<string>('');
  reload(){return this.fetchEvents();}

  private loadVersion=0;
  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  isLoading$ = this.isLoadingSubject.asObservable();

  constructor() {
    this.estService.activeId$.subscribe(id => {
      ++this.loadVersion;this.eventsSubject.next([]);
      if (id) this.fetchEvents();else this.isLoadingSubject.next(false);
    });
    this.subscribeRealtime();
  }

  private async fetchEvents() {
    const estId = (this.estService as any)['activeIdSubject'].value;
    if (!estId) return;

    const version=++this.loadVersion;
    this.isLoadingSubject.next(true);
    this.error$.next('');
    try {
      const { data, error } = await this.supabase
        .rpc('get_agenda_events_by_estab', { p_estab_id: estId });

      if(error)throw error;
      if (!error) {
        const decrypted = await Promise.all((data as AgendaEvent[] || []).map((e: AgendaEvent) =>
          this.security.decryptObject(e, ['title', 'observacoes', 'profissional_nome'])
        ));
        // Earlier event RPCs persist the professional UUID but leave the display
        // name blank. Resolve from the professional roster without ever changing
        // the immutable UUID used to calculate commissions.
        const missing = decrypted.filter(e=>!!e.profissional_id && !e.profissional_nome?.trim());
        if(missing.length) {
          try {
            const names = await this.identity.names(estId, missing.map(e=>e.profissional_id!));
            for(const event of missing)
              event.profissional_nome = names.get(event.profissional_id!) || 'Profissional cadastrado';
          } catch {
            for(const event of missing) event.profissional_nome = 'Profissional cadastrado';
          }
        }
        this.ngZone.run(() => {
          if(version===this.loadVersion)this.eventsSubject.next(decrypted || []);
        });
      }
    } catch {
      if(version===this.loadVersion)this.ngZone.run(()=>this.error$.next('Não foi possível carregar os agendamentos. Tente novamente.'));
    } finally {
      this.ngZone.run(() => {
        if(version===this.loadVersion)this.isLoadingSubject.next(false);
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

    const encrypted = await this.security.encryptObject(event, ['title', 'observacoes', 'profissional_nome']);

    const { data: encryptedData, error } = await this.supabase
      .rpc('create_agenda_event_safe', {
        p_data: { ...encrypted, estabelecimento_id: estId }
      })
      .maybeSingle<AgendaEvent>();

    if (error) throw new Error(parseSupabaseError(error));

    const decrypted = await this.security.decryptObject(encryptedData as AgendaEvent, ['title', 'observacoes', 'profissional_nome']);

    this.ngZone.run(() => {
      this.eventsSubject.next([...this.getEvents(), decrypted]);
    });
    this.workflowEvents$.next({ trigger: 'ON_EVENT_CREATED', payload: decrypted });
    return decrypted;
  }

  async addSeries(event:Omit<AgendaEvent,'id'>,count:number,days:number,key:string):Promise<AgendaEvent[]> {
    const estId=this.estService.estabelecimento$.value?.id;
    if(!estId)throw new Error('Estabelecimento não encontrado.');
    const encrypted=await this.security.encryptObject(event,['title','observacoes','profissional_nome']);
    const {data,error}=await this.supabase.rpc('create_agenda_series',{p_data:{...encrypted,estabelecimento_id:estId},p_count:count,p_days:days,p_key:key});
    if(error){
      // Keep ordinary bookings available while the additive database migration is pending.
      // Never retry network/permission errors: their outcome may be uncertain.
      if(error.code==='PGRST202'){
        if(count===1)return [await this.addEvent(event)];
        throw new Error('A recorrência aguarda a atualização do banco. Escolha uma visita para salvar este agendamento.');
      }
      throw new Error(parseSupabaseError(error));
    }
    const rows=await Promise.all((data as AgendaEvent[]).map(e=>this.security.decryptObject(e,['title','observacoes','profissional_nome'])));
    this.ngZone.run(()=>this.eventsSubject.next([...new Map([...this.currentEvents,...rows].map(e=>[e.id,e])).values()]));
    return rows;
  }

  async updateEvent(id: string, changes: Partial<AgendaEvent>): Promise<void> {
    const encrypted = await this.security.encryptObject(changes, ['title', 'observacoes', 'profissional_nome']);

    const { data:updated,error } = await this.supabase
      .rpc('update_event_safe', { p_id: id, p_changes: encrypted });

    if (error) throw new Error(parseSupabaseError(error));
    if(!Array.isArray(updated)||!updated.length)throw new Error('O atendimento não foi atualizado. Atualize a agenda e tente novamente.');

    const decryptedChanges = await this.security.decryptObject(changes, ['title', 'observacoes', 'profissional_nome']);

    this.ngZone.run(() => {
      this.eventsSubject.next(
        this.getEvents().map(e => (e.id === id ? { ...e, ...decryptedChanges } : e))
      );
    });
    if (changes.status === 'cancelado') {
      const event = this.getEvents().find(e => e.id === id);
      if (event) this.workflowEvents$.next({ trigger: 'ON_EVENT_CANCELED', payload: event });
    }
  }

  async removeEvent(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('delete_event_safe', { p_id: id });
    if (error) throw new Error(parseSupabaseError(error));
    this.ngZone.run(() => {
      this.eventsSubject.next(this.getEvents().filter(e => e.id !== id));
    });
  }

  async updateStatus(id: string, status: AgendaEvent['status']): Promise<void> {
    await this.updateEvent(id, { status });
  }
}
