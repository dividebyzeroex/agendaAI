import { Injectable, inject } from '@angular/core';
import { AgendaEventService } from './agenda-event.service';

export interface QueryResult {
  message: string;
  type: 'text' | 'bar' | 'pie';
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class QueryEngineService {
  private agendaService = inject(AgendaEventService);

  processQuery(query: string): QueryResult {
    const text = query.toLowerCase();
    const events = this.agendaService.getEvents();
    const count = events.length;

    if (text.includes('quantos') || text.includes('volume') || text.includes('agendamentos')) {
      const serviceCount: Record<string, number> = {};
      events.forEach(e => {
        const key = e.title.split('-')[0].trim() || 'Serviço';
        serviceCount[key] = (serviceCount[key] || 0) + 1;
      });
      const labels = Object.keys(serviceCount);
      const data = Object.values(serviceCount);
      const colors = ['#4f46e5', '#9333ea', '#10b981', '#f59e0b', '#ef4444'];

      return {
        message: `Atualmente existem ${count} agendamentos na sua base de dados.`,
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['Sem dados'],
          datasets: [{ label: 'Agendamentos', data: data.length ? data : [0], backgroundColor: colors.slice(0, labels.length || 1) }]
        }
      };
    }

    if (text.includes('lucro') || text.includes('faturamento') || text.includes('dinheiro') || text.includes('receita')) {
      return { message: 'Consulte os recebimentos registrados no Caixa. Agendamentos não comprovam faturamento ou lucro.', type:'text' };
    }

    if (text.includes('faltas') || text.includes('no-show') || text.includes('cancelamentos')) {
      const canceled = events.filter(e => e.status === 'cancelado').length;
      const noshows = events.filter(e => e.status === 'noshow').length;
      return {
        message: `Identificamos ${noshows} no-shows e ${canceled} cancelamentos na sua base histórica.`,
        type: 'text'
      };
    }

    return {
      message: `Encontrei ${count} registros reais. Pergunte sobre faturamento, volume de serviços ou cancelamentos para uma análise profunda.`,
      type: 'text'
    };
  }
}
