import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { PlatformService, PlatformTenant } from '../../services/platform';

@Component({ selector: 'app-platform-tenants', standalone: true, imports: [CommonModule, FormsModule, TableModule], templateUrl: './platform-tenants.html', styleUrls: ['./platform-tenants.css'] })
export class PlatformTenants implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private platformService = inject(PlatformService);
  tenants: PlatformTenant[] = [];
  isLoading = true;
  hasError = false;
  query = '';
  status = '';
  busyId: string | null = null;
  actionError = '';
  notice = '';
  ngOnInit() { void this.refresh(); }
  async refresh() {
    this.isLoading = true; this.hasError = false;
    try { this.tenants = await this.platformService.getTenants(); }
    catch { this.hasError = true; }
    finally { this.isLoading = false; this.cdr.markForCheck(); }
  }
  get filteredTenants() {
    const query = this.query.trim().toLocaleLowerCase('pt-BR');
    return this.tenants.filter(t => (!this.status || t.status === this.status) && (!query || `${t.nome} ${t.slug} ${t.id}`.toLocaleLowerCase('pt-BR').includes(query)));
  }
  statusLabel(status: string) { return ({ paid: 'Pagante', test_payment: 'Pagamento de teste', trial: 'Em teste', expired: 'Teste vencido', blocked: 'Bloqueado' } as Record<string, string>)[status] ?? status; }
  async toggleTenant(tenant: PlatformTenant) {
    const active = tenant.status === 'blocked';
    if (!active && !window.confirm(`Bloquear o acesso de ${tenant.nome}? A assinatura e a cobrança não serão canceladas por esta ação.`)) return;
    this.busyId = tenant.id; this.actionError = ''; this.notice = '';
    try {
      await this.platformService.setTenantActive(tenant.id, active);
      this.notice = `Acesso de ${tenant.nome} ${active ? 'desbloqueado' : 'bloqueado'}.`;
      await this.refresh();
    } catch { this.actionError = 'Não foi possível alterar o acesso. Tente novamente.'; }
    finally { this.busyId = null; this.cdr.markForCheck(); }
  }
}
