import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  preparePassRefund,
  connectConfig,
  connectWebhookSecret,
  validateConnectPayment,
  reconcileConnect,
  connectHandler,
  createConnectedAccount,
  createConnectedOnboardingLink,
  connectFailure,
  connectDiagnostics,
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
  it('accepts the existing abbreviated secret name while preferring the documented name', () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '');
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SEC', 'legacy-secret');
    vi.stubEnv('STRIPE_CONNECT_ENABLED', 'true');
    expect(connectWebhookSecret()).toBe('legacy-secret');
    expect(connectConfig().available).toBe(true);
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'canonical-secret');
    expect(connectWebhookSecret()).toBe('canonical-secret');
  });
  it('exposes only public availability and fee without authenticating or touching Stripe', async () => {
    vi.stubEnv('STRIPE_CONNECT_ENABLED', 'true');
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'private-secret');
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await connectHandler(
      { method: 'GET', query: { action: 'connect-info' } } as any,
      res,
      {} as any,
      {} as any,
    );
    expect(res.json).toHaveBeenCalledWith({
      available: true,
      feeCents: 100,
      termsVersion: 'connect-2026-10-16-r1',
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-secret');
  });

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
      { stripeAccount: 'acct_shop',timeout:8000,maxNetworkRetries:0 },
    );
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      'pi_order',
      { expand: ['latest_charge.balance_transaction'] },
      { stripeAccount: 'acct_shop',timeout:8000,maxNetworkRetries:0 },
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

describe('Connect onboarding compatibility', () => {
  it('uses the current API when supported and preserves the stable creation key', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'acct_new' });
    const legacy = vi.fn();
    await expect(
      createConnectedAccount(
        { v2: { core: { accounts: { create } } }, accounts: { create: legacy } } as any,
        'tenant',
        'owner@example.test',
      ),
    ).resolves.toEqual({ id: 'acct_new' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ identity: { country: 'BR' } }), {
      idempotencyKey: 'connect-account:tenant',
    });
    expect(legacy).not.toHaveBeenCalled();
  });
  it('supports an existing Stripe platform which explicitly rejects Accounts v2', async () => {
    const current = vi.fn().mockRejectedValue({ code: 'accounts_v2_access_blocked' });
    const legacy = vi.fn().mockResolvedValue({ id: 'acct_legacy' });
    const stripe: any = {
      v2: { core: { accounts: { create: current } } },
      accounts: { create: legacy },
    };
    expect((await createConnectedAccount(stripe, 'tenant', 'owner@example.test')).id).toBe(
      'acct_legacy',
    );
    expect(legacy).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'BR',
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
      }),
      { idempotencyKey: 'connect-account-v1-cards-transfers:tenant' },
    );
  });
  it('does not create another account when the first creation outcome is uncertain or activation is missing', async () => {
    const current = vi.fn();
    const legacy = vi.fn();
    const stripe: any = {
      v2: { core: { accounts: { create: current } } },
      accounts: { create: legacy },
    };
    for (const error of [
      { type: 'StripeConnectionError' },
      { code: 'connect_profile_not_submitted' },
      { code: 'account_create_activation_required' },
    ]) {
      current.mockRejectedValue(error);
      await expect(createConnectedAccount(stripe, 'tenant')).rejects.toEqual(error);
    }
    expect(legacy).not.toHaveBeenCalled();
  });
  it('creates a compatible onboarding link for exactly the persisted account', async () => {
    const current = vi.fn().mockRejectedValue({ code: 'accounts_v2_access_blocked' });
    const legacy = vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/setup/fixture' });
    const stripe: any = {
      v2: { core: { accountLinks: { create: current } } },
      accountLinks: { create: legacy },
    };
    await createConnectedOnboardingLink(
      stripe,
      'acct_saved',
      'https://example.test/admin/recebimentos',
    );
    expect(legacy).toHaveBeenCalledWith({
      account: 'acct_saved',
      type: 'account_onboarding',
      refresh_url: 'https://example.test/admin/recebimentos?connect=refresh',
      return_url: 'https://example.test/admin/recebimentos?connect=return',
    });
  });
  it('gives a concrete activation instruction and never returns provider secrets or raw details', () => {
    expect(connectFailure({ code: 'connect_profile_not_submitted' }).message).toContain('ativação');
    const error = connectFailure({
      code: 'account_capability_not_supported',
      message: 'secret personal data',
    });
    expect(error.message).toContain('account_capability_not_supported');
    expect(error.message).not.toContain('personal data');
    expect(connectFailure({ type: 'StripePermissionError' }).message).toContain('permissão');
  });
});

