import { Component, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivationSummaryComponent } from '../../components/activation-summary/activation-summary';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ClienteService } from '../../services/cliente.service';
import { NotificationService } from '../../services/notification.service';
import { MultiAgentService } from '../../services/multi-agent.service';
import { AuthService } from '../../services/auth.service';
import { ParticleCanvasComponent } from '../../components/particle-canvas/particle-canvas.component';
import { PortalProfissionalComponent } from '../../components/portal-profissional/portal-profissional';
import { BehaviorSubject, map, Subscription, interval, Observable } from 'rxjs';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink, PortalProfissionalComponent, ActivationSummaryComponent],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class Admin implements OnInit, OnDestroy {
  private cdr=inject(ChangeDetectorRef);
  agendaService = inject(AgendaEventService);
  private clienteService = inject(ClienteService);
  private notifService = inject(NotificationService);

  private authService = inject(AuthService);
  private router = inject(Router);

  userProfile$ = this.authService.profile$ as Observable<{nome: string, role: string} | null>;

  todayAppointments: AgendaEvent[] = [];
  noShowEvents: AgendaEvent[] = [];

  agentActivity$ = new BehaviorSubject<any[]>([]);

  totalToday = 0;
  totalClientes = 0;
  revenue = 0;
  concurrentCount = 0;
  waitlistCount = 0;
  isLoading = true;
  aiSuggestions: any[] = [];
  saudacao = '';
  aniversariantes: any[] = [];

  private sub = new Subscription();

  ngOnInit() {
    this.updateSaudacao();
    // 1. Escuta agendamentos e filtra No-Shows
    this.sub.add(
      this.agendaService.events$.subscribe(events => {
        this.processAppointments(events);
      })
    );

    // 2. Atualiza No-Shows a cada 1 minuto para tempo real
    this.sub.add(
      interval(60000).subscribe(() => {
        this.processAppointments(this.agendaService.getEvents());
      })
    );

    // 3. Escuta clientes para o dashboard
    this.sub.add(
      this.clienteService.clientes$.subscribe(clientes => {
        const uniquePhones = new Set(clientes.filter(c => c.telefone).map(c => c.telefone));
        this.totalClientes = clientes.length;this.cdr.markForCheck();
      })
    );

    // 4. Feed de IA
    this.sub.add(
      this.notifService.notifications$.pipe(
        map(notifs => notifs.filter(n => n.type === 'AI_INSIGHT').slice(0, 3))
      ).subscribe(ins => {
        this.aiSuggestions = ins.map(i => ({
          title: i.title,
          message: i.message,
          actionLabel: i.action?.label || 'Agir agora',
          command: i.action?.command || (() => {})
        }));
      })
    );

    // 5. Busca aniversariantes do mês
    this.carregarAniversariantes();
  }

  async carregarAniversariantes() {
    try{this.aniversariantes=await this.clienteService.getAniversariantesDoMes();}catch{this.aniversariantes=[];}this.cdr.markForCheck();
  }


  get isAdminOrFin(): Observable<boolean> {
    return this.userProfile$.pipe(map(p => p?.role === 'dono' || p?.role === 'financeiro'));
  }

  readonly isOwner = this.userProfile$.pipe(map(p => p?.role === 'dono'));
  get activeToday(){return this.todayAppointments.filter(e=>e.status!=='cancelado');}
  get inProgress(){return this.activeToday.filter(e=>e.status==='em_atendimento').length;}
  get completedToday(){return this.activeToday.filter(e=>e.status==='concluido').length;}
  isLate(e:AgendaEvent){return this.noShowEvents.some(item=>item.id===e.id);}
  statusLabel(s?:string){return ({confirmado:'Agendado',pendente:'Pendente',em_atendimento:'Em atendimento',concluido:'Concluído',noshow:'Não compareceu',cancelado:'Cancelado'} as Record<string,string>)[s||'']||'Agendado';}
  get isStaff(): Observable<boolean> {
    return this.userProfile$.pipe(map(p => p?.role === 'esteticista' || p?.role === 'barbeiro'));
  }

  updateSaudacao() {
    const hora = new Date().getHours();
    let prefix = 'Boa noite';
    if (hora >= 5 && hora < 12) prefix = 'Bom dia';
    else if (hora >= 12 && hora < 18) prefix = 'Boa tarde';

    this.sub.add(
      this.userProfile$.subscribe(p => {
        if (p?.nome) {
          const primeiroNome = p.nome.split(' ')[0];
          this.saudacao = `${prefix}, ${primeiroNome}!`;
        } else {
          this.saudacao = `${prefix}!`;
        }
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private processAppointments(events: AgendaEvent[]) {
    const agora = new Date();

    // 🔗 Filtro de Autoridade: Apenas agendamentos do dia local (Soberania de Fuso)
    this.todayAppointments = events.filter(e => {
        const start = new Date(e.start);
        return start.getFullYear() === agora.getFullYear() &&
               start.getMonth() === agora.getMonth() &&
               start.getDate() === agora.getDate();
    }).sort((a,b) => a.start.localeCompare(b.start));

    // Identificar No-Shows: Começaram há mais de 10 minutos (atraso) e ainda estão apenas 'confirmado'
    this.noShowEvents = this.todayAppointments.filter(e => {
        const startTime = new Date(e.start);
        const diffMinutes = (agora.getTime() - startTime.getTime()) / (1000 * 60);
        return (e.status === 'confirmado' || e.status === 'pendente') && diffMinutes >= 10;
    });

    this.totalToday = this.todayAppointments.length;

    // Faturamento: Soma de todos os agendamentos que não foram cancelados
    this.revenue = events.filter(e => {
        // Faturamento do mês corrente
        const start = new Date(e.start);
        return start.getMonth() === agora.getMonth() &&
               start.getFullYear() === agora.getFullYear() &&
               e.status !== 'cancelado';
    }).reduce((acc, curr) => acc + (curr.valor_total || 0), 0);

    // Atendimentos simultâneos (acontecendo agora)
    this.concurrentCount = this.todayAppointments.filter(e => {
        const start = new Date(e.start);
        const end = e.end ? new Date(e.end) : new Date(start.getTime() + 30*60000);
        return agora >= start && agora <= end && e.status !== 'cancelado';
    }).length;

    // Fila de Espera (Walk-in ou Pendentes de Hoje)
    this.waitlistCount = this.todayAppointments.filter(e => e.status === 'pendente' || e.status === 'confirmado').length;

    this.isLoading = false;this.cdr.markForCheck();
  }

  async marcarFalta(event: AgendaEvent) {
    if (!event.id) return;

    try {
        // 1. Atualiza status para 'noshow'
        await this.agendaService.updateStatus(event.id, 'noshow');

        // 2. Registra falta no perfil do cliente se houver cliente_id
        if (event.cliente_id) {
          const cliente = this.clienteService.getClientes().find(c => c.id === event.cliente_id);
          if (cliente) {
            await this.clienteService.registrarFalta(cliente.id!, cliente.faltas || 0);
          }
        }

        this.notifService.showToast({
            type: 'WARNING',
            title: 'No-Show Registrado',
            message: `O horário de ${event.title} foi liberado e a falta foi contabilizada.`,
            icon: 'pi pi-user-minus'
        });
    } catch (e: any) {
        this.notifService.showToast({ type: 'WARNING', title: 'Erro', message: e.message });
    }
  }

  calculateAtraso(start: string): string {
    try {
      const startTime = new Date(start);
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
      return diff > 0 ? `${diff} min` : '0 min';
    } catch {
      return '—';
    }
  }

  abrirAgenda() {
    this.router.navigate(['/admin/agenda']);
  }
}
