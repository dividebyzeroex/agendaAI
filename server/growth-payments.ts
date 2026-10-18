import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './http.js';
import { BillingError, billingClients } from './billing.js';
import { connectConfig, ensureSession, reconcileConnect } from './connect.js';
import { isUuid } from './security.js';
export const CLUB_TERMS = 'club-monthly-2026-10-16-v1';
async function checked(q: PromiseLike<any>) {
  const r = await q;
  if (r.error)
    throw new BillingError(409, r.error.message || 'Não foi possível conferir o pagamento.');
  return r.data;
}
export async function clubForOrder(db: SupabaseClient, orderId: string) {
  const cycle = await checked(
    db.from('club_cycles').select('contract_id').eq('receipt_id', orderId).maybeSingle(),
  );
  if (!cycle) throw new BillingError(409, 'Ciclo do clube indisponível.');
  const club = await checked(
    db.from('club_contracts').select('*').eq('id', cycle.contract_id).single(),
  );
  if (!club.consent_at || club.terms_version !== CLUB_TERMS)
    throw new BillingError(409, 'O cliente precisa autorizar a renovação mensal.');
  return club;
}
export async function assertCollectionAccount(stripe: Stripe, db: SupabaseClient, tenant: string) {
  if (!connectConfig().available) throw new BillingError(503, 'Recebimentos online indisponíveis.');
  const linked = await checked(
    db.from('connect_accounts').select('*').eq('estabelecimento_id', tenant).maybeSingle(),
  );
  if (!linked?.enabled || linked.fee_cents !== 100)
    throw new BillingError(409, 'O estabelecimento precisa ativar os recebimentos online.');
  const account = await stripe.accounts.retrieve(
    linked.account_id,
    {},
    { timeout: 8000, maxNetworkRetries: 0 },
  );
  if (!account.charges_enabled || !account.payouts_enabled)
    throw new BillingError(409, 'O estabelecimento precisa concluir o cadastro Stripe.');
  return linked;
}
export async function clubHandler(
  req: VercelRequest,
  res: VercelResponse,
  db: SupabaseClient,
  stripe: Stripe,
) {
  const action = String(req.query['action']);
  const method = action === 'club-info' ? 'GET' : 'POST';
  if (
    !['club-info', 'club-accept', 'club-cancel', 'club-pay'].includes(action) ||
    req.method !== method
  )
    throw new BillingError(405, 'Método não permitido.');
  const token = method === 'GET' ? req.query['token'] : req.body?.token;
  if (!isUuid(token)) throw new BillingError(404, 'Clube indisponível.');
  const club = await checked(
    db.from('club_contracts').select('*').eq('token', token).maybeSingle(),
  );
  if (!club) throw new BillingError(404, 'Clube indisponível.');
  if (action === 'club-cancel') {
    if (req.body?.confirmed !== true)
      throw new BillingError(400, 'Confirme o cancelamento da renovação.');
    await checked(
      db
        .from('club_contracts')
        .update({
          renew_enabled: false,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', club.id),
    );
    return res.status(200).json({ cancelled: true });
  }
  const tenant = await checked(
    db.from('estabelecimento').select('nome').eq('id', club.estabelecimento_id).single(),
  );
  const cycles = await checked(
    db
      .from('club_cycles')
      .select('receipt_id,pass_id,due_date')
      .eq('contract_id', club.id)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  let receipt: any = null,
    current: any = null;
  let providerReview = false;
  if (cycles?.[0]) {
    receipt = await checked(
      db
        .from('caixa_itens')
        .select('token_publico,status_caixa')
        .eq('id', cycles[0].receipt_id)
        .single(),
    );
    current = await checked(
      db.from('connect_orders').select('*').eq('id', cycles[0].receipt_id).single(),
    );
    if (current.session_id || current.payment_intent_id) {
      try {
        current = await reconcileConnect(stripe, db, current);
      } catch (e) {
        if (action !== 'club-info') throw e;
        providerReview = true;
      }
    }
  }
  if (action === 'club-info') {
    const fresh = await checked(
      db
        .from('club_contracts')
        .select('status,next_due,renew_enabled,consent_at')
        .eq('id', club.id)
        .single(),
    );
    return res.status(200).json({
      name: tenant.nome,
      title: club.title,
      price: club.price,
      sessions: club.sessions,
      status: fresh.status,
      next_due: fresh.next_due,
      renew_enabled: fresh.renew_enabled,
      consent_at: fresh.consent_at,
      providerReview,
      termsVersion: CLUB_TERMS,
      receiptStatus: current?.refund_pending_cents > 0 ? 'refund_pending' : current?.status || null,
      receiptToken: receipt?.token_publico || null,
      terms:
        'Cobrança mensal no cartão autorizado, pelo preço informado. Sessões liberadas somente após confirmação. Saldo não acumula entre ciclos. Cancele a renovação por este link antes da próxima cobrança. Uma cobrança já iniciada pode ser concluída; reembolsos são tratados com o estabelecimento.',
    });
  }
  if (club.status === 'cancelled')
    throw new BillingError(409, 'A renovação deste clube foi cancelada.');
  await assertCollectionAccount(stripe, db, club.estabelecimento_id);
  if (action === 'club-accept') {
    if (req.body?.accepted !== true || req.body?.termsVersion !== CLUB_TERMS)
      throw new BillingError(400, 'Autorize as condições e a cobrança mensal antes de continuar.');
    const cycle = await checked(
      db.rpc('claim_club_cycle', { p_contract: club.id, p_accept: true }),
    );
    current = await checked(
      db.from('connect_orders').select('*').eq('id', cycle.order_id).single(),
    );
    receipt = { token_publico: cycle.receipt_token };
  }
  if (!current || !['pending', 'expired'].includes(current.status))
    throw new BillingError(409, 'Não há mensalidade pendente. Atualize o clube.');
  // Resolve/cancel a failed off-session attempt before creating an on-session replacement.
  if (current.payment_intent_id && !current.session_id) {
    const intent = await stripe.paymentIntents.retrieve(
      current.payment_intent_id,
      {},
      { stripeAccount: current.account_id, timeout: 8000, maxNetworkRetries: 0 },
    );
    if (intent.status === 'succeeded') {
      await reconcileConnect(stripe, db, current);
      return res.status(200).json({ paid: true });
    }
    if (intent.status === 'processing' || intent.status === 'requires_capture')
      throw new BillingError(409, 'Há um pagamento em processamento. Aguarde a confirmação.');
    if (intent.status !== 'canceled')
      await stripe.paymentIntents.cancel(
        intent.id,
        {},
        {
          stripeAccount: current.account_id,
          idempotencyKey: 'club-recover-cancel:' + intent.id,
          timeout: 8000,
          maxNetworkRetries: 0,
        },
      );
    current = await checked(
      db.rpc('restart_club_checkout', {
        p_order: current.id,
        p_session: null,
        p_intent: intent.id,
      }),
    );
  } else if (current.session_id && current.status === 'expired') {
    const previous = await stripe.checkout.sessions.retrieve(
      current.session_id,
      {},
      { stripeAccount: current.account_id, timeout: 8000, maxNetworkRetries: 0 },
    );
    if (previous.status !== 'expired')
      throw new BillingError(409, 'A tentativa anterior ainda está em processamento.');
    current = await checked(
      db.rpc('restart_club_checkout', {
        p_order: current.id,
        p_session: current.session_id,
        p_intent: current.payment_intent_id,
      }),
    );
  } else if (!current.session_id) {
    const cycle = await checked(
      db.from('club_cycles').select('debit_claimed_at').eq('receipt_id', current.id).single(),
    );
    if (cycle.debit_claimed_at)
      throw new BillingError(
        409,
        'O resultado do débito está em conferência. Fale com o estabelecimento antes de tentar outro pagamento.',
      );
  }
  const session = await ensureSession(stripe, db, current, receipt.token_publico);
  if (!session.url?.startsWith('https://checkout.stripe.com/'))
    throw new BillingError(409, 'Pagamento em confirmação. Atualize a página.');
  return res.status(200).json({ url: session.url });
}

/** One provider attempt per claimed cycle. Unknown outcomes require reconciliation, never a blind debit. */
export async function runClubRenewals(deps: { db?: any; stripe?: any; now?: () => number } = {}) {
  if (!connectConfig().available) return { ready: false, attempted: 0, review: 0 };
  const clients = deps.db && deps.stripe ? deps : billingClients();
  const db = clients.db!,
    stripe = clients.stripe!;
  const now = deps.now || Date.now,
    deadline = now() + 20000;
  const today = new Date(now()).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const clubs = await checked(
    db
      .from('club_contracts')
      .select('id,estabelecimento_id')
      .eq('renew_enabled', true)
      .in('status', ['active', 'past_due'])
      .lte('next_due', today)
      .order('next_due')
      .limit(5),
  );
  let attempted = 0,
    review = 0;
  for (const c of clubs || []) {
    if (now() >= deadline) break;
    try {
      await assertCollectionAccount(stripe, db, c.estabelecimento_id);
      const claim = await checked(
        db.rpc('claim_club_cycle', { p_contract: c.id, p_accept: false }),
      );
      if (!claim.claimed) continue;
      const order = await checked(
        db.from('connect_orders').select('*').eq('id', claim.order_id).single(),
      );
      attempted++;
      let intent: any;
      try {
        intent = await stripe.paymentIntents.create(
          {
            amount: Number(order.amount_cents),
            currency: 'brl',
            customer: claim.customer_id,
            payment_method: claim.payment_method_id,
            off_session: true,
            confirm: true,
            payment_method_types: ['card'],
            application_fee_amount: 100,
            metadata: {
              purpose: 'connect_order',
              orderId: order.id,
              checkoutAttempt: String(order.checkout_attempt || 0),
            },
          },
          {
            stripeAccount: order.account_id,
            idempotencyKey: 'club-debit:' + claim.cycle_id,
            timeout: 8000,
            maxNetworkRetries: 0,
          },
        );
      } catch (e: any) {
        intent = e?.payment_intent;
      }
      if (intent?.id) {
        await checked(
          db
            .from('connect_orders')
            .update({ payment_intent_id: intent.id })
            .eq('id', order.id)
            .is('payment_intent_id', null),
        );
        if (intent.status === 'succeeded')
          await reconcileConnect(stripe, db, { ...order, payment_intent_id: intent.id });
        else {
          await checked(
            db
              .from('club_contracts')
              .update({ status: 'past_due' })
              .eq('id', c.id)
              .neq('status', 'cancelled'),
          );
          review++;
        }
      } else {
        await checked(
          db
            .from('club_contracts')
            .update({ status: 'past_due' })
            .eq('id', c.id)
            .neq('status', 'cancelled'),
        );
        review++;
      }
    } catch {
      review++;
    }
  }
  return { ready: true, attempted, review };
}

/** Frees holds only after Stripe confirms expiration or a complete lookup proves no session exists. */
export async function maintainDepositHolds(deps: { db?: any; stripe?: any } = {}) {
  if (!connectConfig().available) return { checked: 0 };
  const clients = deps.db && deps.stripe ? deps : billingClients();
  const db = clients.db!,
    stripe = clients.stripe!;
  const orders = await checked(
    db
      .from('connect_orders')
      .select('*')
      .eq('purpose', 'deposit')
      .eq('status', 'pending')
      .lte('created_at', new Date(Date.now() - 35 * 60000).toISOString())
      .order('created_at')
      .limit(5),
  );
  let count = 0;
  const deadline = Date.now() + 20000;
  for (const order of orders || []) {
    if (Date.now() >= deadline) break;
    if (!order.session_id) {
      if (Date.now() - Date.parse(order.created_at) < 40 * 60000) continue;
      const start = Math.floor(Date.parse(order.created_at) / 1000);
      const list = await stripe.checkout.sessions.list(
        { created: { gte: start - 60, lte: start + 300 }, limit: 100 },
        { stripeAccount: order.account_id, timeout: 8000, maxNetworkRetries: 0 },
      );
      const found = list.data.find((s: any) => s.metadata?.orderId === order.id);
      if (found) {
        await checked(
          db
            .from('connect_orders')
            .update({ session_id: found.id })
            .eq('id', order.id)
            .is('session_id', null),
        );
        order.session_id = found.id;
      } else if (!list.has_more) {
        await checked(
          db.rpc('expire_connect_order', {
            p_id: order.id,
            p_account: order.account_id,
            p_session: null,
          }),
        );
        count++;
        continue;
      } else continue;
    }
    await reconcileConnect(stripe, db, order);
    count++;
  }
  return { checked: count };
}

export async function depositReservationResponse(db: SupabaseClient, stripe: Stripe, result: any) {
  const { data: order, error } = await db
    .from('connect_orders')
    .select('*')
    .eq('id', result.receipt_id)
    .single();
  if (error) throw new BillingError(503, 'Reserva registrada. Confira a comanda antes de repetir.');
  let paymentReady = true;
  try {
    if (order.status === 'pending') await ensureSession(stripe, db, order, result.deposit_token);
  } catch {
    paymentReady = false;
  }
  return {
    success: true,
    event: result.event,
    deposit_token: result.deposit_token,
    deposit_amount: result.amount,
    payment_ready: paymentReady,
  };
}

export async function maintainClubPayments(deps: { db?: any; stripe?: any } = {}) {
  if (!connectConfig().available) return { checked: 0 };
  const c = deps.db && deps.stripe ? deps : billingClients(),
    db = c.db!,
    stripe = c.stripe!;
  const orders = await checked(
    db
      .from('connect_orders')
      .select('*')
      .eq('purpose', 'club')
      .eq('status', 'pending')
      .order('reconciled_at', { ascending: true, nullsFirst: true })
      .limit(5),
  );
  let count = 0;
  const deadline = Date.now() + 20000;
  for (const order of orders || []) {
    if (Date.now() >= deadline) break;
    try {
      await reconcileConnect(stripe, db, order);
      await checked(
        db
          .from('connect_orders')
          .update({ reconciled_at: new Date().toISOString() })
          .eq('id', order.id),
      );
      count++;
    } catch {
      /* Leave uncertain attempts visible; never create another debit. */
    }
  }
  return { checked: count };
}
