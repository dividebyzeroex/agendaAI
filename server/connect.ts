import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './http.js';
import { authenticate, BillingError, objectId, ownedEstablishment } from './billing.js';
const TERMS = 'connect-2026-10-16-r1';
const FEE = 100;
// Use the compatible API only after a definitive v2 rejection. Stripe independently checks the same key on v1; never retry uncertain creation through another API.
function legacyConnectAllowed(error: any) {
  return (
    error?.code === 'accounts_v2_access_blocked' ||
    (error?.type === 'StripePermissionError' && error?.statusCode === 403)
  );
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
    if (!legacyConnectAllowed(error)) annotateConnectFailure(error, 'create_account_v2');
    try {
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
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { estabelecimentoId: tenantId },
        },
        { idempotencyKey: 'connect-account-v1-cards-transfers:' + tenantId },
      );
    } catch (error) {
      annotateConnectFailure(error, 'create_account_v1');
    }
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
      annotateConnectFailure(error, 'create_link_v2');
    try {
      return await stripe.accountLinks.create({
        account: accountId,
        type: 'account_onboarding',
        refresh_url: base + '?connect=refresh',
        return_url: base + '?connect=return',
      });
    } catch (error) {
      annotateConnectFailure(error, 'create_link_v1');
    }
  }
}
export function connectDiagnostics(error: any) {
  const safe = (value: unknown, pattern: RegExp, max = 100) =>
    typeof value === 'string' && value.length <= max && pattern.test(value) ? value : null;
  const text = String(error?.message || error?.raw?.message || '');
  const scopes = [...new Set(text.match(/\brak_[a-z0-9_]+\b/g) || [])].slice(0, 10);
  const key = process.env['STRIPE_SECRET_KEY'] || '';
  return {
    operation: safe(error?.connectOperation, /^[a-z0-9_]+$/),
    type: safe(error?.type, /^[A-Za-z]+$/),
    code: safe(error?.code, /^[a-z0-9_]+$/),
    param: safe(error?.param, /^[A-Za-z0-9_.\[\]]+$/),
    status: Number.isInteger(error?.statusCode) ? error.statusCode : null,
    requestId: safe(error?.requestId, /^req_[A-Za-z0-9]+$/),
    requiredPermissions: scopes,
    keySource: 'STRIPE_SECRET_KEY',
    keySuffix: /^(rk|sk)_(live|test)_[A-Za-z0-9]+$/.test(key) ? key.slice(-4) : null,
  };
}
function annotateConnectFailure(error: any, operation: string): never {
  if (error && typeof error === 'object') error.connectOperation = operation;
  throw error;
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
  if (error?.type === 'StripeAuthenticationError')
    return new BillingError(
      503,
      'A Stripe recusou a autenticação da chave da plataforma. Confira se a chave cadastrada na Vercel está ativa e pertence à conta correta.',
    );
  if (error?.type === 'StripePermissionError')
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
export function validateClubIntent(o: any, pi: Stripe.PaymentIntent) {
  if (
    o.purpose !== 'club' ||
    o.session_id ||
    pi.status !== 'succeeded' ||
    pi.currency !== 'brl' ||
    pi.amount !== Number(o.amount_cents) ||
    pi.amount_received !== Number(o.amount_cents) ||
    pi.application_fee_amount !== 100 ||
    o.fee_cents !== 100 ||
    pi.metadata?.['purpose'] !== 'connect_order' ||
    pi.metadata?.['orderId'] !== o.id ||
    (o.payment_intent_id && o.payment_intent_id !== pi.id)
  )
    throw new BillingError(409, 'Débito do clube não confere com o ciclo.');
}
export async function reconcileConnect(stripe: Stripe, db: SupabaseClient, o: any) {
  if (
    o.purpose === 'club' &&
    !o.session_id &&
    !o.payment_intent_id &&
    stripe.paymentIntents.search
  ) {
    const found = await stripe.paymentIntents.search(
      { query: `metadata['orderId']:'${o.id}'`, limit: 10 },
      { stripeAccount: o.account_id, timeout: 8000, maxNetworkRetries: 0 },
    );
    const matches = found.data.filter(
      (p) => Number(p.metadata?.['checkoutAttempt'] || 0) === Number(o.checkout_attempt || 0),
    );
    if (matches.length > 1 || found.has_more)
      throw new BillingError(
        409,
        'Há mais de uma tentativa para conferir. Revise a Stripe antes de continuar.',
      );
    if (matches.length === 1) {
      await checked(
        db
          .from('connect_orders')
          .update({ payment_intent_id: matches[0].id })
          .eq('id', o.id)
          .is('payment_intent_id', null),
      );
      o = { ...o, payment_intent_id: matches[0].id };
    }
  }
  if (!o.session_id && !(o.purpose === 'club' && o.payment_intent_id)) return o;
  const options = { stripeAccount: o.account_id, timeout: 8000, maxNetworkRetries: 0 };
  const session = o.session_id
    ? await stripe.checkout.sessions.retrieve(o.session_id, {}, options)
    : null;
  if (session?.status === 'expired') {
    await checked(
      db.rpc('expire_connect_order', {
        p_id: o.id,
        p_account: o.account_id,
        p_session: session.id,
      }),
    );
    return { ...o, status: o.status === 'pending' ? 'expired' : o.status };
  }
  if (session && session.payment_status !== 'paid') return o;
  const id = session ? objectId(session.payment_intent) : o.payment_intent_id;
  if (!id) throw new BillingError(409, 'Pagamento ainda em confirmação.');
  const pi = await stripe.paymentIntents.retrieve(
    id,
    { expand: ['latest_charge.balance_transaction'] },
    options,
  );
  if (session) validateConnectPayment(o, session, pi);
  else {
    if (pi.status !== 'succeeded') return o;
    validateClubIntent(o, pi);
  }
  if (o.purpose === 'club' && (!objectId(pi.customer) || !objectId(pi.payment_method)))
    throw new BillingError(409, 'Cartão do clube ainda não confirmado.');
  if (o.purpose === 'club') {
    const club = await (await import('./growth-payments.js')).clubForOrder(db, o.id);
    if (
      club.account_id !== o.account_id ||
      (club.customer_id && club.customer_id !== objectId(pi.customer))
    )
      throw new BillingError(409, 'Cliente do débito divergente.');
  }
  const paymentCharge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const paidAt = new Date(
    (paymentCharge?.created || session?.created || pi.created) * 1000,
  ).toISOString();
  await checked(
    db.rpc('settle_connect_order', {
      p_id: o.id,
      p_account: o.account_id,
      p_session: session?.id || null,
      p_intent: pi.id,
      p_amount: session ? session.amount_total : pi.amount_received,
      p_fee: pi.application_fee_amount,
      p_paid_at: paidAt,
    }),
  );
  if (o.purpose === 'club')
    await checked(
      db.rpc('bind_club_card', {
        p_order: o.id,
        p_customer: objectId(pi.customer),
        p_method: objectId(pi.payment_method),
      }),
    );
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const balance =
    charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
  const patch: any = {
    charge_id: charge?.id || null,
    reconciled_at: new Date().toISOString(),
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
    patch.refunded_cents = 0;
    patch.refund_pending_cents = 0;
    if (charge.amount_refunded > 0 && stripe.refunds?.list) {
      const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 }, options);
      const records = refunds.data
        .filter((r) => r.status === 'succeeded')
        .map((r) => ({
          id: r.id,
          order_id: o.id,
          estabelecimento_id: o.estabelecimento_id,
          amount_cents: r.amount,
          paid_at: new Date(r.created * 1000).toISOString(),
        }));
      patch.refunded_cents = records.reduce((sum, r) => sum + r.amount_cents, 0);
      patch.refund_pending_cents = Math.max(0, charge.amount_refunded - patch.refunded_cents);
      if (records.length)
        await checked(db.from('connect_refunds').upsert(records, { onConflict: 'id' }));
      if (records.length)
        patch.refunded_at = records
          .map((r) => r.paid_at)
          .sort()
          .at(-1);
    }
    if (charge.amount_refunded > 0) {
      patch.fee_refunds_checked = false;
      const feeId = objectId(charge.application_fee);
      if (feeId && stripe.applicationFees?.listRefunds) {
        try {
          const list = await stripe.applicationFees.listRefunds(
            feeId,
            { limit: 100 },
            { timeout: 8000, maxNetworkRetries: 0 },
          );
          const rows = list.data.map((r) => ({
            id: r.id,
            order_id: o.id,
            estabelecimento_id: o.estabelecimento_id,
            amount_cents: r.amount,
            paid_at: new Date(r.created * 1000).toISOString(),
          }));
          if (rows.length)
            await checked(db.from('connect_fee_refunds').upsert(rows, { onConflict: 'id' }));
          patch.fee_refunds_checked = !list.has_more;
        } catch {
          /* Keep the missing fee detail explicit without undoing a confirmed payment. */
        }
      }
    }
    patch.status =
      patch.refunded_cents >= Number(o.amount_cents) ? 'refunded' : disputed ? 'disputed' : 'paid';
  }
  await checked(db.from('connect_orders').update(patch).eq('id', o.id));
  if (patch.status === 'refunded') {
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
export async function ensureSession(stripe: Stripe, db: SupabaseClient, order: any, token: string) {
  let session: Stripe.Checkout.Session;
  let club: any = null;
  if (order.purpose === 'club')
    club = await (await import('./growth-payments.js')).clubForOrder(db, order.id);
  const epoch = Date.parse(order.checkout_epoch || order.created_at);
  const lifetime = order.purpose === 'deposit' ? 35 * 60 : 24 * 3600;
  if (order.session_id)
    session = await stripe.checkout.sessions.retrieve(
      order.session_id,
      {},
      { stripeAccount: order.account_id },
    );
  else {
    // Reuse the email collected by the establishment when the customer provided one.
    // Stripe hosts all sensitive payment fields; no new merchant-side card form.
    let checkoutEmail: string | undefined;
    if (order.purpose !== 'club') {
      const {data} = await db.from('caixa_itens')
        .select('email_cliente')
        .eq('id', order.id)
        .eq('estabelecimento_id', order.estabelecimento_id)
        .maybeSingle();
      const candidate = String(data?.email_cliente || '').trim();
      if (candidate.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate))
        checkoutEmail = candidate;
    }
    // Do not create a second session after Stripe's 24-hour idempotency retention.
    if (Date.now() - epoch > (order.purpose === 'deposit' ? 4 * 60000 : 23 * 3600000))
      throw new BillingError(409, 'Peça ao estabelecimento para revisar esta cobrança.');
    const url = club ? `${origin()}/clube/${club.token}` : `${origin()}/comanda/${token}`;
    const integration = !club
      ? await checked(
          db
            .from('tenant_integrations')
            .select('pix_enabled')
            .eq('estabelecimento_id', order.estabelecimento_id)
            .maybeSingle(),
        )
      : null;
    let pixReady = false;
    if (!club && integration?.pix_enabled) {
      try {
        const account = await stripe.accounts.retrieve(
          order.account_id,
          {},
          { timeout: 8000, maxNetworkRetries: 0 },
        );
        pixReady = account.charges_enabled && account.capabilities?.pix_payments === 'active';
      } catch {
        /* Keep card available if Pix eligibility cannot be verified. */
      }
    }
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: pixReady ? ['card', 'pix'] : ['card'],
        ...(checkoutEmail ? { customer_email: checkoutEmail } : {}),
        ...(club
          ? club.customer_id
            ? { customer: club.customer_id }
            : { customer_creation: 'always' as const }
          : {}),
        ...(club
          ? {
              custom_text: {
                submit: {
                  message: `Clube mensal: R$ ${Number(club.price).toFixed(2)} por mês. Renovação autorizada; cancele pelo link do clube antes do próximo débito. Sessões não acumulam.`,
                },
              },
            }
          : {}),
        client_reference_id: order.id,
        metadata: {
          purpose: 'connect_order',
          orderId: order.id,
          checkoutAttempt: String(order.checkout_attempt || 0),
        },
        payment_intent_data: {
          application_fee_amount: order.fee_cents,
          ...(club ? { setup_future_usage: 'off_session' as const } : {}),
          metadata: {
            purpose: 'connect_order',
            orderId: order.id,
            checkoutAttempt: String(order.checkout_attempt || 0),
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: Number(order.amount_cents),
              product_data: {
                name: club
                  ? club.title + ' · ciclo mensal'
                  : order.purpose === 'deposit'
                    ? 'Sinal da reserva'
                    : 'Atendimento e produtos do estabelecimento',
              },
            },
          },
        ],
        expires_at: Math.floor(epoch / 1000) + lifetime,
        success_url: url + '?pagamento=confirmando',
        cancel_url: url,
      },
      {
        stripeAccount: order.account_id,
        idempotencyKey:
          'connect-order:' +
          order.id +
          (order.checkout_attempt ? ':' + order.checkout_attempt : ''),
        timeout: 8000,
        maxNetworkRetries: 0,
      },
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
      .select('id,token_publico,status_caixa,forma_pagamento,pago_em,profissional')
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
    'connect-reconcile': 'POST',
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
    if (!order) {
      if (action === 'connect-pay')
        throw new BillingError(409, 'Este recebimento foi registrado fora do AgendaAI. Solicite ao estabelecimento a correção antes de pagar pelo link.');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        online: false,
        status: receipt.status_caixa,
        paymentMethod: receipt.forma_pagamento,
        paidAt: receipt.pago_em,
        source: 'merchant_recorded',
        professional: receipt.profissional || null,
      });
    }
    const current = await reconcileConnect(stripe, db, order);
    if (action === 'connect-receipt') {
      let reservationStatus: string | null = null;
      if (order.purpose === 'deposit') {
        const dep = await checked(
          db.from('booking_deposits').select('event_id').eq('receipt_id', order.id).maybeSingle(),
        );
        if (dep) {
          const event = await checked(
            db.from('agenda_events').select('status').eq('id', dep.event_id).single(),
          );
          reservationStatus = event.status;
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        online: true,
        status: current.refund_pending_cents > 0 ? 'refund_pending' : current.status,
        purpose: order.purpose,
        reservationStatus,
        paymentMethod: 'stripe_connect',
        paidAt: current.status === 'paid' ? current.paid_at : null,
        professional: receipt.profissional || null,
      });
    }
    if (order.purpose === 'club')
      throw new BillingError(
        409,
        'Use o link de adesão do clube para pagar ou regularizar o cartão.',
      );
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
    const base = origin() + '/admin/recebimentos';
    const link = await createConnectedOnboardingLink(stripe, linked.account_id, base);
    return res.status(200).json({ url: link.url });
  }
  if (action === 'connect-reconcile') {
    const month = String(req.body?.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BillingError(400, 'Competência inválida.');
    if (!linked) return res.status(200).json({ checked: 0, review: 0 });
    const since = new Date(month + '-01T00:00:00-03:00'),
      until = new Date(since);
    until.setUTCMonth(until.getUTCMonth() + 1);
    const orders = await checked(
      db
        .from('connect_orders')
        .select('*')
        .eq('estabelecimento_id', id)
        .gte('created_at', since.toISOString())
        .lt('created_at', until.toISOString())
        .order('reconciled_at', { ascending: true, nullsFirst: true })
        .limit(10),
    );
    let count = 0,
      review = 0;
    const deadline = Date.now() + 20000;
    for (const o of orders || []) {
      if (Date.now() >= deadline) break;
      try {
        await reconcileConnect(stripe, db, o);
        await checked(
          db
            .from('connect_orders')
            .update({ reconciled_at: new Date().toISOString() })
            .eq('id', o.id),
        );
        count++;
      } catch {
        review++;
      }
    }
    return res.status(200).json({ checked: count, review });
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
    if (!enabled)
      await checked(
        db.from('business_settings').update({ deposit_percent: 0 }).eq('estabelecimento_id', id),
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
      if (o.purpose === 'club' && !o.session_id) {
        if (!o.payment_intent_id) {
          const cycle = await checked(
            db.from('club_cycles').select('debit_claimed_at').eq('receipt_id', o.id).single(),
          );
          if (cycle.debit_claimed_at)
            throw new BillingError(
              409,
              'Débito em conferência. Não gere outro pagamento antes de conferir a Stripe.',
            );
        } else {
          const pi = await stripe.paymentIntents.retrieve(
            o.payment_intent_id,
            {},
            { stripeAccount: o.account_id, timeout: 8000, maxNetworkRetries: 0 },
          );
          if (pi.status === 'succeeded')
            return res.status(200).json({ status: (await reconcileConnect(stripe, db, o)).status });
          if (pi.status === 'processing' || pi.status === 'requires_capture')
            throw new BillingError(409, 'Débito em processamento. Aguarde a confirmação.');
          if (pi.status !== 'canceled')
            await stripe.paymentIntents.cancel(
              pi.id,
              {},
              { stripeAccount: o.account_id, idempotencyKey: 'connect-cancel:' + o.id },
            );
          await checked(
            db.rpc('expire_connect_order', {
              p_id: o.id,
              p_account: o.account_id,
              p_session: null,
            }),
          );
          return res.status(200).json({ status: 'expired' });
        }
      }
      const s = await ensureSession(stripe, db, o, receipt.token_publico);
      o.session_id = s.id;
      if (s.status === 'open')
        await stripe.checkout.sessions.expire(s.id, {}, { stripeAccount: o.account_id });
    } else {
      const current = await reconcileConnect(stripe, db, o);
      if (current.status !== 'paid' || !current.payment_intent_id)
        throw new BillingError(409, 'Pagamento indisponível para reembolso.');
      await preparePassRefund(db, o.id);
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
export async function preparePassRefund(db: SupabaseClient, receiptId: string) {
  const { error } = await db.rpc('prepare_growth_refund', { p_receipt: receiptId });
  if (error)
    throw new BillingError(
      409,
      'O pacote não pode ser reembolsado agora. Estorne sessões utilizadas ou confira a situação do passe.',
    );
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
    if (Number(obj.metadata.checkoutAttempt || 0) !== Number(o.checkout_attempt || 0)) return;
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
  } else if (obj.object === 'payment_intent' && obj.metadata?.purpose === 'connect_order') {
    const o = await checked(
      db
        .from('connect_orders')
        .select('*')
        .eq('id', obj.metadata.orderId)
        .eq('account_id', event.account)
        .eq('purpose', 'club')
        .maybeSingle(),
    );
    if (o) {
      if (Number(obj.metadata.checkoutAttempt || 0) !== Number(o.checkout_attempt || 0)) return;
      if (o.payment_intent_id && o.payment_intent_id !== obj.id)
        throw new BillingError(409, 'Débito divergente.');
      if (!o.payment_intent_id) {
        await checked(
          db
            .from('connect_orders')
            .update({ payment_intent_id: obj.id })
            .eq('id', o.id)
            .is('payment_intent_id', null),
        );
        o.payment_intent_id = obj.id;
      }
      await reconcileConnect(stripe, db, o);
    }
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
