import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ensureSession, reconcileConnect, validateClubIntent } from '../server/connect';
import {
  clubHandler,
  runClubRenewals,
  maintainDepositHolds,
  CLUB_TERMS,
} from '../server/growth-payments';
const uid = '10000000-0000-4000-8000-000000000001';
let tables: Record<string, any[]>, rpc: any, stripe: any;
function fixture() {
  return {
    rpc,
    from: (name: string) => {
      let filters: ((r: any) => boolean)[] = [],
        patch: any = null,
        limit = Infinity;
      const read = () => {
        const rows = (tables[name] || []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
        if (patch) rows.forEach((r) => Object.assign(r, patch));
        return rows;
      };
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        neq: (k: string, v: any) => {
          filters.push((r) => r[k] !== v);
          return q;
        },
        is: (k: string, v: any) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        in: (k: string, v: any[]) => {
          filters.push((r) => v.includes(r[k]));
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
        update: (p: any) => {
          patch = p;
          return q;
        },
        upsert: async (rows: any[]) => {
          tables[name] ||= [];
          for (const row of rows) {
            const old = tables[name].find((r) => r.id === row.id);
            if (old) Object.assign(old, row);
            else tables[name].push(row);
          }
          return { data: rows, error: null };
        },
        single: async () => ({ data: read()[0] || null, error: null }),
        maybeSingle: async () => ({ data: read()[0] || null, error: null }),
        then: (ok: any) => Promise.resolve({ data: read(), error: null }).then(ok),
      };
      return q;
    },
  };
}
const intent = () => ({
  id: 'pi_cycle',
  status: 'succeeded',
  amount: 12000,
  amount_received: 12000,
  currency: 'brl',
  application_fee_amount: 100,
  created: Math.floor(Date.now() / 1000),
  metadata: { purpose: 'connect_order', orderId: 'order' },
  customer: 'cus_fixture',
  payment_method: 'pm_fixture',
  latest_charge: null,
});
beforeEach(() => {
  vi.stubEnv('STRIPE_CONNECT_ENABLED', 'true');
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'fixture');
  vi.stubEnv('PROJECT_URL', 'https://example.test');
  tables = {
    club_contracts: [
      {
        id: 'club',
        estabelecimento_id: 'tenant',
        token: uid,
        title: 'Clube',
        price: 120,
        status: 'active',
        renew_enabled: true,
        consent_at: new Date().toISOString(),
        terms_version: CLUB_TERMS,
        customer_id: 'cus_fixture',
        payment_method_id: 'pm_fixture',
        account_id: 'acct_shop',
        next_due: '2020-01-01',
      },
    ],
    club_cycles: [
      {
        id: 'cycle',
        contract_id: 'club',
        receipt_id: 'order',
        due_date: '2020-01-01',
        created_at: new Date().toISOString(),
        debit_claimed_at: null,
      },
    ],
    caixa_itens: [{ id: 'order', token_publico: uid, status_caixa: 'pendente' }],
    connect_orders: [
      {
        id: 'order',
        estabelecimento_id: 'tenant',
        purpose: 'club',
        status: 'pending',
        account_id: 'acct_shop',
        amount_cents: 12000,
        fee_cents: 100,
        session_id: null,
        payment_intent_id: null,
        created_at: new Date().toISOString(),
        checkout_attempt: 0,
      },
    ],
    connect_accounts: [
      { estabelecimento_id: 'tenant', account_id: 'acct_shop', enabled: true, fee_cents: 100 },
    ],
    estabelecimento: [{ id: 'tenant', nome: 'Studio' }],
  };
  rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  stripe = {
    accounts: {
      retrieve: vi.fn().mockResolvedValue({ charges_enabled: true, payouts_enabled: true }),
    },
    checkout: {
      sessions: {
        create: vi
          .fn()
          .mockResolvedValue({ id: 'cs_fixture', url: 'https://checkout.stripe.com/fixture' }),
        retrieve: vi.fn().mockResolvedValue({ status: 'open', payment_status: 'unpaid' }),
        list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      },
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue(intent()),
      retrieve: vi.fn().mockResolvedValue(intent()),
      cancel: vi.fn().mockResolvedValue({ status: 'canceled' }),
    },
  };
});
afterEach(() => vi.unstubAllEnvs());
it('validates a monthly debit without manufacturing a Checkout session', () => {
  const order = { ...tables.connect_orders[0], payment_intent_id: 'pi_cycle' };
  expect(() => validateClubIntent(order, intent() as any)).not.toThrow();
  for (const patch of [
    { status: 'processing' },
    { currency: 'usd' },
    { amount: 1 },
    { amount_received: 1 },
    { application_fee_amount: 99 },
    { metadata: { purpose: 'other', orderId: 'order' } },
    { metadata: { purpose: 'connect_order', orderId: 'other' } },
  ])
    expect(() => validateClubIntent(order, { ...intent(), ...patch } as any)).toThrow();
  expect(() => validateClubIntent({ ...order, purpose: 'checkout' }, intent() as any)).toThrow();
});
it('creates a 35-minute deposit hold scoped to the merchant and refuses a late new session', async () => {
  const order = {
    ...tables.connect_orders[0],
    purpose: 'deposit',
    created_at: new Date().toISOString(),
  };
  await ensureSession(stripe, fixture() as any, order, uid);
  const [payload, options] = stripe.checkout.sessions.create.mock.calls[0];
  expect(payload.expires_at).toBe(Math.floor(Date.parse(order.created_at) / 1000) + 35 * 60);
  expect(options).toMatchObject({
    stripeAccount: 'acct_shop',
    idempotencyKey: 'connect-order:order',
  });
  stripe.checkout.sessions.create.mockClear();
  await expect(
    ensureSession(
      stripe,
      fixture() as any,
      { ...order, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
      uid,
    ),
  ).rejects.toThrow();
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});
it('saves the club card for future off-session debits only after the recorded mandate', async () => {
  tables.club_contracts[0].customer_id = null;
  await ensureSession(stripe, fixture() as any, tables.connect_orders[0], uid);
  const payload = stripe.checkout.sessions.create.mock.calls[0][0];
  expect(payload.customer_creation).toBe('always');
  expect(payload.payment_intent_data).toMatchObject({
    application_fee_amount: 100,
    setup_future_usage: 'off_session',
  });
  expect(payload.success_url).toContain('/clube/' + uid);
  tables.club_contracts[0].consent_at = null;
  await expect(
    ensureSession(stripe, fixture() as any, { ...tables.connect_orders[0], session_id: null }, uid),
  ).rejects.toThrow('autorizar');
});
it('a verified replacement attempt uses a new stable session key and a fresh expiry', async () => {
  const order = {
    ...tables.connect_orders[0],
    checkout_attempt: 1,
    created_at: '2020-01-01',
    checkout_epoch: new Date().toISOString(),
  };
  await ensureSession(stripe, fixture() as any, order, uid);
  expect(stripe.checkout.sessions.create.mock.calls[0][1].idempotencyKey).toBe(
    'connect-order:order:1',
  );
});
it('settles the exact monthly intent and binds the card after settlement', async () => {
  const order = { ...tables.connect_orders[0], payment_intent_id: 'pi_cycle' };
  await reconcileConnect(stripe, fixture() as any, order);
  expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
    'pi_cycle',
    { expand: ['latest_charge.balance_transaction'] },
    expect.objectContaining({ stripeAccount: 'acct_shop' }),
  );
  expect(rpc).toHaveBeenCalledWith(
    'settle_connect_order',
    expect.objectContaining({ p_session: null, p_intent: 'pi_cycle', p_amount: 12000, p_fee: 100 }),
  );
  expect(rpc).toHaveBeenCalledWith('bind_club_card', {
    p_order: 'order',
    p_customer: 'cus_fixture',
    p_method: 'pm_fixture',
  });
  expect(rpc.mock.calls.findIndex((r: any) => r[0] === 'bind_club_card')).toBeGreaterThan(
    rpc.mock.calls.findIndex((r: any) => r[0] === 'settle_connect_order'),
  );
});
it('does not grant rights when the saved customer identity differs', async () => {
  tables.club_contracts[0].customer_id = 'cus_other';
  await expect(
    reconcileConnect(stripe, fixture() as any, {
      ...tables.connect_orders[0],
      payment_intent_id: 'pi_cycle',
    }),
  ).rejects.toThrow('divergente');
  expect(rpc).not.toHaveBeenCalledWith('settle_connect_order', expect.anything());
});
it('requires explicit acceptance and the current terms before preparing a first debit', async () => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await expect(
    clubHandler(
      {
        method: 'POST',
        query: { action: 'club-accept' },
        body: { token: uid, accepted: false, termsVersion: CLUB_TERMS },
      } as any,
      res,
      fixture() as any,
      stripe,
    ),
  ).rejects.toThrow('Autorize');
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalledWith('claim_club_cycle', expect.anything());
});
it('cancels future debits with explicit confirmation without deleting paid cycle rights', async () => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await clubHandler(
    {
      method: 'POST',
      query: { action: 'club-cancel' },
      body: { token: uid, confirmed: true },
    } as any,
    res,
    fixture() as any,
    stripe,
  );
  expect(tables.club_contracts[0]).toMatchObject({ status: 'cancelled', renew_enabled: false });
  expect(tables.club_cycles).toHaveLength(1);
  expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
});
it('keeps an uncertain merchant-initiated debit out of automatic retry', async () => {
  let claimed = false;
  rpc.mockImplementation(async (name: string) =>
    name === 'claim_club_cycle'
      ? {
          data: {
            claimed: claimed ? false : (claimed = true),
            order_id: 'order',
            cycle_id: 'cycle',
            customer_id: 'cus_fixture',
            payment_method_id: 'pm_fixture',
          },
          error: null,
        }
      : { data: null, error: null },
  );
  stripe.paymentIntents.create.mockRejectedValue(Error('unknown network result'));
  await runClubRenewals({ db: fixture(), stripe });
  await runClubRenewals({ db: fixture(), stripe });
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  expect(tables.club_contracts[0].status).toBe('past_due');
  expect(stripe.paymentIntents.create.mock.calls[0]).toEqual([
    expect.objectContaining({ off_session: true, confirm: true, application_fee_amount: 100 }),
    expect.objectContaining({ stripeAccount: 'acct_shop', idempotencyKey: 'club-debit:cycle' }),
  ]);
});
it('stores an authentication-required intent for on-session recovery instead of trying another debit', async () => {
  rpc.mockResolvedValue({
    data: {
      claimed: true,
      order_id: 'order',
      cycle_id: 'cycle',
      customer_id: 'cus_fixture',
      payment_method_id: 'pm_fixture',
    },
    error: null,
  });
  stripe.paymentIntents.create.mockResolvedValue({ ...intent(), status: 'requires_action' });
  await runClubRenewals({ db: fixture(), stripe });
  expect(tables.connect_orders[0].payment_intent_id).toBe('pi_cycle');
  expect(tables.club_contracts[0].status).toBe('past_due');
});
it('does not release an unlocated hold when the Stripe lookup is incomplete', async () => {
  tables.connect_orders[0] = {
    ...tables.connect_orders[0],
    purpose: 'deposit',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
  };
  stripe.checkout.sessions.list.mockResolvedValue({ data: [], has_more: true });
  await maintainDepositHolds({ db: fixture(), stripe });
  expect(rpc).not.toHaveBeenCalledWith('expire_connect_order', expect.anything());
  stripe.checkout.sessions.list.mockResolvedValue({ data: [], has_more: false });
  await maintainDepositHolds({ db: fixture(), stripe });
  expect(rpc).toHaveBeenCalledWith('expire_connect_order', {
    p_id: 'order',
    p_account: 'acct_shop',
    p_session: null,
  });
});

