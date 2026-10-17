import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const security = vi.hoisted(() => ({
  adminClient: vi.fn(),
  isUuid: (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v),
}));
vi.mock('../server/security.js', () => security);
import { businessPublic } from '../server/business-public';
const token = '10000000-0000-4000-8000-000000000001';
const response = () => ({
  statusCode: 200,
  body: null as any,
  setHeader: vi.fn(),
  status(n: number) {
    this.statusCode = n;
    return this;
  },
  json(v: any) {
    this.body = v;
    return this;
  },
});
let db: any, records: Record<string, any>, update: any;
beforeEach(() => {
  process.env['PUBLIC_BOOKING_RATE_SECRET'] = 'fixture-secret';
  records = {
    service_feedback: {
      estabelecimento_id: 'tenant',
      created_at: new Date().toISOString(),
      submitted_at: null,
    },
    estabelecimento: { nome: 'Espaço' },
    agenda_events: {
      id: 'event',
      estabelecimento_id: 'tenant',
      start: new Date(Date.now() + 600000).toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),
      status: 'confirmado',
      metadata: { origin: 'public_booking' },
    },
  };
  update = vi.fn();
  db = {
    rpc: vi.fn(async (name: string) => ({
      data: name === 'consume_public_booking_limit' ? true : { received: true },
    })),
    from: vi.fn((table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: records[table] }),
        update: (v: any) => {
          update(v);
          q.then = (resolve: any) => resolve({ data: [] });
          return q;
        },
      };
      return q;
    }),
  };
  security.adminClient.mockReturnValue(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['PUBLIC_BOOKING_RATE_SECRET'];
});
it('returns only business name and response status for a valid feedback token', async () => {
  const res = response();
  await businessPublic(
    { method: 'POST', query: { action: 'feedback-info' }, headers: {}, body: { token } } as any,
    res as any,
  );
  expect(res.body).toEqual({ name: 'Espaço', received: false });
  expect(res.body).not.toHaveProperty('estabelecimento_id');
});
it('rejects invalid scores before mutating feedback', async () => {
  const res = response();
  await businessPublic(
    {
      method: 'POST',
      query: { action: 'feedback-submit' },
      headers: {},
      body: { token, rating: 6 },
    } as any,
    res as any,
  );
  expect(res.statusCode).toBe(400);
  expect(db.rpc.mock.calls.some((c: any) => c[0] === 'submit_service_feedback')).toBe(false);
});
it('delegates feedback to the idempotent service-only RPC', async () => {
  const res = response();
  await businessPublic(
    {
      method: 'POST',
      query: { action: 'feedback-submit' },
      headers: {},
      body: { token, rating: 5, comment: ' Muito bom ' },
    } as any,
    res as any,
  );
  expect(db.rpc).toHaveBeenCalledWith('submit_service_feedback', {
    p_token: token,
    p_rating: 5,
    p_comment: 'Muito bom',
  });
  expect(res.body.received).toBe(true);
});
it('never starts a pending request or discloses its contact through check-in', async () => {
  records.agenda_events.status = 'pendente';
  const res = response();
  await businessPublic(
    { method: 'POST', query: { action: 'checkin' }, headers: {}, body: { token } } as any,
    res as any,
  );
  expect(res.statusCode).toBe(409);
  expect(update).not.toHaveBeenCalled();
});
it('records arrival without changing service status or removing existing metadata', async () => {
  const res = response();
  await businessPublic(
    { method: 'POST', query: { action: 'checkin' }, headers: {}, body: { token } } as any,
    res as any,
  );
  expect(update.mock.calls[0][0].metadata).toMatchObject({
    origin: 'public_booking',
    checked_in_at: expect.any(String),
  });
  expect(update.mock.calls[0][0]).not.toHaveProperty('status');
  expect(res.body).toEqual({ received: true });
});
it('suppresses requests at the public rate limit', async () => {
  db.rpc.mockResolvedValue({ data: false });
  const res = response();
  await businessPublic(
    { method: 'POST', query: { action: 'feedback-info' }, headers: {}, body: { token } } as any,
    res as any,
  );
  expect(res.statusCode).toBe(429);
  expect(db.from).not.toHaveBeenCalled();
});
it('revokes campaign contact via the server-only token function', async () => {
  const res = response();
  await businessPublic(
    { method: 'POST', query: { action: 'unsubscribe' }, headers: {}, body: { token } } as any,
    res as any,
  );
  expect(db.rpc).toHaveBeenCalledWith('unsubscribe_campaign', { p_token: token });
  expect(res.body.received).toBe(true);
});
