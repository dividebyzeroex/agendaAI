import { Injectable, inject } from '@angular/core';
import { PRICING_CATALOG, pricingQuote } from '../core/pricing-catalog';
import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { EstabelecimentoService, Estabelecimento } from './estabelecimento.service';
import { SupabaseService } from './supabase.service';
import { CostTrackerService, UsageQuota } from './cost-tracker.service';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface BillingPlan {
  id: string;
  name: string;
  basePrice: number; // Monthly base price
  months: number;    // Selected cycle
  highlight?: boolean;
  features: PlanFeature[];
  tokensLimit: number;
  smsLimit: number;
  price?: number;     // Total price with discount
  discount?: number;  // % off
  status: 'active' | 'preview' | 'legacy';
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'Paga' | 'Pendente' | 'Cancelada';
  pdfUrl?: string;
}


@Injectable({ providedIn: 'root' })
export class BillingService {
  private estabService = inject(EstabelecimentoService);
  private costTracker = inject(CostTrackerService);
  private supabase = inject(SupabaseService).client;


  private fromCatalog(id: keyof typeof PRICING_CATALOG): BillingPlan {
    const plan = PRICING_CATALOG[id];
    return {
      id: plan.id, name: plan.name, basePrice: plan.monthlyCents / 100,
      months: 1, status: plan.status, highlight: id === 'gestao',
      tokensLimit: 0, smsLimit: 0,
      features: plan.features.map(text => ({ text, included: true })),
    };
  }
  plans: BillingPlan[] = (['agenda','gestao','growth'] as const).map(id => this.fromCatalog(id));
  private legacyPlans: BillingPlan[] = (['basico','completo','premium'] as const).map(id => this.fromCatalog(id));

  calculatePlanForCycle(plan: BillingPlan, cycleMonths: number): BillingPlan {
    const { amount, discount } = pricingQuote(plan.id, cycleMonths);
    const totalPrice = amount / 100;

    return {
      ...plan,
      months: cycleMonths,
      price: totalPrice, // Adding dynamic property for checkout
      discount,
      tokensLimit: plan.tokensLimit * cycleMonths,
      smsLimit: plan.smsLimit * cycleMonths
    } as any;
  }

  private invoicesSubject = new BehaviorSubject<Invoice[]>([]);
  invoices$ = this.invoicesSubject.asObservable();

  constructor() {
    this.refreshInvoices();
  }

  async refreshInvoices() {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) return;

  try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/billing?action=invoices&estabelecimentoId=${current.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar faturas');
      }

