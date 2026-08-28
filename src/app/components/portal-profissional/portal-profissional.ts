import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ProfissionaisService } from '../../services/profissionais.service';
import { NotificationService } from '../../services/notification.service';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-portal-profissional',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule],
  templateUrl: './portal-profissional.html',
  styleUrls: ['./portal-profissional.css']
})
export class PortalProfissionalComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private agendaService = inject(AgendaEventService);
  private profService = inject(ProfissionaisService);
  private notifService = inject(NotificationService);

  private sub = new Subscription();

  myProfile: any;
  saudacao = '';
  
  todayAppointments: AgendaEvent[] = [];
  nextAppointment: AgendaEvent | null = null;
  
  totalAtendimentos = 0;
  estimatedCommissions = 0;
  commissionRate = 0; // Vai buscar o real
  
  ngOnInit() {
    this.sub.add(
      combineLatest([
        this.authService.profile$,
        this.profService.profissionais$
      ]).subscribe(([p, profs]) => {
        this.myProfile = p;
        if (p?.id) {
          const profData = profs.find(pr => pr.user_id === p.id || pr.id === p.id);
          // O valor de comissao_padrao geralmente é em porcentagem (ex: 50 para 50%)
          this.commissionRate = profData?.comissao_padrao ? (profData.comissao_padrao / 100) : 0;
        }
        this.updateSaudacao();
        this.filterMyEvents(this.agendaService.getEvents());
      })
    );

    this.sub.add(
      this.agendaService.events$.subscribe(events => {
        this.filterMyEvents(events);
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  updateSaudacao() {
    const hora = new Date().getHours();
    let prefix = 'Boa noite';
    if (hora >= 5 && hora < 12) prefix = 'Bom dia';
    else if (hora >= 12 && hora < 18) prefix = 'Boa tarde';

    if (this.myProfile?.nome) {
      const primeiroNome = this.myProfile.nome.split(' ')[0];
      this.saudacao = `${prefix}, ${primeiroNome}!`;
    } else {
      this.saudacao = `${prefix}!`;
    }
  }

  filterMyEvents(events: AgendaEvent[]) {
    if (!this.myProfile?.id) return;
    
    const agora = new Date();
    const profId = this.myProfile.id;
    
    // Filtra apenas eventos do dia de hoje para ESTE profissional
    let myEvents = events.filter(e => {
      const start = new Date(e.start);
      return e.profissional_id === profId &&
             start.getFullYear() === agora.getFullYear() &&
             start.getMonth() === agora.getMonth() &&
             start.getDate() === agora.getDate();
    });

    // Ordenar cronologicamente
    myEvents.sort((a,b) => a.start.localeCompare(b.start));
    
    this.todayAppointments = myEvents;
    this.totalAtendimentos = myEvents.filter(e => e.status !== 'cancelado').length;
    
    // Encontrar o próximo atendimento
    this.nextAppointment = myEvents.find(e => {
      const start = new Date(e.start);
      return start >= agora && (e.status === 'confirmado' || e.status === 'pendente');
    }) || null;

    // Estimativa usando o comissionamento real
    this.estimatedCommissions = myEvents.filter(e => e.status === 'concluido')
      .reduce((acc, curr) => acc + (curr.valor_total || 0) * this.commissionRate, 0);
  }

  showComandaModal = false;
  comandaFisicaInput = '';
  eventToConclude: AgendaEvent | null = null;

  concluirServico(event: AgendaEvent) {
    if (!event.id) return;
    this.eventToConclude = event;
    this.comandaFisicaInput = '';
    this.showComandaModal = true;
  }

  fecharModalComanda() {
    this.showComandaModal = false;
    this.eventToConclude = null;
    this.comandaFisicaInput = '';
  }

  async confirmarConclusao() {
    if (!this.eventToConclude?.id) return;
    try {
      const comanda = this.comandaFisicaInput;
      
      const changes: Partial<AgendaEvent> = { status: 'concluido' };
      if (comanda !== null && comanda.trim() !== '') {
        changes.comanda_fisica = comanda.trim();
      }

      await this.agendaService.updateEvent(this.eventToConclude.id, changes);
      
      this.notifService.showToast({
        type: 'SUCCESS',
        title: 'Serviço Concluído',
        message: 'Comanda enviada para o Caixa com sucesso!',
        icon: 'pi pi-check'
      });
      this.fecharModalComanda();
    } catch (e: any) {
      this.notifService.showToast({ type: 'WARNING', title: 'Erro', message: e.message });
    }
  }

  adicionarNaAgenda(event: AgendaEvent) {
    if (!event.start) return;
    
    const startDate = new Date(event.start);
    const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + 60 * 60000);

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${event.title} - ${this.myProfile?.nome || 'Atendimento'}`,
      `DESCRIPTION:Cliente: ${event.cliente_id ? 'Cadastrado' : 'Sem cadastro'} | Valor: R$ ${event.valor_total || 0}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atendimento_${startDate.getTime()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    this.notifService.showToast({
      type: 'SUCCESS',
      title: 'Agenda Local',
      message: 'Arquivo de calendário baixado.',
      icon: 'pi pi-calendar-plus'
    });
  }

  formatDateHour(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}
