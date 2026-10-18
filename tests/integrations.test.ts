import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  seal,
  unseal,
  safeFiscalUrl,
  fiscalPatch,
  fiscalAction,
  integrationsHandler,
} from '../server/integrations';
import {
  validMetaSignature,
  deliveryAdvance,
  whatsappPhone,
  runWhatsApp,
} from '../server/whatsapp';
import { ensureSession } from '../server/connect';
const tenant = '20000000-0000-4000-8000-000000000001',
  receipt = '30000000-0000-4000-8000-000000000001';
let tables: Record<string, any[]>;
function memory() {
  return {
    rpc: vi.fn(async () => ({ data: { fiscal_token: seal('test-provider-token') }, error: null })),
    from: (name: string) => {
      let filters: ((x: any) => boolean)[] = [],
        patch: any = null,
        upsert: any = null,
        ignore = false;
      const read = () => {
        let rows = (tables[name] || []).filter((x) => filters.every((f) => f(x)));
        if (upsert) {
          tables[name] ||= [];
          const old = tables[name].find(
            (x) =>
              x.receipt_id === upsert.receipt_id &&
              x.kind === upsert.kind &&
              x.environment === upsert.environment,
          );
          if (!old) {
            tables[name].push({ id: 'doc', status: 'draft', ...upsert });
            rows = [tables[name].at(-1)];
          } else rows = [old];
        }
        if (patch) rows.forEach((x) => Object.assign(x, patch));
        return rows;
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((x) => x[k] === v);
          return q;
        },
        in: (k: string, v: any[]) => {
          filters.push((x) => v.includes(x[k]));
          return q;
        },
        lt: () => q,
        order: () => q,
        limit: () => q,
        update: (p: any) => {
          patch = p;
          return q;
        },
        upsert: (p: any, o: any) => {
          upsert = p;
          ignore = !!o?.ignoreDuplicates;
          return q;
        },
        single: async () => ({ data: read()[0], error: null }),
        maybeSingle: async () => ({ data: read()[0] || null, error: null }),
        then: (f: any) => Promise.resolve({ data: read(), error: null }).then(f),
      };
      return q;
    },
  };
}
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() });
beforeEach(() => {
  vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', 'test-encryption-fixture-no-real-secret');
  tables = {
    tenant_integrations: [
      {
        estabelecimento_id: tenant,
        fiscal_enabled: true,
        fiscal_environment: 'homologation',
        fiscal_kind: 'nfse',
        fiscal_cnpj: '12345678000199',
        fiscal_profile: {
          municipality: '3550308',
          registration: '12345',
          serviceCode: '6.01',
          issRate: 2,
          simple: true,
        },
      },
    ],
    caixa_itens: [
      {
        id: receipt,
        estabelecimento_id: tenant,
        cliente_nome: 'Fixture customer',
        valor_total: 45,
        status_caixa: 'pago',
        servicos: [{ titulo: 'Corte' }],
      },
    ],
    caixa_produtos: [],
    fiscal_documents: [],
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('encrypts per-tenant credentials with authenticated ciphertext and fails closed on tampering or missing key', () => {
  const encrypted = seal('secret-fixture');
  expect(encrypted).not.toContain('secret-fixture');
  expect(unseal(encrypted)).toBe('secret-fixture');
  expect(seal('secret-fixture')).not.toBe(encrypted);
  const parts = encrypted.split('.');
  parts[1] = Buffer.alloc(16).toString('base64url');
  expect(() => unseal(parts.join('.'))).toThrow();
  vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', '');
  expect(() => seal('x')).toThrow();
});
it('rejects unsigned or modified Meta payloads and never downgrades a read delivery', () => {
  const body = Buffer.from('{"entry":[]}'),
    sig = 'sha256=' + createHmac('sha256', 'fixture').update(body).digest('hex');
  expect(validMetaSignature(body, sig, 'fixture')).toBe(true);
  expect(validMetaSignature(Buffer.from('{}'), sig, 'fixture')).toBe(false);
  expect(validMetaSignature(body, 'bad', 'fixture')).toBe(false);
  expect(deliveryAdvance('read', 'sent')).toBe(false);
  expect(deliveryAdvance('delivered', 'failed')).toBe(false);
  expect(deliveryAdvance('sent', 'delivered')).toBe(true);
  expect(whatsappPhone('(11) 99999-1234')).toBe('5511999991234');
  expect(whatsappPhone('123')).toBe(null);
});
it('does not trust arbitrary provider document URLs or mark processing as authorized', () => {
  expect(safeFiscalUrl('https://evil.test/note', 'production')).toBe(null);
  expect(safeFiscalUrl('javascript:alert(1)', 'production')).toBe(null);
  expect(safeFiscalUrl('/files/note.pdf', 'homologation')).toBe(
    'https://homologacao.focusnfe.com.br/files/note.pdf',
  );
  expect(fiscalPatch({ status: 'processando_autorizacao' }, 'production').status).toBe(
    'processing',
  );
  expect(fiscalPatch({ status: 'autorizado' }, 'production').status).toBe('authorized');
});
it('requires authentication before integration configuration and never calls a provider', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const r = res();
  await integrationsHandler(
    {
      method: 'POST',
      query: { action: 'integration-save' },
      headers: {},
      body: { estabelecimentoId: tenant },
    } as any,
    r as any,
  );
  expect(r.status).toHaveBeenCalledWith(401);
  expect(fetch).not.toHaveBeenCalled();
});
it('builds a fiscal draft from the paid server receipt, keeps one reference, and rejects mixed product/service notes', async () => {
  const db = memory(),
    r = res(),
    req: any = { body: { receipt, customerDocument: '12345678901' } };
  await fiscalAction(req, r, db, tenant, 'fiscal-draft');
  expect(tables.fiscal_documents).toHaveLength(1);
  expect(tables.fiscal_documents[0].payload.servico.valor_servicos).toBe(45);
  expect(tables.fiscal_documents[0].environment).toBe('homologation');
  await fiscalAction(req, r, db, tenant, 'fiscal-draft');
  expect(tables.fiscal_documents).toHaveLength(1);
  tables.caixa_produtos = [{ caixa_item_id: receipt, quantidade: 1, valor_unitario: 5 }];
  await expect(fiscalAction(req, r, db, tenant, 'fiscal-draft')).rejects.toThrow(
    'Separe serviços e produtos',
  );
});
it('sends once with the original document environment and queries authorization without reissuing', async () => {
  const db = memory(),
    r = res();
  await fiscalAction(
    { body: { receipt, customerDocument: '12345678901' } } as any,
    r,
    db,
    tenant,
    'fiscal-draft',
  );
  tables.tenant_integrations[0].fiscal_environment = 'production';
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ status: 'processando_autorizacao' }),
    });
  vi.stubGlobal('fetch', fetch);
  await fiscalAction(
    { body: { document: 'doc', confirmed: true } } as any,
    r,
    db,
    tenant,
    'fiscal-send',
  );
  expect(fetch.mock.calls[0][0]).toBe('https://homologacao.focusnfe.com.br/v2/nfse?ref=doc');
  expect(tables.fiscal_documents[0].status).toBe('processing');
  await expect(
    fiscalAction(
      { body: { document: 'doc', confirmed: true } } as any,
      r,
      db,
      tenant,
      'fiscal-send',
    ),
  ).rejects.toThrow('já enviado');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'autorizado', url_danfse: '/notes/fixture.pdf' }),
  });
  await fiscalAction({ body: { document: 'doc' } } as any, r, db, tenant, 'fiscal-sync');
  expect(fetch.mock.calls[1][1].method).toBe('GET');
  expect(tables.fiscal_documents[0].status).toBe('authorized');
});
it('keeps an uncertain submission for review, with no automatic resubmission', async () => {
  const db = memory(),
    r = res();
  await fiscalAction(
    { body: { receipt, customerDocument: '12345678901' } } as any,
    r,
    db,
    tenant,
    'fiscal-draft',
  );
  const fetch = vi.fn().mockRejectedValue(Error('Timeout'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    fiscalAction(
      { body: { document: 'doc', confirmed: true } } as any,
      r,
      db,
      tenant,
      'fiscal-send',
    ),
  ).rejects.toThrow('Envio sem confirmação');
  expect(tables.fiscal_documents[0].status).toBe('review');
  await expect(
    fiscalAction(
      { body: { document: 'doc', confirmed: true } } as any,
      r,
      db,
      tenant,
      'fiscal-send',
    ),
  ).rejects.toThrow('já enviado');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('offers Pix only on a live eligible connected account and scopes the charge and fixed fee to that account', async () => {
  const db = memory();
  tables.tenant_integrations[0].pix_enabled = true;
  tables.connect_orders = [{ id: 'order' }];
  vi.stubEnv('PROJECT_URL', 'https://example.test');
  const create = vi
      .fn()
      .mockResolvedValue({ id: 'cs_fixture', url: 'https://checkout.stripe.com/fixture' }),
    account = vi
      .fn()
      .mockResolvedValue({ charges_enabled: true, capabilities: { pix_payments: 'active' } });
  const stripe: any = { accounts: { retrieve: account }, checkout: { sessions: { create } } };
  const order = {
    id: 'order',
    estabelecimento_id: tenant,
    account_id: 'acct_fixture',
    created_at: new Date().toISOString(),
    fee_cents: 100,
    amount_cents: 4500,
  };
  await ensureSession(stripe, db as any, order, 'receipt-token');
  expect(create.mock.calls[0][0].payment_method_types).toEqual(['card', 'pix']);
  expect(create.mock.calls[0][0].payment_intent_data.application_fee_amount).toBe(100);
  expect(create.mock.calls[0][1].stripeAccount).toBe('acct_fixture');
  account.mockRejectedValue(Error('Permission denied'));
  await ensureSession(stripe, db as any, { ...order, id: 'order2' }, 'token');
  expect(create.mock.calls[1][0].payment_method_types).toEqual(['card']);
});
it('does not prepare or send WhatsApp without platform credentials', async () => {
  vi.stubEnv('WHATSAPP_APP_SECRET', '');
  const db = memory();
  expect(await runWhatsApp(db)).toEqual({ configured: false });
  expect(db.rpc).not.toHaveBeenCalled();
});
it('sends only after an atomic claim and rechecks consent before using the official WhatsApp API', async () => {
  vi.stubEnv('WHATSAPP_APP_SECRET', 'fixture-app');
  const db = memory();
  db.rpc.mockImplementation(async (name: any) => ({
    data: name === 'integration_secret' ? { whatsapp_token: seal('fixture-meta-token') } : 1,
    error: null,
  }));
  tables.tenant_integrations[0] = {
    ...tables.tenant_integrations[0],
    whatsapp_enabled: true,
    whatsapp_phone_id: '123456789',
    whatsapp_template: 'fixture_notice',
  };
  tables.whatsapp_deliveries = [
    {
      id: 'delivery',
      event_id: 'event',
      cliente_id: 'client',
      estabelecimento_id: tenant,
      status: 'pending',
      kind: 'confirmation',
    },
  ];
  tables.agenda_events = [
    { id: 'event', start: new Date(Date.now() + 86400000).toISOString(), status: 'confirmado' },
  ];
  tables.clientes = [
    { id: 'client', estabelecimento_id: tenant, nome: 'Ana', telefone: '11999991234' },
  ];
  tables.estabelecimento = [
    { id: tenant, nome: 'Fixture business', active: true, trial_ends_at: '2099-01-01' },
  ];
  tables.client_contact_preferences = [
    { estabelecimento_id: tenant, cliente_id: 'client', channel: 'whatsapp', consent: true },
  ];
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.fixture' }] }) });
  vi.stubGlobal('fetch', fetch);
  const r = await runWhatsApp(db);
  expect(r.sent).toBe(1);
  expect(tables.whatsapp_deliveries[0].status).toBe('sent');
  expect(JSON.parse(fetch.mock.calls[0][1].body).template.components[0].parameters).toHaveLength(4);
  await runWhatsApp(db);
  expect(fetch).toHaveBeenCalledTimes(1);
  tables.whatsapp_deliveries.push({
    id: 'other',
    event_id: 'event',
    cliente_id: 'client',
    estabelecimento_id: tenant,
    status: 'pending',
    kind: 'confirmation',
  });
  tables.client_contact_preferences[0].consent = false;
  await runWhatsApp(db);
  expect(tables.whatsapp_deliveries[1].status).toBe('suppressed');
  expect(fetch).toHaveBeenCalledTimes(1);
});
