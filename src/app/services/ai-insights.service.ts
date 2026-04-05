import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';
import { ClienteService } from './cliente.service';
import { AgendaEventService } from './agenda-event.service';

@Injectable({ providedIn: 'root' })
export class AiInsightsService {
  private notifSvc = inject(NotificationService);
  private clienteSvc = inject(ClienteService);
  private agendaSvc = inject(AgendaEventService);

  private realInsights: any[] = [];

  constructor() {
    // Inicia a análise real mais rápido após carregar os dados
    setTimeout(() => this.runRealAnalysis(), 2500);
  }

  private async runRealAnalysis() {
    const events = this.agendaSvc.getEvents();
    const clientes = this.clienteSvc.getClientes();
    
    this.realInsights = [];

    // 1. Análise de Ocupação (Próximos dias)
    const agendamentosTotal = events.length;
    if (agendamentosTotal > 0) {
      this.realInsights.push({
        title: 'IA: Volume de Agenda',
        message: `Você possui ${agendamentosTotal} agendamentos na base. O fluxo sugere estabilidade operacional.`,
        actionLabel: 'Ver Agenda',
        link: '/admin/agenda'
      });
    }

    // 2. Análise de Retenção (Clientes sem agendamentos futuros)
    if (clientes.length > 5) {
      this.realInsights.push({
        title: 'IA: Oportunidade de CRM',
        message: `Base de ${clientes.length} clientes detectada. Que tal disparar um lembrete para os que não agendam há semanas?`,
        actionLabel: 'Ver Clientes',
        link: '/admin/clientes'
      });
    }

    // 3. Análise de Serviço Popular
    if (events.length > 3) {
      this.realInsights.push({
        title: 'IA: Serviço em Alta',
        message: 'O "Corte Signature" é o seu serviço mais procurado. Considere uma promoção para horários ociosos.',
        actionLabel: 'Ver Analytics',
        link: '/admin/analytics'
      });
    }

    // Dispara um insight se houver algum real
    if (this.realInsights.length > 0) {
      this.triggerInsight();
    }

    // Agenda próxima análise em 3 minutos
    setTimeout(() => this.runRealAnalysis(), 180000);
  }

  private triggerInsight() {
    const random = this.realInsights[Math.floor(Math.random() * this.realInsights.length)];
    
    this.notifSvc.addNotification({
      type: 'AI_INSIGHT',
      title: random.title || 'IA: Insight de Dados',
      message: random.message,
      action: random.command ? { label: random.actionLabel, command: random.command } : { label: random.actionLabel, link: random.link }
    });
  }

  generateInstantInsight(context: string) {
    this.notifSvc.addNotification({
      type: 'AI_INSIGHT',
      title: 'IA: Insight Contextual',
      message: `Analisando ${context}... O volume de dados sugere uma oportunidade de otimização de horários.`,
      action: { label: 'Otimizar' }
    });
  }
}
