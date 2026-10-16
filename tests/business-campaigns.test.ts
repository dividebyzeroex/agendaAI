import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { runCustomerCampaigns } from '../server/business-campaigns';
let tables: Record<string, any[]>;
function fixture() {
  return {
    from: (name: string) => {
      let filters: ((r: any) => boolean)[] = [],
        patch: any = null,
        limit = Infinity;
      const read = () => {
        const rows = (tables[name] || [])
          .filter((r) => filters.every((fn) => fn(r)))
          .slice(0, limit);
        if (patch) for (const r of rows) Object.assign(r, patch);
        return rows;
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        lte: (k: string, v: any) => {
          filters.push((r) => r[k] <= v);
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          limit = n;
          return q;
        },
        update: (v: any) => {
          patch = v;
          return q;
        },
        maybeSingle: async () => ({ data: read()[0] || null, error: null }),
        then: (ok: any) => Promise.resolve({ data: read(), error: null }).then(ok),
      };
      return q;
    },
  };
}
beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_fixture');
  vi.stubEnv('RESEND_FROM_EMAIL', 'fixture@example.test');
  vi.stubEnv('PROJECT_URL', 'https://example.test');
  tables = {
    client_campaigns: [
      {
        id: 'c',
        estabelecimento_id: 't',
        status: 'scheduled',
        channel: 'email',
        due_at: '2020-01-01',
        title: 'Sua próxima visita',
        message: '<script> teste',
      },
    ],
    estabelecimento: [{ id: 't', active: true, trial_ends_at: '2099-01-01', nome: 'Studio' }],
    campaign_recipients: [
      { id: 'r', token: 'random-token', campaign_id: 'c', cliente_id: 'client', status: 'pending' },
    ],
    client_contact_preferences: [
      { estabelecimento_id: 't', cliente_id: 'client', channel: 'email', consent: true },
    ],
    clientes: [{ id: 'client', estabelecimento_id: 't', email: 'client@example.test' }],
  };
});
afterEach(() => vi.unstubAllEnvs());
it('sends only an explicitly scheduled campaign, escapes content and uses durable recipient identity', async () => {
  const send = vi.fn().mockResolvedValue({ data: { id: 'provider' } });
  const result = await runCustomerCampaigns({ db: fixture(), send });
  expect(result.sent).toBe(1);
  expect(tables.campaign_recipients[0]).toMatchObject({ status: 'sent', provider_id: 'provider' });
  expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;');
  expect(send.mock.calls[0][0].html).toContain('/preferencias/random-token');
  expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'customer-campaign:r' });
  await runCustomerCampaigns({ db: fixture(), send });
  expect(send).toHaveBeenCalledTimes(1);
});
it('does not send prepared drafts before owner schedules them', async () => {
  tables.client_campaigns[0].status = 'ready';
  const send = vi.fn();
  await runCustomerCampaigns({ db: fixture(), send });
  expect(send).not.toHaveBeenCalled();
});
it('checks latest preference before claiming or sending', async () => {
  tables.client_contact_preferences[0].consent = false;
  const send = vi.fn();
  await runCustomerCampaigns({ db: fixture(), send });
  expect(send).not.toHaveBeenCalled();
  expect(tables.campaign_recipients[0].status).toBe('suppressed');
});
it('never retries an uncertain send automatically', async () => {
  const send = vi.fn().mockRejectedValue(Error('timeout'));
  await runCustomerCampaigns({ db: fixture(), send });
  await runCustomerCampaigns({ db: fixture(), send });
  expect(send).toHaveBeenCalledTimes(1);
  expect(tables.campaign_recipients[0].status).toBe('failed');
});
it('leaves blocked or expired establishments unsent', async () => {
  tables.estabelecimento[0].active = false;
  const send = vi.fn();
  await runCustomerCampaigns({ db: fixture(), send });
  expect(send).not.toHaveBeenCalled();
  expect(tables.campaign_recipients[0].status).toBe('pending');
});
