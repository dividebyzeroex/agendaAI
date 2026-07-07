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
    mrr: 0,
    arr: 0,
    arpu: 0,
    churn: 0
  };

  plans: any[] = [];

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