      if (data.invoices) {
        this.invoicesSubject.next(data.invoices);
      }
    } catch (err) {
      console.error('[BillingService] Failed to fetch invoices:', err);
    }
  }

  /**
   * Official Stripe Checkout Integration
   */
  async processStripeCheckout(planId: string, months: number, termsAccepted: boolean): Promise<string | undefined> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) throw new Error('Estabelecimento ainda não carregado. Atualize a página e tente novamente.');

    let plan = this.plans.find(p => p.id === planId);
    if (!plan || plan.status !== 'active') return undefined;

    // Recalculate with chosen cycle before sending to Stripe!
    plan = this.calculatePlanForCycle(plan, months);

    try {
      // Fetch session token securely via Auth
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

      const response = await fetch('/api/billing?action=checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          estabelecimentoId: current.id,
          planId: plan.id,
          price: plan.price,
          months: plan.months, termsAccepted,
          title: plan.name
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
      if (typeof data.init_point !== 'string' || !data.init_point.startsWith('https://checkout.stripe.com/')) throw new Error('O checkout não retornou um endereço válido. Tente novamente.');
      return data.init_point;
    } catch (err) {
      console.error('[Stripe Billing] Error creating checkout:', err);
      throw err;
    }
  }

  /**
   * Verify Session ID from Stripe Callback
   */
  async verifySession(sessionId: string): Promise<any> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) throw new Error('Estabelecimento não encontrado.');

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const response = await fetch(`/api/billing?action=verify&session_id=${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erro de Servidor (${response.status})`);
      }

      if (data.status === 'success') {
        // Refresh local establishment data (Bypass cache)
        (this.estabService as any)._estabelecimentoCache.clear();
        await this.estabService.fetchEstabelecimento();

        // Refresh Invoices [NEW]
        await this.refreshInvoices();
      }

      return data;
    } catch (err) {
      console.error('[Stripe Billing] Error verifying session:', err);
      throw err;
    }
  }

  /**
   * Cancel Subscription (End recursion at period end)
   */
  async cancelSubscription(): Promise<any> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) throw new Error('Estabelecimento não encontrado.');

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/billing?action=cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estabelecimentoId: current.id })
      });

      const data = await response.json();

      if (data.status === 'cancelled') {
        // Refresh local establishment data to show cancelled status
        (this.estabService as any)._estabelecimentoCache.clear();
        await this.estabService.fetchEstabelecimento();
      }

      return data;
    } catch (err) {
      console.error('[Stripe Billing] Error cancelling subscription:', err);
      throw err;
    }
  }

  /**
   * Status de Assinatura com Regra de 5 dias de Carência
   */
  getSubscriptionStatus(): Observable<'ACTIVE' | 'GRACE_PERIOD' | 'TRIAL' | 'EXPIRED'> {
    return this.estabService.estabelecimento$.pipe(
      map((e: Estabelecimento | null) => {
        if (!e) return 'EXPIRED';

        const now = new Date();

        // 1. Paid Plan Logic
        if (e.plano_expires_at) {
          const expires = new Date(e.plano_expires_at);


          if (now <= expires) return 'ACTIVE';
        }

        // 2. Trial Logic
        if (e.trial_ends_at) {
          const ends = new Date(e.trial_ends_at);
          if (now <= ends) return 'TRIAL';
        }

        return 'EXPIRED';
      })
    );
  }

  getGraceDaysRemaining(): Observable<number> {
    return this.estabService.estabelecimento$.pipe(
      map((e: Estabelecimento | null) => {
        if (!e?.plano_expires_at) return 0;
        const now = new Date();
        const expires = new Date(e.plano_expires_at);
        const graceEnd = new Date(expires);
        graceEnd.setDate(graceEnd.getDate() + 5);

        if (now <= expires) return 5; // Hasn't started grace period yet

        const diff = graceEnd.getTime() - now.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      })
    );
  }

  canAccessAdmin(): Observable<boolean> {
    return this.getSubscriptionStatus().pipe(
      map(status => status !== 'EXPIRED')
    );
  }

  getCurrentPlan(): Observable<BillingPlan | undefined> {
    return this.estabService.estabelecimento$.pipe(
      map((e: Estabelecimento | null) => {
        if (!e) return undefined;

        // 1. Check if user has an active paid plan based on plano_expires_at
        if (e.plano_expires_at) {
          const now = new Date();
          const expires = new Date(e.plano_expires_at);
          if (expires > now && e.plano) {
            return [...this.plans, ...this.legacyPlans].find(p => p.id === e.plano);
          }
        }

        // 2. Check if Trial is still active
        if (e.trial_ends_at) {
          const now = new Date();
          const ends = new Date(e.trial_ends_at);
          if (ends > now) {
            // Give default 1_month features during trial
            return this.plans.find(p => p.id === 'agenda');
          }
        }

        return undefined;
      })
    );
  }

  getTrialDaysRemaining(): Observable<number> {
    return this.estabService.estabelecimento$.pipe(
      map((e: Estabelecimento | null) => {
        if (!e?.trial_ends_at) return 0;
        const now = new Date().getTime();
        const ends = new Date(e.trial_ends_at).getTime();
        const diff = ends - now;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      })
    );
  }

  isTrialActive(): Observable<boolean> {
    return this.estabService.estabelecimento$.pipe(
      map((e: Estabelecimento | null) => !!e?.trial_ends_at && !(e.plano_expires_at && new Date(e.plano_expires_at) > new Date()) && new Date(e.trial_ends_at) > new Date())
    );
  }

  getUsage(): Observable<UsageQuota> {
    return this.costTracker.quota$;
  }
}
