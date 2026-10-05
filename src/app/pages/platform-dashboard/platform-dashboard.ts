import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlatformService, PlatformMetrics } from '../../services/platform';

@Component({ selector: 'app-platform-dashboard', standalone: true, imports: [CommonModule], templateUrl: './platform-dashboard.html', styleUrls: ['./platform-dashboard.css'] })
export class PlatformDashboard implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private platformService = inject(PlatformService);
  metrics: PlatformMetrics | null = null;
  isLoading = true;
  hasError = false;
  updatedAt: Date | null = null;
  ngOnInit() { void this.refresh(); }
  async refresh() {
    this.isLoading = true; this.hasError = false;
    try { this.metrics = await this.platformService.getGlobalMetrics(); this.updatedAt = new Date(); }
    catch { this.hasError = true; }
    finally { this.isLoading = false; this.cdr.markForCheck(); }
  }
  share(value: number): number { return this.metrics?.totalTenants ? Math.min(100, value / this.metrics.totalTenants * 100) : 0; }
}
