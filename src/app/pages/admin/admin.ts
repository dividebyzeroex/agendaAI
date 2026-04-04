import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ClienteService } from '../../services/cliente.service';
import { NotificationService } from '../../services/notification.service';
import { map, Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TableModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class Admin implements OnInit, OnDestroy {
  private agendaService = inject(AgendaEventService);
  private clienteService = inject(ClienteService);
  private notifService = inject(NotificationService);

  todayAppointments: AgendaEvent[] = [];
  noShowEvents: AgendaEvent[] = [];
  
  totalToday = 0;
  totalClientes = 0;
  revenue = 0;
  isLoading = true;
  aiSuggestions: any[] = [];
  
  private sub = new Subscription();

  ngOnInit() {
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
        this.totalClientes = uniquePhones.size;
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
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private processAppointments(events: AgendaEvent[]) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Todos de hoje
    this.todayAppointments = events.filter(e => e.start.startsWith(todayStr))
                                   .sort((a,b) => a.start.localeCompare(b.start));
    
    // Identificar No-Shows: Começaram há mais de 10 minutos (atraso) e ainda estão apenas 'confirmado'
    this.noShowEvents = this.todayAppointments.filter(e => {
        const startTime = new Date(e.start);
        const diffMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
        return (e.status === 'confirmado' || e.status === 'pendente') && diffMinutes >= 10;
    });

    this.totalToday = this.todayAppointments.length;
    this.revenue = this.todayAppointments.filter(e => e.status !== 'cancelado')
                                         .reduce((acc, curr) => acc + (curr.valor_total || 0), 0);
    this.isLoading = false;
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
}

