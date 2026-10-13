import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PlatformService, PlatformMetrics } from '../../services/platform';

@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './platform-dashboard.html',
  styleUrls: ['./platform-dashboard.css']
})
export class PlatformDashboard implements OnInit {
  private platformService = inject(PlatformService);
  metrics: PlatformMetrics | null = null;
  isLoading = true;
  hasError = false;
  lastUpdated: Date | null = null;

  get inactiveTenants(): number {
    return Math.max(0, (this.metrics?.totalTenants ?? 0) - (this.metrics?.activeTenants ?? 0));
  }

  get activationRate(): number {
    const total = this.metrics?.totalTenants ?? 0;
    return total ? ((this.metrics?.activeTenants ?? 0) / total) * 100 : 0;
  }

  get averageMrr(): number {
    const active = this.metrics?.activeTenants ?? 0;
    return active ? (this.metrics?.totalMrr ?? 0) / active : 0;
  }

  async ngOnInit() { await this.refresh(); }

  async refresh() {
    this.isLoading = true;
    this.hasError = false;
    try {
      this.metrics = await this.platformService.getGlobalMetrics();
      this.lastUpdated = new Date();
    } catch (e) {
      this.hasError = true;
      console.error('[Owner] Unable to load platform metrics', e);
    } finally {
      this.isLoading = false;
    }
  }
}
