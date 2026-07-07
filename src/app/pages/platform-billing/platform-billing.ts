import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  ngOnInit() {
    this.generateMockTransactions();
  }

  generateMockTransactions() {
    const tenants = ['Barbearia do João', 'Spa Zen', 'Tattoo Studio', 'Clinica Bella', 'Studio Makeup'];
    const plans = ['Plano Completo', 'Plano Básico', 'Plano Premium'];
    const amounts = [97, 49, 149, 299];
    
    for (let i = 0; i < 15; i++) {
      this.transactions.push({
        id: `tx_${Math.random().toString(36).substr(2, 9)}`,
        tenant: tenants[Math.floor(Math.random() * tenants.length)],
        plan: plans[Math.floor(Math.random() * plans.length)],
        amount: amounts[Math.floor(Math.random() * amounts.length)],
        date: new Date(Date.now() - Math.random() * 864000000),
        status: Math.random() > 0.15 ? 'succeeded' : 'failed'
      });
    }
    this.transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
