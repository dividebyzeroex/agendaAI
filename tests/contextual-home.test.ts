import { describe, expect, it } from 'vitest';
import { buildHomeContext, replyToHomeQuery } from '../src/app/core/contextual-home';
import type { AgendaEvent } from '../src/app/services/agenda-event.service';

const now = new Date(2026, 9, 27, 14, 0, 0);
const at = (hour: number, minute = 0) => new Date(2026, 9, 27, hour, minute).toISOString();
const event = (id: string, start: string, status: AgendaEvent['status'], valor_total = 0): AgendaEvent => ({
  id, title: 'Atendimento ' + id, start, end: start, status, valor_total,
});

describe('home contextual', () => {
  it('prioriza horários atrasados e não conta cancelados ou faltas como receita prevista', () => {
    const events = [
      event('late', at(13, 30), 'confirmado', 70),
      event('upcoming', at(17), 'pendente', 90),
      event('done', at(11), 'concluido', 60),
      event('cancel', at(16), 'cancelado', 150),
      event('noshow', at(10), 'noshow', 30),
    ];
    const result = buildHomeContext(events, [{ nome: 'Ana' }], now);
    expect(result.totalToday).toBe(4);
    expect(result.late.map((item) => item.id)).toEqual(['late']);
    expect(result.upcoming.map((item) => item.id)).toEqual(['upcoming']);
    expect(result.completed).toBe(1);
    expect(result.bookedMonthValue).toBe(220);
    expect(result.clients).toBe(1);
    expect(result.insights[0].id).toBe('late');
  });

  it('usa uma chamada para agendar quando não há atendimentos no dia', () => {
    const result = buildHomeContext([event('old', new Date(2026, 8, 4).toISOString(), 'concluido')], [], now);
    expect(result.totalToday).toBe(0);
    expect(result.insights[0].id).toBe('empty');
    expect(result.insights[0].action.route).toBe('/admin/agenda/novo');
  });

  it('oferece revisão manual para agendamento, sem criar evento silenciosamente', () => {
    const result = replyToHomeQuery('Quero agendar uma cliente', buildHomeContext([], [], now), 'dono');
    expect(result.action?.route).toBe('/admin/agenda/novo');
    expect(result.message).toContain('confirmação');
  });

  it('não confunde valores agendados com pagamentos recebidos', () => {
    const ctx = buildHomeContext([event('visit', at(12), 'concluido', 97)], [], now);
    const result = replyToHomeQuery('Qual foi meu faturamento?', ctx, 'dono');
    expect(result.message).toContain('não significa dinheiro recebido');
    expect(result.action?.route).toBe('/admin/analytics');
  });

  it('não oferece navegação para clientes a perfis sem a função de dono', () => {
    const ctx = buildHomeContext([], [{ nome: 'Ana' }], now);
    const result = replyToHomeQuery('Me mostre os clientes', ctx, 'financeiro');
    expect(result.action).toBeUndefined();
    expect(result.message).toContain('permissões');
  });
});
