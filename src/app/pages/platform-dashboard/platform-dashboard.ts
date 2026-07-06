import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService, PlatformMetrics } from '../../services/platform';

@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-dashboard.html',
  styleUrls: ['./platform-dashboard.css']
})
export class PlatformDashboard implements OnInit {
  private platformService = inject(PlatformService);
  metrics: PlatformMetrics | null = null;
  isLoading = true;

  async ngOnInit() {
    this.metrics = await this.platformService.getGlobalMetrics();
    this.isLoading = false;
  }
}
