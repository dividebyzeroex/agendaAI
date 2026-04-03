import { Component, inject } from '@angular/core';
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
  template: `
    <div class="agenda-wrapper">
      <div class="agenda-header">
        <div>
          <h2>Sua <span class="gradient-text">Agenda</span></h2>
          <p>Clique em um horário vago para criar um agendamento. Arraste para mover.</p>
        </div>
        <div class="header-stats">
          <div class="stat-chip">
            <span class="chip-num">{{ (agendaService.events$ | async)?.length || 0 }}</span>
            <span class="chip-label">agendamentos</span>
          </div>
        </div>
      </div>

      <div class="calendar-card">
        <!-- SKELETON CALENDAR -->
        <div *ngIf="agendaService.isLoading$ | async" class="skeleton-calendar">
           <div class="calendar-header-skeleton">
              <div class="ag-skeleton" style="width: 200px; height: 32px;"></div>
              <div class="ag-skeleton" style="width: 150px; height: 32px;"></div>
           </div>
           <div class="calendar-grid-skeleton">
              <div class="grid-col" *ngFor="let i of [1,2,3,4,5,6,7]">
                 <div class="ag-skeleton" style="height: 100%; border-radius: 8px;"></div>
              </div>
           </div>
        </div>

        <full-calendar *ngIf="!(agendaService.isLoading$ | async)" [options]="calendarOptions" [events]="agendaService.events$ | async">
        </full-calendar>
      </div>
    </div>

    <!-- Modal de novo agendamento -->
    <app-agendar-modal
      *ngIf="showAgendarModal"
      [startStr]="selectInfo?.startStr || ''"
      [endStr]="selectInfo?.endStr || ''"
      [allDay]="selectInfo?.allDay || false"
      (confirmado)="onAgendamentoConfirmado()"
      (cancelado)="fecharModais()">
    </app-agendar-modal>

    <!-- Modal de detalhe/exclusão do evento -->
    <app-evento-modal
      *ngIf="showEventoModal"
      [evento]="eventoSelecionado"
      (fechado)="fecharModais()">
    </app-evento-modal>
  `,
  styles: [`
    .agenda-wrapper { padding: 2rem; font-family: 'Space Grotesk', sans-serif; }
    .agenda-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 2rem;
    }
    .agenda-header h2 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -.5px; color: #202124; }
    .agenda-header p  { margin: 4px 0 0 0; font-size: .9rem; color: #5f6368; }
    .gradient-text {
      background: linear-gradient(135deg, #1a73e8, #a142f4);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .header-stats { display: flex; gap: 8px; }
    .stat-chip {
      display: flex; flex-direction: column; align-items: center;
      background: white; border: 1px solid rgba(0,0,0,.07); border-radius: 12px;
      padding: .75rem 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,.03);
    }
    .chip-num  { font-size: 1.4rem; font-weight: 800; color: #1a73e8; letter-spacing: -1px; }
    .chip-label { font-size: .72rem; color: #9aa0a6; text-transform: uppercase; letter-spacing: .4px; }

    .calendar-card {
      background: white; padding: 1.5rem; border-radius: 16px;
      border: 1px solid rgba(0,0,0,.07);
      box-shadow: 0 4px 20px rgba(0,0,0,.03);
    }

    /* FullCalendar overrides premium */
    ::ng-deep .fc-theme-standard td,
    ::ng-deep .fc-theme-standard th { border-color: #f1f3f4; }
    ::ng-deep .fc-event {
      border-radius: 6px; border: none; padding: 2px 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,.1); cursor: pointer; font-size: .82rem;
    }
    ::ng-deep .fc-event:hover { filter: brightness(1.08); }
    ::ng-deep .fc-v-event { background-color: #1a73e8; }
    ::ng-deep .fc .fc-toolbar-title {
      font-size: 1.15rem; color: #202124; font-weight: 700;
      text-transform: capitalize; font-family: 'Space Grotesk', sans-serif;
    }
    ::ng-deep .fc .fc-button-primary {
      background: white; color: #202124; border: 1px solid #e8eaed;
      font-weight: 600; border-radius: 8px; transition: all .2s;
      font-family: 'Space Grotesk', sans-serif;
    }
    ::ng-deep .fc .fc-button-primary:hover { background: #f8f9fa; }
    ::ng-deep .fc .fc-button-primary:not(:disabled).fc-button-active {
      background: #202124; color: white; border-color: #202124;
    }
    ::ng-deep .fc-col-header-cell { font-weight: 600; color: #5f6368; font-size: .85rem; text-transform: uppercase; }
    ::ng-deep .fc-timegrid-slot { height: 40px !important; }
    ::ng-deep .fc-highlight { background: rgba(26,115,232,0.08) !important; border-radius: 6px; }

    /* Skeleton Styles */
    .skeleton-calendar { height: 600px; display: flex; flex-direction: column; gap: 1rem; }
    .calendar-header-skeleton { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .calendar-grid-skeleton { display: flex; flex: 1; gap: 4px; padding: 5px; background: #f8f9fa; border-radius: 8px; }
    .grid-col { flex: 1; height: 100%; }
  `]
})
export class AdminAgenda {
  agendaService = inject(AgendaEventService);

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
    allDaySlot: false,
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    nowIndicator: true,
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
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

  onAgendamentoConfirmado() {
    this.fecharModais();
    // Calendar auto-refresca via Realtime do Supabase
  }

  fecharModais() {
    this.showAgendarModal = false;
    this.showEventoModal  = false;
    this.selectInfo       = null;
    this.eventoSelecionado = null;
  }
}
