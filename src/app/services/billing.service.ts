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
  price: number;
  months: number;
  highlight?: boolean;
  features: PlanFeature[];
  tokensLimit: number;
  smsLimit: number;
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
      id: '1_month',
      name: '1 Mês',
      price: 49,
      months: 1,
      tokensLimit: 250000,
      smsLimit: 500,
      features: [
        { text: 'Acesso Completo', included: true },
        { text: 'Agenda Online Ilimitada', included: true },
        { text: 'Base de Clientes + CRM', included: true },
        { text: '500 Lembretes SMS/Mês', included: true },
        { text: 'Analytics Avançado IA', included: true },
      ]
    },
    {
      id: '3_months',
      name: '3 Meses (5% OFF)',
      price: 139.65,
      months: 3,
      tokensLimit: 750000,
      smsLimit: 1500,
      features: [
        { text: 'Sua assinatura por 90 dias', included: true },
        { text: 'Todas as vantagens do plano Mensal', included: true },
        { text: 'Proteção contra reajustes', included: true },
      ]
    },
    {
      id: '6_months',
      name: '6 Meses (10% OFF)',
      price: 264.60,
      months: 6,
      tokensLimit: 1500000,
      smsLimit: 3000,
      highlight: true,
      features: [
        { text: 'Sua assinatura por 180 dias', included: true },
        { text: 'Todas as vantagens do plano Mensal', included: true },
        { text: 'Maior desconto a médio prazo', included: true },
        { text: 'Atendimento Prioritário', included: true },
      ]
    },
    {
      id: '12_months',
      name: '12 Meses (15% OFF)',
      price: 499.80,
      months: 12,
      tokensLimit: 3000000,
      smsLimit: 6000,
      features: [
        { text: 'Sua assinatura por 365 dias', included: true },
        { text: 'Desconto máximo de plano', included: true },
        { text: 'Congela valor por 1 ano', included: true },
        { text: 'Acesso antecipado a Novidades', included: true },
      ]
    }
  ];

  private invoicesSubject = new BehaviorSubject<Invoice[]>([
    { id: 'INV-3420', date: '2024-03-01', amount: 99, status: 'Paga' },
    { id: 'INV-3211', date: '2024-02-01', amount: 99, status: 'Paga' },
    { id: 'INV-2980', date: '2024-01-01', amount: 49, status: 'Paga' },
  ]);
  invoices$ = this.invoicesSubject.asObservable();

  /** 
   * Official Stripe Checkout Integration
   */
  async processStripeCheckout(planId: string): Promise<string | undefined> {
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) return undefined;

    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return undefined;

    try {
      // Fetch session token securely via Auth
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) return undefined;

      const response = await fetch('/api/checkout', {
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
