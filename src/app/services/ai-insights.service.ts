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
    // Inicia a análise real após carregar os dados iniciais
    setTimeout(() => this.runRealAnalysis(), 8000);
  }

  private async runRealAnalysis() {
    const events = this.agendaSvc.getEvents();
    const clientes = this.clienteSvc.getClientes();
    
    this.realInsights = [];

    // 1. Análise de Ocupação (Amanhã)
    const amanhã = new Date();
    amanhã.setDate(amanhã.getDate() + 1);
    const amanhãStr = amanhã.toISOString().split('T')[0];
    const agendamentosAmanhã = events.filter(e => e.start.startsWith(amanhãStr)).length;

    if (agendamentosAmanhã >= 4) {
      this.realInsights.push({
        title: 'IA: Alta Demanda Amanhã',
        message: `Sua agenda de amanhã já possui ${agendamentosAmanhã} compromissos. Deseja organizar os intervalos?`,
        actionLabel: 'Ver Agenda',
        link: '/admin/agenda'
      });
    }

    // 2. Análise de Retenção (Clientes sumidos > 30 dias)
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    
    const clientesSumidos = clientes.filter(c => {
      if (!c.ultima_visita) return false;
      const ultima = new Date(c.ultima_visita);
      return ultima < trintaDiasAtras;
    });

    if (clientesSumidos.length > 0) {
      const c = clientesSumidos[0];
      this.realInsights.push({
        title: 'IA: Sugestão de Retenção',
        message: `O cliente "${c.nome}" não agenda há mais de 30 dias. Que tal enviar um convite?`,
        actionLabel: 'Enviar Whats',
        command: () => window.open(`https://wa.me/${c.telefone}`, '_blank')
      });
    }

    // 3. Análise de Performance Diária
    const hojeStr = new Date().toISOString().split('T')[0];
    const agendamentosHoje = events.filter(e => e.start.startsWith(hojeStr)).length;
    if (agendamentosHoje > 5) {
      this.realInsights.push({
        title: 'IA: Desempenho em Alta',
        message: `Hoje está sendo um dia produtivo com ${agendamentosHoje} atendimentos. Parabéns!`,
        actionLabel: 'Ver Analytics',
        link: '/admin/analytics'
      });
    }

    // Dispara um insight se houver algum real
    if (this.realInsights.length > 0) {
      this.triggerInsight();
    }

    // Agenda próxima análise em 5 minutos
    setTimeout(() => this.runRealAnalysis(), 300000);
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
