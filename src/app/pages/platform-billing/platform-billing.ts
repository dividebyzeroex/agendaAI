import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService, PlatformMetrics, PlatformPayment, PlatformTenant } from '../../services/platform';

@Component({ selector: 'app-platform-billing', standalone: true, imports: [CommonModule], templateUrl: './platform-billing.html', styleUrls: ['./platform-billing.css'] })
export class PlatformBilling implements OnInit {
  metrics: PlatformMetrics | null = null;
  transactions: PlatformPayment[] = [];
  tenants: PlatformTenant[] = [];
  isLoading = true;
  hasError = false;
  updatedAt: Date | null = null;
  private cdr = inject(ChangeDetectorRef);
  private platformService = inject(PlatformService);
  ngOnInit() { void this.refresh(); }
  async refresh() {
    this.isLoading = true; this.hasError = false;
    try {
      const data = await this.platformService.getBillingData();
      this.metrics = data.metrics; this.transactions = data.payments; this.tenants = data.tenants; this.updatedAt = new Date();
    } catch { this.hasError = true; }
    finally { this.isLoading = false; this.cdr.markForCheck(); }
  }
  tenantName(id: string | null) { return this.tenants.find(t => t.id === id)?.nome ?? 'Cliente não identificado'; }
  statusLabel(status: string) { return ({ paid: 'Pago', failed: 'Falhou', refunded: 'Reembolsado', pending: 'Pendente' } as Record<string, string>)[status] ?? status; }
}