describe('safe owner onboarding diagnostics', () => {
  it('identifies the exact key suffix, operation and required scopes without storing provider text or secrets', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_privateTestKeyABCD');
    const d = connectDiagnostics({
      type: 'StripePermissionError',
      code: 'permission_denied',
      statusCode: 403,
      connectOperation: 'create_account_v2',
      requestId: 'req_test123',
      message: 'private@example.test key rk_live_secret permission rak_v2_core_account_write',
    });
    expect(d).toMatchObject({
      keySuffix: 'ABCD',
      keySource: 'STRIPE_SECRET_KEY',
      operation: 'create_account_v2',
      requiredPermissions: ['rak_v2_core_account_write'],
      requestId: 'req_test123',
    });
    expect(JSON.stringify(d)).not.toMatch(/private@example|privateTest|rk_live_secret/);
  });
  it('rejects unstructured error fields and distinguishes authentication failure from permissions', () => {
    const d = connectDiagnostics({
      code: 'secret@example.test',
      param: 'key=secret',
      requestId: 'https://example.test/token',
      statusCode: '403',
    });
    expect(d).toMatchObject({ code: null, param: null, requestId: null, status: null });
    expect(connectFailure({ type: 'StripeAuthenticationError' }).message).toContain('autenticação');
  });
});

it('uses the same key with Stripe-authorized v1 resources after a definitive v2 permission rejection', async () => {
  const create = vi.fn().mockRejectedValue({ type: 'StripePermissionError', statusCode: 403 });
  const legacy = vi.fn().mockResolvedValue({ id: 'acct_permitted' });
  const stripe: any = { v2: { core: { accounts: { create } } }, accounts: { create: legacy } };
  expect((await createConnectedAccount(stripe, 'tenant')).id).toBe('acct_permitted');
  expect(legacy).toHaveBeenCalledOnce();
  expect(legacy.mock.calls[0][0].controller.fees.payer).toBe('account');
});
it('reports the v1 permission refusal with its exact stage when neither API permits account creation', async () => {
  const denial = { type: 'StripePermissionError', statusCode: 403, requestId: 'req_v1' };
  const stripe: any = {
    v2: {
      core: {
        accounts: {
          create: vi.fn().mockRejectedValue({ type: 'StripePermissionError', statusCode: 403 }),
        },
      },
    },
    accounts: { create: vi.fn().mockRejectedValue(denial) },
  };
  await expect(createConnectedAccount(stripe, 'tenant')).rejects.toMatchObject({
    connectOperation: 'create_account_v1',
  });
  expect(connectDiagnostics(denial)).toMatchObject({
    operation: 'create_account_v1',
    requestId: 'req_v1',
  });
});

it('satisfies the Stripe v1 dependency between card payments and transfers', async () => {
  const legacy = vi.fn(async (params: any) => {
    if (params.capabilities?.card_payments?.requested && !params.capabilities?.transfers?.requested)
      throw {
        type: 'StripeInvalidRequestError',
        statusCode: 400,
        message: 'Accounts do not currently support card_payments without transfers',
      };
    return { id: 'acct_valid_capabilities' };
  });
  const stripe: any = {
    v2: {
      core: {
        accounts: {
          create: vi.fn().mockRejectedValue({ type: 'StripePermissionError', statusCode: 403 }),
        },
      },
    },
    accounts: { create: legacy },
  };
  expect((await createConnectedAccount(stripe, 'tenant')).id).toBe('acct_valid_capabilities');
  expect(legacy).toHaveBeenCalledWith(
    expect.objectContaining({
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    }),
    { idempotencyKey: 'connect-account-v1-cards-transfers:tenant' },
  );
});

it('freezes a prepaid pass before provider refund and fails closed for a refused freeze', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  await preparePassRefund({ rpc } as any, 'receipt');
  expect(rpc).toHaveBeenCalledWith('prepare_growth_refund', { p_receipt: 'receipt' });
  rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } });
  await expect(preparePassRefund({ rpc } as any, 'receipt')).rejects.toThrow(
    'O pacote não pode ser reembolsado',
  );
});
it('fails closed when the required financial protection migration is unavailable', async () => {
  const rpc = vi.fn().mockResolvedValue({ error: { code: 'PGRST202' } });
  await expect(preparePassRefund({ rpc } as any, 'legacy')).rejects.toThrow('não pode ser reembolsado');
});
