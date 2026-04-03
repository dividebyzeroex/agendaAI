import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AiInsightsService {
  private notifSvc = inject(NotificationService);

  private insights = [
    {
      title: 'IA: Alta Ocupação Amanhã',
      message: 'Sua agenda de amanhã atingiu 90% de ocupação. Deseja abrir um novo slot extra às 11h?',
      actionLabel: 'Abrir Slot'
    },
    {
      title: 'IA: Sugestão de Retenção',
      message: 'O cliente "João Silva" não agenda há 45 dias. Enviar um cupom de 10% para reengajamento?',
      actionLabel: 'Enviar Cupom'
    },
    {
      title: 'IA: Desempenho da Equipe',
      message: 'O profissional "Carlos" teve um aumento de 20% na produtividade esta semana. Excelente!',
      actionLabel: 'Ver Relatório'
    },
    {
      title: 'IA: Alerta de Conflito',
      message: 'Detectamos um possível conflito de horário na Terça-feira entre dois profissionais. Quer revisar?',
      actionLabel: 'Ver Conflito'
    }
  ];

  constructor() {
    // Inicia a "simulação" de insights após 15 segundos
    setTimeout(() => this.triggerRandomInsight(), 15000);
  }

  triggerRandomInsight() {
    const random = this.insights[Math.floor(Math.random() * this.insights.length)];
    
    this.notifSvc.addNotification({
      type: 'AI_INSIGHT',
      title: random.title,
      message: random.message,
      action: { label: random.actionLabel, command: () => console.log('Ação IA executada: ' + random.actionLabel) }
    });

    // Próximo insight entre 1 e 3 minutos para não ser irritante
    const nextTime = (Math.random() * 120000) + 60000;
    setTimeout(() => this.triggerRandomInsight(), nextTime);
  }

  generateInstantInsight(context: string) {
    this.notifSvc.addNotification({
      type: 'AI_INSIGHT',
      title: 'IA: Insight Imediato',
      message: `Baseado em ${context}, sugerimos otimizar a distribuição de serviços para maximizar a receita.`,
      action: { label: 'Otimizar Agora' }
    });
  }
}
