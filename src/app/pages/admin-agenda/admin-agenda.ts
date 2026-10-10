import { Component, inject, ChangeDetectorRef, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { agendaDay, shiftAgendaDay } from '../../utils/agenda-day';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { AgendarModalComponent } from '../../components/agendar-modal/agendar-modal.component';
import { EventoModalComponent } from '../../components/evento-modal/evento-modal.component';
import { SegmentoConfigService } from '../../services/segmento-config.service';

@Component({
  selector: 'app-admin-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule, AgendarModalComponent, EventoModalComponent],
  templateUrl: './admin-agenda.html',
  styleUrls: ['./admin-agenda.css'],
})
export class AdminAgenda implements OnInit {
  public agendaService = inject(AgendaEventService);
  public segmentoConfig = inject(SegmentoConfigService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  showAgendarModal = false;
  showEventoModal  = false;
  selectInfo: any  = null;
  eventoSelecionado: AgendaEvent | null = null;
  viewMode: 'calendario' | 'fila' = 'calendario';

  selectedDay = agendaDay(new Date());
  selectedProfessional = '';
  get dailyEvents(): AgendaEvent[] {
    return this.agendaService.currentEvents.filter(e => agendaDay(e.start) === this.selectedDay && (!this.selectedProfessional || e.profissional_id === this.selectedProfessional)).sort((a,b) => new Date(a.start).getTime()-new Date(b.start).getTime());
  }
  get dailyProfessionals() {
    const professionals = new Map<string,string>();
    for (const e of this.agendaService.currentEvents) if(e.profissional_id) professionals.set(e.profissional_id, e.profissional_nome || 'Profissional');
    return Array.from(professionals, ([id,nome]) => ({id,nome}));
  }
  moveDay(amount: number) { this.selectedDay = shiftAgendaDay(this.selectedDay, amount); }
  today() { this.selectedDay = agendaDay(new Date()); }
  openAppointment(event: AgendaEvent) { this.eventoSelecionado = event; this.showEventoModal = true; }
  newAppointment() {
    const start = `${this.selectedDay || agendaDay(new Date())}T09:00:00-03:00`;
    this.selectInfo = {startStr:start, endStr:new Date(new Date(start).getTime()+60*60*1000).toISOString(), allDay:false};
    this.showAgendarModal = true;
  }
  statusLabel(status?: string) {
    return ({confirmado:'Confirmado',pendente:'Pendente',em_atendimento:'Em atendimento',concluido:'Concluído',cancelado:'Cancelado',noshow:'Não compareceu',pago:'Pago'} as Record<string,string>)[status || ''] || 'Agendado';
  }

  get filaEspera(): AgendaEvent[] {
    const hoje = agendaDay(new Date());
    const eventos = this.agendaService.currentEvents;
    return eventos
      .filter(e => agendaDay(e.start) === hoje && (e.status === 'pendente' || e.status === 'confirmado'))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  calendarOptions: CalendarOptions = {
    plugins: [timeGridPlugin, interactionPlugin, dayGridPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    locales: [ptBrLocale],
    locale: 'pt-br',
    slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00',
    slotDuration: '00:30:00',
    snapDuration: '00:30:00',
    allDaySlot: true,
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    nowIndicator: true,
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    // Renderização Customizada Elegante
    eventContent: (arg: any) => {
      const bgColor = arg.event.backgroundColor || '#4f46e5';
      const isPast = arg.event.end < new Date();
      const statusIcon = isPast ? 'pi-check-circle' : 'pi-clock';

      return {
        html: `
          <div class="premium-event-card" style="background-color: ${bgColor}; opacity: ${isPast ? '0.7' : '1'};">
            <div class="ev-time"><i class="pi ${statusIcon}"></i> ${arg.timeText}</div>
            <div class="ev-title">${arg.event.title}</div>
            ${arg.event.extendedProps.profissional_nome ? `<div class="ev-prof"><i class="pi pi-user" style="margin-right:2px"></i> ${arg.event.extendedProps.profissional_nome}</div>` : ''}
          </div>
        `
      };
    },
    // Substitui prompt() pelo modal premium
    select: (info: any) => {
      // Âncora Temporal: Se selecionado no Mês (allDay), injetamos horário padrão para visibilidade na grade
      if (info.allDay) {
        const start = new Date(info.startStr);
        start.setHours(9, 0, 0); // Início às 09:00
        
        const end = new Date(info.startStr);
        end.setHours(10, 0, 0); // Fim às 10:00 (ou duração padrão do serviço)

        this.selectInfo = {
          ...info,
          startStr: start.toISOString(),
          endStr: end.toISOString(),
          allDay: false // Forçamos para a grade de horários
        };
      } else {
        this.selectInfo = info;
      }
      this.showAgendarModal = true;
    },
    // Substitui confirm() pelo modal de detalhe
    eventClick: (info: any) => {
      this.eventoSelecionado = {
        id: info.event.id,
        title: info.event.title,
        start: info.event.startStr,
        end: info.event.endStr,
        backgroundColor: info.event.backgroundColor,
        status: info.event.extendedProps?.['status'],
        observacoes: info.event.extendedProps?.['observacoes'],
        cliente_id: info.event.extendedProps?.['cliente_id'],
        servico_id: info.event.extendedProps?.['servico_id'],
        profissional_id: info.event.extendedProps?.['profissional_id'],
        profissional_nome: info.event.extendedProps?.['profissional_nome'],
        metadata: info.event.extendedProps?.['metadata'],
      };
      this.showEventoModal = true;
    },
    // Atualiza ao arrastar
    eventDrop: (info: any) => {
      this.agendaService.updateEvent(info.event.id, {
        start: info.event.startStr,
        end:   info.event.endStr,
      });
    },
    eventResize: (info: any) => {
      this.agendaService.updateEvent(info.event.id, {
        end: info.event.endStr,
      });
    },
  };

  ngOnInit() {
    // Sincroniza a fonte de eventos do calendário com o stream do serviço
    this.agendaService.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(events => {
      this.calendarOptions = {
        ...this.calendarOptions,
        events: events
      };
      this.cdr.detectChanges();
    });
  }

  onAgendamentoConfirmado() {
    this.fecharModais();
  }

  fecharModais() {
    this.showAgendarModal = false;
    this.showEventoModal  = false;
    this.selectInfo       = null;
    this.eventoSelecionado = null;
  }
}
