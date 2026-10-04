import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { authenticate, ownedEstablishment, quote, subscriptionPatch, subscriptionPeriodEnd } from '../server/billing.js';

function subscription(overrides: Record<string, unknown> = {}) {
  return { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { planId: 'completo' }, latest_invoice: 'in_1', items: { data: [{ current_period_end: 1800000000, quantity: 1, price: { currency: 'brl', unit_amount: 56145, recurring: { interval: 'month', interval_count: 3 } } }] }, ...overrides } as unknown as Stripe.Subscription;
}
const paidInvoice = { id: 'in_1', status: 'paid' } as Stripe.Invoice;

describe('server billing catalog', () => {
  it('uses exact cent prices and approved cycle discounts', () => {
    expect(quote('basico', 1).amount).toBe(9700);
    expect(quote('completo', 3).amount).toBe(56145);
    expect(quote('premium', 6).amount).toBe(188460);
    expect(quote('premium', 12).amount).toBe(335040);
  });
  it('rejects inherited keys, fake plans and unsupported cycles', () => {
    for (const [plan, cycle] of [['toString', 1], ['__proto__', 1], ['starter', 1], ['basico', -1], ['basico', 2], ['basico', '12']]) expect(() => quote(plan, cycle)).toThrow();
  });
});
describe('billing authorization', () => {
  it('fails closed with missing/malformed authentication', async () => {
    const db = { auth: { getUser: vi.fn() } } as any;
    await expect(authenticate(db, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(db, 'Basic token')).rejects.toMatchObject({ status: 401 });
    expect(db.auth.getUser).not.toHaveBeenCalled();
  });
  it('rejects another tenants establishment even with a valid token', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    await expect(ownedEstablishment({ from: () => query } as any, '11111111-1111-1111-1111-111111111111', 'user-a')).rejects.toMatchObject({ status: 403 });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a');
  });
});
describe('Stripe reconciliation', () => {
  it('repeated verification has identical expiry and never adds calendar months', () => {
    const sub = subscription();
    const first = subscriptionPatch(sub, paidInvoice);
    expect(subscriptionPatch(sub, paidInvoice)).toEqual(first);
    expect(first['plano_expires_at']).toBe(new Date(1800000000 * 1000).toISOString());
    expect(first['stripe_mrr_cents']).toBe(18715);
  });
  it('does not grant renewed time for unpaid invoices or stale invoice events', () => {
    expect(subscriptionPatch(subscription(), { ...paidInvoice, status: 'open' })['plano_expires_at']).toBeUndefined();
    expect(subscriptionPatch(subscription({ latest_invoice: 'in_new' }), paidInvoice)['plano_expires_at']).toBeUndefined();
    expect(subscriptionPatch(subscription({ status: 'past_due' }), paidInvoice)['plano_expires_at']).toBeUndefined();
  });
  it('preserves paid access through end-of-period cancellation, revokes terminated subscriptions', () => {
    expect(subscriptionPatch(subscription({ cancel_at_period_end: true }), paidInvoice)).toMatchObject({ stripe_subscription_status: 'canceled_at_period_end', plano: 'completo' });
    expect(subscriptionPatch(subscription({ status: 'canceled' }), paidInvoice)).toMatchObject({ stripe_mrr_cents: 0, plano: 'starter', plano_expires_at: new Date(0).toISOString() });
  });
  it('reads modern item periods and fails closed without a real period', () => {
    expect(subscriptionPeriodEnd(subscription())).toBe(new Date(1800000000 * 1000).toISOString());
    expect(() => subscriptionPeriodEnd(subscription({ items: { data: [] } }))).toThrow();
  });
});
