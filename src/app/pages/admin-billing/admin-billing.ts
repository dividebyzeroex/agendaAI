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

  ngOnInit() {
    window.scrollTo(0, 0);
    this.checkPaymentCallback();
    this.billing.refreshInvoices();
  }

  async checkPaymentCallback() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const sessionId = params.get('session_id');

    if (sessionId && !this.isVerifying) {
      this.isVerifying = true;
      try {
        const result = await this.billing.verifySession(sessionId);
        if (result.status === 'success') {
          this.celebrate();
          this.successMsg = `Assinatura ativada com sucesso! Bem-vindo ao time Elite.`;
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => this.successMsg = '', 6000);
        } else {
          this.successMsg = 'Erro ao verificar pagamento: ' + (result.error || 'Tente novamente.');
        }
      } catch (e: any) {
        console.error('Error verifying Stripe session:', e);
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

  async processStripeCheckout() {
    if (!this.selectedPlan) return;
    const current = this.estabService.estabelecimento$.value;
    if (!current?.id) {
       this.successMsg = 'Erro: Estabelecimento não encontrado. Tente novamente.';
       return;
    }

    this.isProcessing = true;
    try {
      const checkoutUrl = await this.billing.processStripeCheckout(this.selectedPlan.id);
      
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error('Não foi possível gerar a sessão de pagamento. Verifique sua conexão.');
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

  async confirmCancel() {
    if (!confirm('Tem certeza que deseja cancelar sua assinatura? Você manterá o acesso Elite até o fim do período já pago.')) return;
    
    this.isProcessing = true;
    try {
      const result = await this.billing.cancelSubscription();
      if (result.status === 'cancelled') {
        this.successMsg = 'Assinatura cancelada com sucesso. A renovação automática foi desativada.';
        setTimeout(() => this.successMsg = '', 6000);
      } else {
        throw new Error(result.error || 'Erro ao cancelar.');
      }
    } catch (e: any) {
      this.successMsg = 'Erro ao cancelar: ' + e.message;
      setTimeout(() => this.successMsg = '', 4000);
    } finally {
      this.isProcessing = false;
    }
  }

  downloadInvoice(pdfUrl: string) {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  }

  manageCycle() {
    this.successMsg = 'Redirecionando para o portal de gerenciamento de faturamento...';
    setTimeout(() => this.successMsg = '', 3000);
  }
}
