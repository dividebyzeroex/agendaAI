import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService } from '../../services/platform';

@Component({
  selector: 'app-platform-billing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-billing.html',
  styleUrls: ['./platform-billing.css']
})
export class PlatformBilling implements OnInit {
  metrics = {
    mrr: 12450.00,
    arr: 149400.00,
    arpu: 97.50,
    churn: 1.2
  };

  plans = [
    { name: 'Básico', count: 42, mrr: 2058, percent: 16.5 },
    { name: 'Completo', count: 64, mrr: 6208, percent: 49.8 },
    { name: 'Premium', count: 12, mrr: 4184, percent: 33.7 }
  ];

  transactions: any[] = [];
  isLoading = true;
  hasError = false;

  private platformService = inject(PlatformService);

  async ngOnInit() {
    try {
      const data = await this.platformService.getBillingData();
      if (data) {
        this.metrics = data.metrics;
        this.plans = data.plans;
        this.transactions = data.transactions;
      }
    } catch (e) {
      this.hasError = true;
      console.error('Failed to load real billing data.');
    } finally {
      this.isLoading = false;
    }
  }


}
