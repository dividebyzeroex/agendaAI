import { Injectable, inject } from '@angular/core';
import { AgendaEventService, AgendaEvent } from './agenda-event.service';

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
      // Group by service title (first word)
      const serviceCount: Record<string, number> = {};
      events.forEach(e => {
        const key = e.title.split('-')[0].trim() || e.title;
        serviceCount[key] = (serviceCount[key] || 0) + 1;
      });
      const labels = Object.keys(serviceCount);
      const data = Object.values(serviceCount);
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

      return {
        message: `Você tem ${count} agendamento(s) registrado(s) no sistema.`,
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['Sem dados'],
          datasets: [{ label: 'Serviços', data: data.length ? data : [0], backgroundColor: colors.slice(0, labels.length || 1) }]
        }
      };
    }

    if (text.includes('lucro') || text.includes('faturamento') || text.includes('dinheiro') || text.includes('receita')) {
      // Simulate revenue based on event count (R$ 120 avg per appointment)
      const avgTicket = 120;
      const total = count * avgTicket;
      const pix = Math.round(total * 0.5);
      const card = Math.round(total * 0.35);
      const cash = Math.round(total * 0.15);

      return {
        message: `Faturamento projetado com base em ${count} agendamentos: R$ ${total.toLocaleString('pt-BR')},00.`,
        type: 'pie',
        data: {
          labels: ['Pix', 'Cartão', 'Dinheiro'],
          datasets: [{ data: [pix, card, cash], backgroundColor: ['#14b8a6', '#6366f1', '#f43f5e'] }]
        }
      };
    }

    if (text.includes('faltas') || text.includes('no-show') || text.includes('cancelamentos')) {
      return {
        message: `Com base nos dados atuais, ${Math.round(count * 0.1)} agendamentos têm risco de no-show. Os lembretes automáticos via SMS reduzem isso em 80%.`,
        type: 'text'
      };
    }

    return {
      message: `Encontrei ${count} agendamentos no sistema. Tente perguntas como: "Qual meu faturamento?", "Quantos agendamentos tenho?" ou "Quantas faltas registradas?".`,
      type: 'text'
    };
  }
}
