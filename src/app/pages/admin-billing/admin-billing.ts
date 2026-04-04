import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';
import { BillingService, BillingPlan, Invoice } from '../../services/billing.service';
import { CostTrackerService, UsageQuota } from '../../services/cost-tracker.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-billing.html',
  styleUrl: './admin-billing.css'
})
export class AdminBilling implements OnInit {
  private billing = inject(BillingService);
  private tracker = inject(CostTrackerService);
  private estabService = inject(EstabelecimentoService);
  private authService = inject(AuthService);

  plans: BillingPlan[] = this.billing.plans;
  currentPlan$ : Observable<BillingPlan | undefined> = this.billing.getCurrentPlan();
  invoices$    : Observable<Invoice[]> = this.billing.invoices$;
  usage$       : Observable<UsageQuota> = this.tracker.quota$;
  
  isTrialActive$     = this.billing.isTrialActive();
  trialDaysRemaining$ = this.billing.getTrialDaysRemaining();

  // UI State
  showConfirmModal = false;
  selectedPlan: BillingPlan | null = null;
  isProcessing = false;
  isVerifying = false;
  successMsg = '';
  showConfetti = false;
  
  // Card Form (simulated card hash production)
  card = {
    number: '',
    name: '',
    expiry: '',
    cvc: ''
  };

  ngOnInit() {
    window.scrollTo(0, 0);
    this.checkPaymentCallback();
  }

  async checkPaymentCallback() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const extRefStr = params.get('external_reference');
    const paymentId = params.get('payment_id');

    if (status === 'approved' && extRefStr && paymentId && !this.isVerifying) {
      this.isVerifying = true;
      try {
        const extRef = JSON.parse(extRefStr);
        if (extRef.type === 'saas_subscription') {
          const current = this.estabService.estabelecimento$.value;
          if (current) {
               const now = new Date();
               let currentExpires = current.plano_expires_at ? new Date(current.plano_expires_at) : now;
               if (currentExpires < now) currentExpires = now;
               
               currentExpires.setMonth(currentExpires.getMonth() + Number(extRef.months));
               
               await this.estabService.updateEstabelecimento({
                    plano: extRef.planId,
                    plano_expires_at: currentExpires.toISOString()
               });
               
               this.celebrate();
               this.successMsg = `Assinatura de ${extRef.months} mes(es) ativada com sucesso! Pagamento ID: ${paymentId}`;
               window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch (e: any) {
        console.error('Error processing callback:', e);
        this.successMsg = 'Erro ao processar ativação: ' + e.message;
      } finally {
        this.isVerifying = false;
      }
    }
  }

  openUpgrade(plan: BillingPlan) {
    this.selectedPlan = plan;
    this.showConfirmModal = true;
  }

  closeConfirmModal() {
    this.showConfirmModal = false;
    this.selectedPlan = null;
  }

  async processMercadoPagoCheckout() {
    if (!this.selectedPlan) return;
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) {
       this.successMsg = 'Erro: Estabelecimento não encontrado. Tente novamente.';
       return;
    }

    this.isProcessing = true;
    try {
      // Fetch session token securely
      const token = await this.authService.getSessionToken();

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          estabelecimentoId: current.id,
          planId: this.selectedPlan.id,
          price: this.selectedPlan.price,
          months: this.selectedPlan.months,
          title: this.selectedPlan.name
        })
      });
      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error(data.error || 'Failed to create checkout');
      }
    } catch (e: any) {
       this.successMsg = 'Erro ao iniciar pagamento: ' + e.message;
       setTimeout(() => this.successMsg = '', 4000);
       this.isProcessing = false;
       this.showConfirmModal = false;
    }
  }

  private celebrate() {
    this.showConfetti = true;
  }

  manageCycle() {
    this.successMsg = 'Redirecionando para o portal de gerenciamento de faturamento...';
    setTimeout(() => this.successMsg = '', 3000);
  }
}
