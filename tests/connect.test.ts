import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  connectConfig,
  validateConnectPayment,
  reconcileConnect,
  connectHandler,
} from '../server/connect.js';
const order = {
  id: 'order',
  account_id: 'acct_shop',
  amount_cents: 5000,
  fee_cents: 100,
  session_id: 'cs_order',
  status: 'pending',
};
const session: any = {
  id: 'cs_order',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  currency: 'brl',
  amount_total: 5000,
  client_reference_id: 'order',
  metadata: { purpose: 'connect_order', orderId: 'order' },
  payment_intent: 'pi_order',
  created: 1800000000,
};
const intent: any = {
  id: 'pi_order',
  status: 'succeeded',
  currency: 'brl',
  amount_received: 5000,
  application_fee_amount: 100,
};
afterEach(() => vi.unstubAllEnvs());
describe('optional Connect payments', () => {
  it('is disabled until the separate Connect webhook and release flag are configured', () => {
    vi.stubEnv('STRIPE_CONNECT_ENABLED', 'false');
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec');
    expect(connectConfig().available).toBe(false);
    vi.stubEnv('STRIPE_CONNECT_ENABLED', 'true');
    expect(connectConfig()).toMatchObject({ available: true, feeCents: 100 });
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '');
    expect(connectConfig().available).toBe(false);
  });
  it('checks amount, currency, Stripe fee, order identity and paid state before settlement', () => {
    expect(() => validateConnectPayment(order, session, intent)).not.toThrow();
    for (const patch of [
      { payment_status: 'unpaid' },
      { mode: 'subscription' },
      { status: 'open' },
      { currency: 'usd' },
      { amount_total: 1 },
      { client_reference_id: 'other' },
      { id: 'cs_other' },
      { metadata: { purpose: 'billing' } },
      { payment_intent: 'pi_other' },
    ])
      expect(() => validateConnectPayment(order, { ...session, ...patch }, intent)).toThrow();
    for (const patch of [
      { status: 'processing' },
      { currency: 'usd' },
      { amount_received: 1 },
      { application_fee_amount: 0 },
    ])
      expect(() => validateConnectPayment(order, session, { ...intent, ...patch })).toThrow();
  });
  it('uses the connected account for every Stripe read and settles only a verified payment', async () => {
    const stripe: any = {
      checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session) } },
      paymentIntents: { retrieve: vi.fn().mockResolvedValue(intent) },
    };
    const query: any = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const db: any = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: () => query,
    };
    const result = await reconcileConnect(stripe, db, order);
    expect(result.status).toBe('paid');
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      'cs_order',
      {},
      { stripeAccount: 'acct_shop' },
    );
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      'pi_order',
      { expand: ['latest_charge.balance_transaction'] },
      { stripeAccount: 'acct_shop' },
    );
    expect(db.rpc).toHaveBeenCalledWith(
      'settle_connect_order',
      expect.objectContaining({ p_account: 'acct_shop', p_amount: 5000, p_fee: 100 }),
    );
    stripe.paymentIntents.retrieve.mockResolvedValue({ ...intent, amount_received: 1 });
    db.rpc.mockClear();
    await expect(reconcileConnect(stripe, db, order)).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('does not mark an unfinished checkout paid and releases only a Stripe-confirmed expired session', async () => {
    const stripe: any = {
      checkout: {
        sessions: {
          retrieve: vi
            .fn()
            .mockResolvedValue({ ...session, payment_status: 'unpaid', status: 'open' }),
        },
      },
    };
    const db: any = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    expect((await reconcileConnect(stripe, db, order)).status).toBe('pending');
    expect(db.rpc).not.toHaveBeenCalled();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session, status: 'expired' });
    expect((await reconcileConnect(stripe, db, order)).status).toBe('expired');
    expect(db.rpc).toHaveBeenCalledWith(
      'expire_connect_order',
      expect.objectContaining({ p_session: 'cs_order' }),
    );
  });
  it('rejects another tenants Connect management before touching Stripe', async () => {
    const q: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const db: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'intruder' } } }) },
      from: () => q,
    };
    await expect(
      connectHandler(
        {
          method: 'GET',
          query: {
            action: 'connect-status',
            estabelecimentoId: '11111111-1111-4111-8111-111111111111',
          },
          headers: { authorization: 'Bearer token' },
        } as any,
        {} as any,
        db,
        {} as any,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
