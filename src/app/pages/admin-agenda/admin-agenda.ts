import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { AgendarModalComponent } from '../../components/agendar-modal/agendar-modal.component';
import { EventoModalComponent } from '../../components/evento-modal/evento-modal.component';

@Component({
  selector: 'app-admin-agenda',
  standalone: true,
  imports: [CommonModule, FullCalendarModule, AgendarModalComponent, EventoModalComponent],
  templateUrl: './admin-agenda.html',
  styleUrls: ['./admin-agenda.css'],
})
export class AdminAgenda implements OnInit {
  public agendaService = inject(AgendaEventService);
  private cdr = inject(ChangeDetectorRef);

  showAgendarModal = false;
  showEventoModal  = false;
  selectInfo: any  = null;
  eventoSelecionado: AgendaEvent | null = null;

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
      this.selectInfo = info;
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
    this.agendaService.events$.subscribe(events => {
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
