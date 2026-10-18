import { Component, inject, ChangeDetectorRef, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { agendaDay, shiftAgendaDay } from '../../utils/agenda-day';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';

@Component({
  selector: 'app-admin-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './admin-agenda.html',
  styleUrls: ['./admin-agenda.css'],
})
export class AdminAgenda implements OnInit {
  public agendaService = inject(AgendaEventService);
  public segmentoConfig = inject(SegmentoConfigService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  private router=inject(Router);private route=inject(ActivatedRoute);
  calendarError='';
  showAgendarModal = false;
  showEventoModal  = false;
  selectInfo: any  = null;
  eventoSelecionado: AgendaEvent | null = null;
  viewMode: 'calendario' | 'fila' = 'calendario';

  selectedDay = this.route.snapshot.queryParamMap.get('dia') || agendaDay(new Date());
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
  openAppointment(event: AgendaEvent) { void this.router.navigate(['/admin/agenda/atendimento',event.id]); }
  newAppointment() {
    const start = `${this.selectedDay || agendaDay(new Date())}T09:00:00-03:00`;
    this.selectInfo = {startStr:start, endStr:new Date(new Date(start).getTime()+60*60*1000).toISOString(), allDay:false};
    void this.router.navigate(['/admin/agenda/novo'],{queryParams:{start:this.selectInfo.startStr}});
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
    initialView: 'timeGridDay',
    datesSet:(info:any)=>{this.selectedDay=agendaDay(info.view.calendar.getDate());this.cdr.markForCheck();},
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
    eventContent: (arg:any) => {const node=document.createElement('div');node.className='simple-calendar-event';const time=document.createElement('span');time.textContent=arg.timeText;const title=document.createElement('strong');title.textContent=arg.event.title;node.append(time,title);return {domNodes:[node]};},
    // Substitui prompt() pelo modal premium
    select: (info: any) => {
      // Âncora Temporal: Se selecionado no Mês (allDay), injetamos horário padrão para visibilidade na grade
      if (info.allDay) {
        const start=new Date(`${info.startStr.slice(0,10)}T09:00:00-03:00`);
        this.selectInfo={...info,startStr:start.toISOString(),endStr:new Date(start.getTime()+60*60000).toISOString(),allDay:false};
      } else {
        this.selectInfo = info;
      }
      void this.router.navigate(['/admin/agenda/novo'],{queryParams:{start:this.selectInfo.startStr}});
    },
    // Substitui confirm() pelo modal de detalhe
    eventClick: (info:any) => {void this.router.navigate(['/admin/agenda/atendimento',info.event.id]);},
    // Atualiza ao arrastar
    eventDrop: async (info:any) => {try{await this.agendaService.updateEvent(info.event.id,{start:info.event.startStr,end:info.event.endStr});this.calendarError='';}catch{info.revert();this.calendarError='Não foi possível mover o horário. O agendamento original foi mantido.';}this.cdr.markForCheck();},
    eventResize: async (info:any) => {try{await this.agendaService.updateEvent(info.event.id,{end:info.event.endStr});this.calendarError='';}catch{info.revert();this.calendarError='Não foi possível alterar a duração.';}this.cdr.markForCheck();},
  };

  ngOnInit() {
    // Sincroniza a fonte de eventos do calendário com o stream do serviço
    this.agendaService.events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(events => {
      this.calendarOptions = {
        ...this.calendarOptions,
        initialDate:this.selectedDay,
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
