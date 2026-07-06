import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { PlatformService, PlatformTenant } from '../../services/platform';

@Component({
  selector: 'app-platform-tenants',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule],
  templateUrl: './platform-tenants.html',
  styleUrls: ['./platform-tenants.css']
})
export class PlatformTenants implements OnInit {
  private platformService = inject(PlatformService);
  tenants: PlatformTenant[] = [];
  isLoading = true;

  async ngOnInit() {
    this.tenants = await this.platformService.getTenants();
    this.isLoading = false;
  }

  getSeverity(status: string) {
    switch (status) {
      case 'active': return 'success';
      case 'blocked': return 'danger';
      case 'trial': return 'warn';
      default: return 'info';
    }
  }
}
