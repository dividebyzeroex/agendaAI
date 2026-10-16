import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './http.js';
import { authenticate, BillingError, objectId, ownedEstablishment } from './billing.js';
const TERMS = 'connect-2026-10-16-r1';
const FEE = 100;
// Fall back only when Stripe explicitly rejects Accounts v2 support. Never retry uncertain creation through another API.
function legacyConnectAllowed(error: any) {
  return error?.code === 'accounts_v2_access_blocked';
}
export async function createConnectedAccount(stripe: Stripe, tenantId: string, email?: string) {
  try {
    return await stripe.v2.core.accounts.create(
      {
        contact_email: email,
        identity: { country: 'BR' },
        dashboard: 'full',
        defaults: {
          currency: 'brl',
          locales: ['pt-BR'],
          responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
        },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        metadata: { estabelecimentoId: tenantId },
      },
      { idempotencyKey: 'connect-account:' + tenantId },
    );
  } catch (error) {
    if (!legacyConnectAllowed(error)) throw error;
    return await stripe.accounts.create(
      {
        country: 'BR',
        email,
        default_currency: 'brl',
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
        capabilities: { card_payments: { requested: true } },
        metadata: { estabelecimentoId: tenantId },
      },
      { idempotencyKey: 'connect-account-v1:' + tenantId },
    );
  }
}
export async function createConnectedOnboardingLink(
  stripe: Stripe,
  accountId: string,
  base: string,
) {
  try {
    return await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant'],
          refresh_url: base + '?connect=refresh',
          return_url: base + '?connect=return',
        },
      },
    });
  } catch (error: any) {
    // No account creation occurs here; both APIs generate a link for the same persisted account.
    if (
      !legacyConnectAllowed(error) &&
      !(error?.code === 'resource_missing' && error?.param === 'account')
    )
      throw error;
    return await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: base + '?connect=refresh',
      return_url: base + '?connect=return',
    });
  }
}
export function connectFailure(error: any): BillingError {
  if (error instanceof BillingError) return error;
  const code =
    typeof error?.code === 'string' && /^[a-z0-9_]{2,80}$/.test(error.code) ? error.code : '';
  if (
    [
      'account_create_activation_required',
      'connect_identity_not_verified',
      'connect_profile_not_submitted',
      'cannot_create_connected_account',
      'account_terms_of_service_not_accepted',
      'account_creation_identity_verification_incomplete',
      'account_creation_requirement_collection_and_liability_unacknowledged_and_identity_verification_incomplete',
    ].includes(code)
  )
    return new BillingError(
      409,
      'A Stripe exige concluir a ativação e as informações da conta da plataforma. Finalize o cadastro no painel Stripe e tente vincular novamente.',
    );
  if (error?.type === 'StripePermissionError' || error?.type === 'StripeAuthenticationError')
    return new BillingError(
      503,
      'A chave Stripe da plataforma precisa ter permissão para gerenciar contas Connect.',
    );
  if (error?.type === 'StripeConnectionError' || error?.type === 'StripeAPIError')
    return new BillingError(
      503,
      'Não foi possível confirmar a resposta da Stripe. Tente vincular novamente; a solicitação usa a mesma identificação para evitar duplicidade.',
    );
  if (error?.type === 'StripeIdempotencyError' || code === 'idempotency_key_in_use')
    return new BillingError(
      409,
      'A Stripe ainda está processando esta vinculação. Aguarde e tente novamente.',
    );
  return new BillingError(
    502,
    'A Stripe não concluiu a vinculação' +
      (code ? ' (código: ' + code + ')' : '') +
      '. Confira a configuração Connect da plataforma e tente novamente.',
  );
}
export function connectWebhookSecret() {
  return process.env['STRIPE_CONNECT_WEBHOOK_SECRET'] || process.env['STRIPE_CONNECT_WEBHOOK_SEC'];
}
export function connectConfig() {
  return {
    available: process.env['STRIPE_CONNECT_ENABLED'] === 'true' && !!connectWebhookSecret(),
    feeCents: FEE,
    termsVersion: TERMS,
  };
}
function origin() {
  const url = new URL(process.env['PROJECT_URL'] || '');
  if (url.protocol !== 'https:')
    throw new BillingError(503, 'Endereço de pagamentos indisponível.');
  return url.origin;
}
async function checked<T extends { data: any; error: any }>(q: PromiseLike<T>) {
  const r = await q;
  if (r.error) throw new BillingError(503, 'Não foi possível conferir os pagamentos.');
  return r.data;
}
export function validateConnectPayment(
  o: any,
  s: Stripe.Checkout.Session,
  pi: Stripe.PaymentIntent,
) {
  if (
    s.mode !== 'payment' ||
    s.status !== 'complete' ||
    s.payment_status !== 'paid' ||
    s.currency !== 'brl' ||
    s.amount_total !== Number(o.amount_cents) ||
    s.client_reference_id !== o.id ||
    s.metadata?.['purpose'] !== 'connect_order' ||
    s.metadata?.['orderId'] !== o.id ||
    (o.session_id && o.session_id !== s.id) ||
    pi.status !== 'succeeded' ||
    pi.currency !== 'brl' ||
    pi.amount_received !== Number(o.amount_cents) ||
    pi.application_fee_amount !== o.fee_cents ||
    objectId(s.payment_intent) !== pi.id
  )
    throw new BillingError(409, 'Pagamento não confere com a comanda.');
}
export async function reconcileConnect(stripe: Stripe, db: SupabaseClient, o: any) {
  if (!o.session_id) return o;
  const options = { stripeAccount: o.account_id };
  const session = await stripe.checkout.sessions.retrieve(o.session_id, {}, options);
  if (session.status === 'expired') {
    await checked(
      db.rpc('expire_connect_order', {
        p_id: o.id,
        p_account: o.account_id,
        p_session: session.id,
      }),
    );
    return { ...o, status: o.status === 'pending' ? 'expired' : o.status };
  }
  if (session.payment_status !== 'paid') return o;
  const id = objectId(session.payment_intent);
  if (!id) throw new BillingError(409, 'Pagamento ainda em confirmação.');
  const pi = await stripe.paymentIntents.retrieve(
    id,
    { expand: ['latest_charge.balance_transaction'] },
    options,
  );
  validateConnectPayment(o, session, pi);
  const paymentCharge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const paidAt = new Date((paymentCharge?.created || session.created) * 1000).toISOString();
  await checked(
    db.rpc('settle_connect_order', {
      p_id: o.id,
      p_account: o.account_id,
      p_session: session.id,
      p_intent: pi.id,
      p_amount: session.amount_total,
      p_fee: pi.application_fee_amount,
      p_paid_at: paidAt,
    }),
  );
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const balance =
    charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
  const patch: any = {
    charge_id: charge?.id || null,
    ...(balance
      ? {
          stripe_fee_cents: balance.fee_details
            .filter((f) => f.type !== 'application_fee')
            .reduce((sum, f) => sum + f.amount, 0),
          net_cents: balance.net,
        }
      : {}),
  };
  if (charge) {
    let disputed = charge.disputed;
    if (disputed) {
      const disputes = await stripe.disputes.list({ charge: charge.id, limit: 1 }, options);
      const state = disputes.data[0]?.status;
      disputed = state !== 'won' && state !== 'warning_closed';
    }
    patch.refunded_cents = charge.amount_refunded;
    patch.status = charge.refunded ? 'refunded' : disputed ? 'disputed' : 'paid';
  }
  await checked(db.from('connect_orders').update(patch).eq('id', o.id));
  if (charge?.refunded) {
    await checked(db.from('caixa_itens').update({ status_caixa: 'cancelado' }).eq('id', o.id));
    const receipt = await checked(
      db.from('caixa_itens').select('agenda_event_id').eq('id', o.id).single(),
    );
    if (receipt.agenda_event_id)
      await checked(
        db
          .from('comissoes')
          .update({ status: 'cancelado' })
          .eq('evento_id', receipt.agenda_event_id)
          .eq('status', 'pendente'),
      );
  }
  return { ...o, status: 'paid', payment_intent_id: pi.id, ...patch };
}
async function ensureSession(stripe: Stripe, db: SupabaseClient, order: any, token: string) {
  let session: Stripe.Checkout.Session;
  if (order.session_id)
    session = await stripe.checkout.sessions.retrieve(
      order.session_id,
      {},
      { stripeAccount: order.account_id },
    );
  else {
    // Do not create a second session after Stripe's 24-hour idempotency retention.
    if (Date.now() - Date.parse(order.created_at) > 23 * 3600000)
      throw new BillingError(409, 'Peça ao estabelecimento para revisar esta cobrança.');
    const url = `${origin()}/comanda/${token}`;
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: order.id,
        metadata: { purpose: 'connect_order', orderId: order.id },
        payment_intent_data: {
          application_fee_amount: order.fee_cents,
          metadata: { purpose: 'connect_order', orderId: order.id },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: Number(order.amount_cents),
              product_data: { name: 'Atendimento e produtos do estabelecimento' },
            },
          },
        ],
        expires_at: Math.floor(Date.parse(order.created_at) / 1000) + 24 * 3600,
        success_url: url + '?pagamento=confirmando',
        cancel_url: url,
      },
      { stripeAccount: order.account_id, idempotencyKey: 'connect-order:' + order.id },
    );
    await checked(db.from('connect_orders').update({ session_id: session.id }).eq('id', order.id));
  }
  return session;
}
async function orderByToken(db: SupabaseClient, token: unknown) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token))
    throw new BillingError(404, 'Comanda indisponível.');
  const receipt = await checked(
    db
      .from('caixa_itens')
      .select('id,token_publico,status_caixa')
      .eq('token_publico', token)
      .maybeSingle(),
  );
  if (!receipt) throw new BillingError(404, 'Comanda indisponível.');
  const order = await checked(
    db.from('connect_orders').select('*').eq('id', receipt.id).maybeSingle(),
  );
  return { receipt, order };
}
export async function connectHandler(
  req: VercelRequest,
  res: VercelResponse,
  db: SupabaseClient,
  stripe: Stripe,
) {
  const action = String(req.query['action']);
  const config = connectConfig();
  const allowed: Record<string, string> = {
    'connect-info': 'GET',
    'connect-status': 'GET',
    'connect-onboard': 'POST',
    'connect-settings': 'POST',
    'connect-pay': 'POST',
    'connect-receipt': 'GET',
    'connect-cancel': 'POST',
    'connect-refund': 'POST',
  };
  if (!allowed[action]) throw new BillingError(400, 'Ação inválida.');
  if (req.method !== allowed[action]) {
    res.setHeader('Allow', allowed[action]);
    throw new BillingError(405, 'Método não permitido.');
  }
  if (action === 'connect-info') return res.status(200).json(config);
  if (action === 'connect-pay' || action === 'connect-receipt') {
    const { receipt, order } = await orderByToken(
      db,
      req.method === 'GET' ? req.query['token'] : req.body?.token,
    );
    if (!order) return res.status(200).json({ online: false });
    const current = await reconcileConnect(stripe, db, order);
    if (action === 'connect-receipt')
      return res.status(200).json({ online: true, status: current.status });
    if (!config.available) throw new BillingError(503, 'Pagamento online indisponível.');
    if (current.status !== 'pending')
      throw new BillingError(409, 'Esta cobrança não está pendente. Atualize a comanda.');
    const linked = await checked(
      db
        .from('connect_accounts')
        .select('*')
        .eq('estabelecimento_id', order.estabelecimento_id)
        .single(),
    );
    if (!linked.enabled || linked.account_id !== order.account_id)
      throw new BillingError(409, 'O estabelecimento desativou novas cobranças online.');
    const account = await stripe.accounts.retrieve(order.account_id);
    if (!account.charges_enabled || !account.payouts_enabled)
      throw new BillingError(409, 'O estabelecimento precisa concluir o cadastro na Stripe.');
    const session = await ensureSession(stripe, db, order, receipt.token_publico);
    if (!session.url || !session.url.startsWith('https://checkout.stripe.com/'))
      throw new BillingError(409, 'Pagamento em confirmação. Atualize a comanda.');
    return res.status(200).json({ url: session.url });
  }
  const user = await authenticate(db, req.headers.authorization);
  const id = req.method === 'GET' ? req.query['estabelecimentoId'] : req.body?.estabelecimentoId;
  await ownedEstablishment(db, id, user.id);
  const linkedResult = await db
    .from('connect_accounts')
    .select('*')
    .eq('estabelecimento_id', id)
    .maybeSingle();
  // The develop build can precede the approved production migration.
  if (
    linkedResult.error &&
    action === 'connect-status' &&
    !config.available &&
    ['42P01', 'PGRST205'].includes(linkedResult.error.code)
  )
    return res
      .status(200)
      .json({ ...config, linked: false, enabled: false, orders: [], payouts: [] });
  if (linkedResult.error) throw new BillingError(503, 'Não foi possível conferir os pagamentos.');
  let linked = linkedResult.data;
  if (action === 'connect-onboard') {
    if (!config.available)
      throw new BillingError(503, 'Stripe Connect ainda não foi liberado para uso.');
    if (req.body?.termsAccepted !== true || req.body?.termsVersion !== TERMS)
      throw new BillingError(400, 'Aceite a taxa e as condições de recebimento.');
    const platform = await stripe.accounts.retrieve(null);
    if (platform.country !== 'BR')
      throw new BillingError(
        409,
        'A plataforma precisa de uma conta Stripe brasileira para reter taxas de contas brasileiras.',
      );
    if (!linked) {
      const account = await createConnectedAccount(stripe, String(id), user.email);
      linked = await checked(
        db
          .from('connect_accounts')
          .upsert(
            {
              estabelecimento_id: id,
              account_id: account.id,
              fee_cents: FEE,
              terms_version: TERMS,
              terms_user: user.id,
              terms_at: new Date().toISOString(),
            },
            { onConflict: 'estabelecimento_id' },
          )
          .select('*')
          .single(),
      );
    }
    const base = origin() + '/admin/primeiros-passos';
    const link = await createConnectedOnboardingLink(stripe, linked.account_id, base);
    return res.status(200).json({ url: link.url });
  }
  if (!linked)
    return res
      .status(200)
      .json({ ...config, linked: false, enabled: false, orders: [], payouts: [] });
  const account = await stripe.accounts.retrieve(linked.account_id);
  const ready = !!account.charges_enabled && !!account.payouts_enabled;
  const accountPatch = {
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    updated_at: new Date().toISOString(),
  };
  await checked(db.from('connect_accounts').update(accountPatch).eq('estabelecimento_id', id));
  if (action === 'connect-settings') {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean')
      throw new BillingError(400, 'Escolha uma forma de recebimento.');
    if (
      enabled &&
      (!ready ||
        !config.available ||
        req.body?.termsAccepted !== true ||
        req.body?.termsVersion !== TERMS)
    )
      throw new BillingError(409, 'Conclua o cadastro e aceite as condições.');
    await checked(
      db
        .from('connect_accounts')
        .update({
          enabled,
          ...(enabled
            ? {
                fee_cents: FEE,
                terms_version: TERMS,
                terms_user: user.id,
                terms_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq('estabelecimento_id', id),
    );
    return res.status(200).json({ enabled });
  }
  if (action === 'connect-cancel' || action === 'connect-refund') {
    const o = await checked(
      db
        .from('connect_orders')
        .select('*')
        .eq('id', req.body?.orderId)
        .eq('estabelecimento_id', id)
        .single(),
    );
    if (action === 'connect-cancel') {
      const receipt = await checked(
        db.from('caixa_itens').select('token_publico').eq('id', o.id).single(),
      );
      const s = await ensureSession(stripe, db, o, receipt.token_publico);
      o.session_id = s.id;
      if (s.status === 'open')
        await stripe.checkout.sessions.expire(s.id, {}, { stripeAccount: o.account_id });
    } else {
      const current = await reconcileConnect(stripe, db, o);
      if (current.status !== 'paid' || !current.payment_intent_id)
        throw new BillingError(409, 'Pagamento indisponível para reembolso.');
      await stripe.refunds.create(
        { payment_intent: current.payment_intent_id, refund_application_fee: true },
        { stripeAccount: o.account_id, idempotencyKey: 'connect-refund:' + o.id },
      );
    }
    const updated = await reconcileConnect(stripe, db, o);
    return res.status(200).json({ status: updated.status });
  }
  const orders = await checked(
    db
      .from('connect_orders')
      .select(
        'id,amount_cents,fee_cents,status,stripe_fee_cents,net_cents,refunded_cents,created_at,paid_at',
      )
      .eq('estabelecimento_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  );
  const payouts = ready
    ? await stripe.payouts.list({ limit: 5 }, { stripeAccount: linked.account_id })
    : { data: [] };
  return res.status(200).json({
    ...config,
    linked: true,
    enabled: linked.enabled,
    ready,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    requirements: account.requirements?.currently_due?.length || 0,
    schedule: account.settings?.payouts?.schedule?.interval || null,
    orders,
    payouts: payouts.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      status: p.status,
      arrivalDate: p.arrival_date,
    })),
  });
}
export async function connectWebhook(stripe: Stripe, db: SupabaseClient, event: Stripe.Event) {
  if (!event.account) return;
  const known = await checked(
    db.from('connect_accounts').select('*').eq('account_id', event.account).maybeSingle(),
  );
  if (!known) return;
  const obj = event.data.object as any;
  if (obj.object === 'checkout.session' && obj.metadata?.purpose === 'connect_order') {
    const o = await checked(
      db
        .from('connect_orders')
        .select('*')
        .eq('id', obj.metadata.orderId)
        .eq('account_id', event.account)
        .maybeSingle(),
    );
    if (!o) throw new BillingError(409, 'Pedido ainda não registrado.');
    // Signed event can arrive before the create-session database response.
    if (!o.session_id) {
      await checked(
        db
          .from('connect_orders')
          .update({ session_id: obj.id })
          .eq('id', o.id)
          .is('session_id', null),
      );
      o.session_id = obj.id;
    }
    await reconcileConnect(stripe, db, o);
  } else if (obj.object === 'charge' || obj.object === 'dispute') {
    let intent = objectId(obj.payment_intent);
    if (!intent && obj.object === 'dispute' && objectId(obj.charge)) {
      const charge = await stripe.charges.retrieve(
        objectId(obj.charge)!,
        {},
        { stripeAccount: event.account },
      );
      intent = objectId(charge.payment_intent);
    }
    const o = await checked(
      db
        .from('connect_orders')
        .select('*')
        .eq('payment_intent_id', intent || 'none')
        .eq('account_id', event.account)
        .maybeSingle(),
    );
    if (o) await reconcileConnect(stripe, db, o);
  }
}