it('records confirmed refunds and platform fee returns once, retaining their provider dates', async () => {
  const charge = {
    id: 'ch_cycle',
    created: Math.floor(Date.now() / 1000),
    amount_refunded: 12000,
    refunded: true,
    disputed: false,
    application_fee: 'fee_cycle',
    balance_transaction: {
      net: 11600,
      fee_details: [
        { type: 'application_fee', amount: 100 },
        { type: 'stripe_fee', amount: 300 },
      ],
    },
  };
  stripe.paymentIntents.retrieve.mockResolvedValue({ ...intent(), latest_charge: charge });
  stripe.refunds = {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 're_cycle', status: 'succeeded', amount: 12000, created: 1800000000 }],
      has_more: false,
    }),
  };
  stripe.applicationFees = {
    listRefunds: vi.fn().mockResolvedValue({
      data: [{ id: 'fr_cycle', amount: 100, created: 1800000001 }],
      has_more: false,
    }),
  };
  const order = { ...tables.connect_orders[0], payment_intent_id: 'pi_cycle' };
  const r = await reconcileConnect(stripe, fixture() as any, order);
  expect(r.status).toBe('refunded');
  expect(r.stripe_fee_cents).toBe(300);
  expect(tables.connect_refunds[0].paid_at).toBe(new Date(1800000000 * 1000).toISOString());
  expect(tables.connect_fee_refunds[0].amount_cents).toBe(100);
  await reconcileConnect(stripe, fixture() as any, order);
  expect(tables.connect_refunds).toHaveLength(1);
  expect(tables.connect_fee_refunds).toHaveLength(1);
});
it('does not release a reservation or cancel rights until the refund is confirmed succeeded', async () => {
  const charge = {
    id: 'ch_cycle',
    created: Math.floor(Date.now() / 1000),
    amount_refunded: 12000,
    refunded: true,
    disputed: false,
  };
  stripe.paymentIntents.retrieve.mockResolvedValue({ ...intent(), latest_charge: charge });
  stripe.refunds = {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 're_pending', status: 'pending', amount: 12000, created: 1800000000 }],
      has_more: false,
    }),
  };
  const r = await reconcileConnect(stripe, fixture() as any, {
    ...tables.connect_orders[0],
    payment_intent_id: 'pi_cycle',
  });
  expect(r.status).toBe('paid');
  expect(r.refund_pending_cents).toBe(12000);
  expect(tables.caixa_itens[0].status_caixa).toBe('pendente');
  expect(tables.connect_refunds || []).toHaveLength(0);
});
it('recovers a positively identified lost intent without creating another debit', async () => {
  stripe.paymentIntents.search = vi.fn().mockResolvedValue({ data: [intent()], has_more: false });
  const r = await reconcileConnect(stripe, fixture() as any, tables.connect_orders[0]);
  expect(r.status).toBe('paid');
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it('an empty eventual-consistency search never authorizes a replacement debit', async () => {
  stripe.paymentIntents.search = vi.fn().mockResolvedValue({ data: [], has_more: false });
  const r = await reconcileConnect(stripe, fixture() as any, tables.connect_orders[0]);
  expect(r.status).toBe('pending');
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it('cancels renewal even when Stripe is unavailable', async () => {
  tables.connect_orders[0].payment_intent_id = 'pi_cycle';
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await clubHandler(
    {
      method: 'POST',
      query: { action: 'club-cancel' },
      body: { token: uid, confirmed: true },
    } as any,
    res,
    fixture() as any,
    undefined as any,
  );
  expect(tables.club_contracts[0].renew_enabled).toBe(false);
  expect(res.json).toHaveBeenCalledWith({ cancelled: true });
});
it('keeps cancellation available through the club page while a provider lookup is unavailable', async () => {
  tables.connect_orders[0].payment_intent_id = 'pi_cycle';
  stripe.paymentIntents.retrieve.mockRejectedValue(Error('provider offline'));
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await clubHandler(
    { method: 'GET', query: { action: 'club-info', token: uid } } as any,
    res,
    fixture() as any,
    stripe,
  );
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ providerReview: true, renew_enabled: true }),
  );
  expect(res.json.mock.calls[0][0]).not.toHaveProperty('payment_method_id');
});
