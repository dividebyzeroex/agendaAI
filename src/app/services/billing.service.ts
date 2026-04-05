import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { EstabelecimentoService } from './estabelecimento.service';
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
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'Paga' | 'Pendente' | 'Cancelada';
  pdfUrl?: string;
}

declare var pagarme: any;

@Injectable({ providedIn: 'root' })
export class BillingService {
  private estabService = inject(EstabelecimentoService);
  private costTracker = inject(CostTrackerService);
  private supabase = inject(SupabaseService).client;

  // Official structure for Pagar.me integration
  private readonly ENCRYPTION_KEY = 'ek_test_6D1y1x9z0A2B3C4D5E6F'; 

  plans: BillingPlan[] = [
    {
      id: 'basico',
      name: 'Starter',
      basePrice: 97,
      months: 1,
      tokensLimit: 250000,
      smsLimit: 50,
      features: [
        { text: 'Agenda Online Completa', included: true },
        { text: '1 Profissional', included: true },
        { text: 'Insights de IA Essenciais', included: true },
        { text: 'Base de Clientes Elite', included: true },
        { text: 'Sincronização Cloud', included: true },
      ]
    },
    {
      id: 'completo',
      name: 'Business Pro',
      basePrice: 197,
      months: 1,
      highlight: true,
      tokensLimit: 1000000,
      smsLimit: 200,
      features: [
        { text: 'Tudo do Starter', included: true },
        { text: 'Até 5 Profissionais', included: true },
        { text: 'IA de Agendamento Autônomo', included: true },
        { text: 'Relatórios de Gestão V2', included: true },
        { text: 'Elite Visual Customization', included: true },
      ]
    },
    {
      id: 'premium',
      name: 'Elite Enterprise',
      basePrice: 349,
      months: 1,
      tokensLimit: 5000000,
      smsLimit: 1000,
      features: [
        { text: 'Tudo do Business Pro', included: true },
        { text: 'Profissionais Ilimitados', included: true },
        { text: 'IA Preditiva de Faturamento', included: true },
        { text: 'API de Integração Direta', included: true },
        { text: 'Suporte VIP 24/7 Dedicado', included: true },
      ]
    }
  ];

  calculatePlanForCycle(plan: BillingPlan, cycleMonths: number): BillingPlan {
    let discount = 0;
    if (cycleMonths === 3) discount = 5;
    if (cycleMonths === 6) discount = 10;
    if (cycleMonths === 12) discount = 20;

    const totalPrice = Math.round(((plan.basePrice || plan.price || 0) * cycleMonths) * (1 - discount / 100));
    
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
  async processStripeCheckout(planId: string, months: number): Promise<string | undefined> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) return undefined;

    let plan = this.plans.find(p => p.id === planId);
    if (!plan) return undefined;

    // Recalculate with chosen cycle before sending to Stripe!
    plan = this.calculatePlanForCycle(plan, months);

    try {
      // Fetch session token securely via Auth
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) return undefined;

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
          months: plan.months,
          title: plan.name
        })
      });

      const data = await response.json();
      return data.init_point; // Stripe Checkout URL
    } catch (err) {
      console.error('[Stripe Billing] Error creating checkout:', err);
      return undefined;
    }
  }

  /**
   * Verify Session ID from Stripe Callback
   */
  async verifySession(sessionId: string): Promise<any> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) throw new Error('Estabelecimento não encontrado.');

    try {
      const response = await fetch(`/api/billing?action=verify&session_id=${sessionId}`);
      const data = await response.json();
      
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

  getCurrentPlan(): Observable<BillingPlan | undefined> {
    return this.estabService.estabelecimento$.pipe(
      map(e => {
        if (!e) return undefined;
        
        // 1. Check if user has an active paid plan based on plano_expires_at
        if (e.plano_expires_at) {
          const now = new Date();
          const expires = new Date(e.plano_expires_at);
          if (expires > now && e.plano) {
            return this.plans.find(p => p.id === e.plano);
          }
        }
        
        // 2. Check if Trial is still active
        if (e.trial_ends_at) {
          const now = new Date();
          const ends = new Date(e.trial_ends_at);
          if (ends > now) {
            // Give default 1_month features during trial
            return this.plans.find(p => p.id === '1_month');
          }
        }
        
        return undefined;
      })
    );
  }

  getTrialDaysRemaining(): Observable<number> {
    return this.estabService.estabelecimento$.pipe(
      map(e => {
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
      map(e => !!e?.trial_ends_at && !e.plano && new Date(e.trial_ends_at) > new Date())
    );
  }

  getUsage(): Observable<UsageQuota> {
    return this.costTracker.quota$;
  }
}
