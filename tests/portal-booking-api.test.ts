import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const f = vi.hoisted(() => ({
  db: null as any,
  identity: null as any,
  calls: [] as any[],
  percent: 20,
}));
vi.mock('../server/security.js', async () => ({
  ...(await vi.importActual<any>('../server/security.js')),
  adminClient: () => f.db,
}));
vi.mock('../server/billing.js', async () => ({
  ...(await vi.importActual<any>('../server/billing.js')),
  billingClients: () => ({ db: f.db, stripe: {} }),
}));
vi.mock('../server/growth-payments.js', () => ({
  assertCollectionAccount: vi.fn().mockResolvedValue({}),
  depositReservationResponse: vi.fn(async (_db: any, _stripe: any, r: any) => ({
    success: true,
    deposit_token: r.deposit_token,
    event: r.event,
  })),
}));
import handler from '../api/public-booking';
const id = (n: number) => `${n}0000000-0000-4000-8000-000000000001`;
function request() {
  const d = new Date(Date.now() + 3 * 86400000);
  d.setUTCHours(12, 0, 0, 0);
  return {
    method: 'POST',
    headers: {},
    query: {},
    body: {
      estabelecimento_id: id(2),
      servico_id: id(3),
      profissional_id: id(4),
      start: d.toISOString(),
      end: new Date(d.getTime() + 1800000).toISOString(),
      portal_token: id(7),
      reservation_key: id(8),
    },
  } as any;
}
const res = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
});
beforeEach(() => {
  vi.stubEnv('PUBLIC_BOOKING_RATE_SECRET', 'fixture');
  f.calls = [];
  f.percent = 20;
  f.identity = { tenant: id(2), customer: id(5), name: 'Private customer', phone: '' };
  f.db = {
    rpc: vi.fn(async (name: string, args: any) => {
      f.calls.push({ name, args });
      return {
        data:
          name === 'consume_public_booking_limit'
            ? true
            : name === 'portal_identity'
              ? f.identity
              : name === 'reserve_with_deposit'
                ? { deposit_token: id(9), event: { id: id(6), status: 'pendente' } }
                : name === 'portal_reserve'
                  ? { event: { id: id(6), status: 'confirmado' }, prepaid: true }
                  : null,
        error: null,
      };
    }),
    from: (table: string) => {
      f.calls.push({ table });
      let select = '';
      const data = () =>
        table === 'estabelecimento'
          ? { active: true, slug: 'fixture', trial_ends_at: '2099-01-01' }
          : table === 'servicos'
            ? { titulo: 'Corte', duracao_min: 30, preco: 45 }
            : table === 'profissionais'
              ? [{ id: id(4) }]
              : table === 'profissional_servicos'
                ? select === 'servico_id'
                  ? [{ servico_id: id(3) }]
                  : null
                : table === 'horarios_funcionamento'
                  ? { abre: '09:00', fecha: '18:00' }
                  : table === 'profissional_disponibilidades'
                    ? { ativo: true, hora_inicio: '09:00', hora_fim: '18:00' }
                    : table === 'business_settings'
                      ? { approval_required: false, deposit_percent: f.percent }
                      : table === 'agenda_events'
                        ? []
                        : table === 'booking_deposits' || table === 'portal_requests'
                          ? null
                          : null;
      const q: any = {
        select: (s: string) => {
          select = s;
          return q;
        },
        eq: () => q,
        neq: () => q,
        lt: () => q,
        gt: () => q,
        or: () => q,
        limit: () => q,
        single: async () => ({ data: data(), error: null }),
        maybeSingle: async () => ({ data: data(), error: null }),
        then: (ok: any) => Promise.resolve({ data: data(), error: null }).then(ok),
      };
      return q;
    },
  };
});
afterEach(() => vi.unstubAllEnvs());
it('uses the proven portal customer without requiring phone re-entry and charges the normal deposit when no pass is selected', async () => {
  const r = res();
  await handler(request(), r as any);
  expect(r.status).toHaveBeenCalledWith(201);
  expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ deposit_token: id(9) }));
  const reserve = f.calls.find((c) => c.name === 'reserve_with_deposit');
  expect(reserve.args.p_data.cliente_id).toBe(id(5));
  expect(reserve.args.p_data.title).toContain('Private customer');
  expect(f.calls.some((c) => c.table === 'clientes')).toBe(false);
  expect(f.calls.some((c) => c.name === 'portal_reserve')).toBe(false);
});
it('reserves the authenticated pass without initiating a new deposit', async () => {
  const req = request();
  req.body.pass_id = id(9);
  const r = res();
  await handler(req, r as any);
  expect(r.status).toHaveBeenCalledWith(201);
  expect(f.calls.find((c) => c.name === 'portal_reserve').args).toEqual(
    expect.objectContaining({ p_token: id(7), p_pass: id(9), p_key: id(8) }),
  );
  expect(f.calls.some((c) => c.name === 'reserve_with_deposit')).toBe(false);
});
it('does not let an invalid or cross-tenant portal capability bypass customer identity', async () => {
  f.identity = { ...f.identity, tenant: id(9) };
  const r = res();
  await handler(request(), r as any);
  expect(r.status).toHaveBeenCalledWith(403);
  expect(f.calls.some((c) => ['portal_reserve', 'reserve_with_deposit'].includes(c.name))).toBe(
    false,
  );
});
