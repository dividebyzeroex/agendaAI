import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService } from '../../services/platform';

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
    latency: 0,
    successRate: 0,
    tokensUsed: 0,
    errorsToday: 0
  };
  isLoading = true;
  hasError = false;

  private platformService = inject(PlatformService);

  async ngOnInit() {
    try {
      const data = await this.platformService.getObservabilityData();
      if (data) {
        this.metrics = data.metrics || this.metrics;
        this.logs = data.logs || [];
      }
    } catch (e) {
      this.hasError = true;
      console.error('Failed to load real observability data.');
    } finally {
      this.isLoading = false;
    }
  }


}
