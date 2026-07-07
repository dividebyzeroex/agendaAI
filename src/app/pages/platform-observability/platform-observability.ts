import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-platform-observability',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-observability.html',
  styleUrls: ['./platform-observability.css']
})
export class PlatformObservability implements OnInit {
  logs: any[] = [];
  metrics = {
    latency: 185, // ms
    successRate: 99.8,
    tokensUsed: 1245000,
    errorsToday: 12
  };

  ngOnInit() {
    this.generateMockLogs();
  }

  generateMockLogs() {
    const events = ['WhatsApp Message Sent', 'Zernio Post Scheduled', 'Stripe Webhook Received', 'AI Inference Completed'];
    const tenants = ['Barbearia do João', 'Spa Zen', 'Tattoo Studio', 'Clinica Bella'];
    
    for (let i = 0; i < 20; i++) {
      this.logs.push({
        time: new Date(Date.now() - Math.random() * 10000000),
        event: events[Math.floor(Math.random() * events.length)],
        tenant: tenants[Math.floor(Math.random() * tenants.length)],
        status: Math.random() > 0.1 ? 'success' : 'error',
        latency: Math.floor(Math.random() * 500) + 50
      });
    }
    
    this.logs.sort((a, b) => b.time.getTime() - a.time.getTime());
  }
}
