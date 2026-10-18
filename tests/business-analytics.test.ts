import { expect, it } from 'vitest';
import {
  activitySummary,
  receivedSummary,
  csvCell,
} from '../src/app/core/helpers/business-analytics';
it('groups by business timezone across UTC midnight and excludes cancellations and no-shows from heat', () => {
  const s = activitySummary([
    {
      start: '2026-10-13T01:30:00Z',
      status: 'concluido',
      cliente_id: 'a',
      profissional_id: 'p',
      profissional_nome: 'Ana',
    },
    {
      start: '2026-10-12T14:00:00Z',
      status: 'concluido',
      cliente_id: 'a',
      profissional_id: 'p',
      profissional_nome: 'Ana',
    },
    {
      start: '2026-10-12T15:00:00Z',
      status: 'noshow',
      profissional_id: 'p',
      profissional_nome: 'Ana',
    },
    {
      start: '2026-10-12T16:00:00Z',
      status: 'cancelado',
      profissional_id: 'p',
      profissional_nome: 'Ana',
    },
    { start: 'invalid', status: 'concluido' },
  ]);
  expect(s.heat.find((r) => r.hour === 22)?.counts).toEqual([1, 0, 0, 0, 0, 0, 0]);
  expect(s.heat.find((r) => r.hour === 12)?.counts[0]).toBe(0);
  expect(s.max).toBe(1);
  expect(s.scheduled).toBe(3);
  expect(s.completed).toBe(2);
  expect(s.returning).toBe(1);
  expect(s.clientsServed).toBe(1);
  expect(s.returnRate).toBe(100);
  expect(s.noShowRate).toBeCloseTo(100 / 3);
  expect(s.cancelled).toBe(1);
  expect(s.professionals[0]).toMatchObject({
    name: 'Ana',
    scheduled: 3,
    completed: 2,
    noShows: 1,
    cancelled: 1,
  });
});
it('does not divide by zero or count unidentified clients as returning', () => {
  const empty = activitySummary([]);
  expect(empty.heat).toEqual([]);
  expect(empty.returnRate).toBe(0);
  expect(empty.noShowRate).toBe(0);
  const s = activitySummary([
    { start: '2026-10-12T15:00:00Z', status: 'concluido' },
    { start: '2026-10-12T16:00:00Z', status: 'concluido' },
  ]);
  expect(s.completed).toBe(2);
  expect(s.clientsServed).toBe(0);
  expect(s.returning).toBe(0);
});
it('deducts partial refunds in cents without subtracting processing costs or losing manual payments', () => {
  expect(
    receivedSummary([
      { valor_total: '50.10', connect_orders: { refunded_cents: 1010 } },
      { valor_total: 25, connect_orders: null },
      { valor_total: '10', connect_orders: [{ refunded_cents: 1000 }] },
    ]),
  ).toEqual({ total: 65, ticket: 65 / 3, count: 3 });
  expect(receivedSummary([])).toEqual({ total: 0, ticket: 0, count: 0 });
});
it('escapes spreadsheet formulas, quotes and multiline cells', () => {
  expect(csvCell('=IMPORTXML("url")')).toBe('"\'=IMPORTXML(""url"")"');
  expect(csvCell(' \t+cmd')).toBe('"\' \t+cmd"');
  expect(csvCell('Ana\nSilva')).toBe('"Ana\nSilva"');
  expect(csvCell(12)).toBe('"12"');
});
