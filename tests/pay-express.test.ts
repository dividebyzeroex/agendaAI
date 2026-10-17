import { describe, expect, it, vi, afterEach } from 'vitest';
import { ensureSession } from '../server/connect.js';
import { qrcodegen } from '../src/app/utils/vendor/qrcodegen';

describe('AgendaAI Pay Express: locally generated payment QR', () => {
  const paymentLink = 'https://agenda-ai-beryl.vercel.app/comanda/550e8400-e29b-41d4-a716-446655440000';

  it('encodes a public comanda link without calling a third-party QR API', () => {
    const qr = qrcodegen.QrCode.encodeText(paymentLink, qrcodegen.QrCode.Ecc.MEDIUM);
    expect(qr.size).toBeGreaterThan(20);
    expect(qr.size).toBeLessThanOrEqual(177);
    // QR corner finder marks: three 7x7 dark boundaries with light inside.
    for (const [x,y] of [[0,0],[qr.size - 1,0],[0,qr.size - 1]]) {
      expect(qr.getModule(x,y)).toBe(true);
    }
  });

  it('makes a stable, unique pattern for different comanda tokens', () => {
    const first = qrcodegen.QrCode.encodeText(paymentLink, qrcodegen.QrCode.Ecc.MEDIUM);
    const other = qrcodegen.QrCode.encodeText(
      paymentLink.replace('550e8400','650e8400'),qrcodegen.QrCode.Ecc.MEDIUM);
    expect(first.size).toBe(other.size);
    let different = false;
    for (let y=0;y<first.size && !different;y++) {
      for (let x=0;x<first.size;x++) {
        if (first.getModule(x,y) !== other.getModule(x,y)) {different=true;break;}
      }
    }
    expect(different).toBe(true);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('AgendaAI Pay Express: Stripe checkout sessions', () => {
  function dependencies(email: string | null = 'cliente@example.com') {
    const create = vi.fn().mockResolvedValue({
      id: 'cs_test_existing', url: 'https://checkout.stripe.com/c/pay/cs_test_existing',
    });
    const retrieve = vi.fn().mockResolvedValue({
      id:'cs_test_existing',url:'https://checkout.stripe.com/c/pay/cs_test_existing',
    });
    const rows:any = {
      caixa_itens: { data: {email_cliente:email},error:null },
      tenant_integrations: { data: {pix_enabled:false},error:null },
      connect_orders: { data:null,error:null },
    };
    const db:any = {
      from: vi.fn((name:string) => ({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(rows[name]),
        then: (resolve: (value:unknown)=>unknown) => Promise.resolve(rows[name]).then(resolve),
      })),
    };
    const stripe:any = { checkout: { sessions: {create,retrieve} } };
    const order = {
      id:'550e8400-e29b-41d4-a716-446655440000',
      account_id:'acct_shop', estabelecimento_id:'a37e8400-e29b-41d4-a716-446655440000',
      amount_cents:8500, fee_cents:100, purpose:'checkout', status:'pending',
      session_id:null, checkout_attempt:0, created_at:new Date().toISOString()
    };
    return {db,stripe,create,retrieve,order};
  }

  it('uses one hosted Stripe session with an existing customer email and the fee intact', async () => {
    vi.stubEnv('PROJECT_URL', 'https://agenda-ai-beryl.vercel.app');
    const {db,stripe,create,order} = dependencies();
    const session = await ensureSession(stripe,db,order,'550e8400-e29b-41d4-a716-446655440000');
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode:'payment', customer_email:'cliente@example.com',
      client_reference_id:order.id,
      payment_method_types:['card'],
      payment_intent_data:expect.objectContaining({application_fee_amount:100}),
    }),expect.objectContaining({
      stripeAccount:'acct_shop',
      idempotencyKey:'connect-order:'+order.id
    }));
  });

  it('never creates a second Stripe session when a payment session already exists', async () => {
    vi.stubEnv('PROJECT_URL', 'https://agenda-ai-beryl.vercel.app');
    const {db,stripe,create,retrieve,order} = dependencies();
    await ensureSession(stripe,db,{...order,session_id:'cs_test_existing'},'550e8400-e29b-41d4-a716-446655440000');
    expect(retrieve).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not prefill malformed customer email', async () => {
    vi.stubEnv('PROJECT_URL', 'https://agenda-ai-beryl.vercel.app');
    const {db,stripe,create,order} = dependencies('not-an-email');
    await ensureSession(stripe,db,order,'550e8400-e29b-41d4-a716-446655440000');
    expect(create.mock.calls[0][0].customer_email).toBeUndefined();
  });
});
