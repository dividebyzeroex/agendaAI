import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SupabaseService } from '../../services/supabase.service';
import { PlatformService, PlatformTenant } from '../../services/platform';

@Component({ selector: 'app-platform-tenants', standalone: true, imports: [CommonModule, FormsModule, TableModule], templateUrl: './platform-tenants.html', styleUrls: ['./platform-tenants.css'] })
export class PlatformTenants implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private platformService = inject(PlatformService);
  usage: any[] = [];
  selected: any = null;
  private db = inject(SupabaseService).client;
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
    try {
      const [tenants, usage, contacts] = await Promise.all([this.platformService.getTenants(), this.db.rpc('owner_tenant_usage'), this.db.rpc('owner_tenant_contacts')]);
      if (usage.error) throw usage.error;
      if (contacts.error) throw contacts.error;
      this.tenants = tenants;
      this.usage = (usage.data || []).map((tenant: any) => ({ ...tenant, ...(contacts.data || []).find((contact: any) => contact.id === tenant.id) }));
      if (this.selected) this.selected = this.usage.find(t => t.id === this.selected.id);
    }
    catch { this.hasError = true; }
    finally { this.isLoading = false; this.cdr.markForCheck(); }
  }
  get filteredTenants() {
    const query = this.query.trim().toLocaleLowerCase('pt-BR');
    return this.tenants.filter(t => {
      const contact = this.usageFor(t.id);
      return (!this.status || t.status === this.status) && (!query || `${t.nome} ${t.slug} ${t.id} ${contact?.email || ''} ${contact?.telefone || ''} ${contact?.endereco || ''} ${contact?.cidade || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    });
  }
  usageFor(id:string) { return this.usage.find(t=>t.id===id); }
  activeCount(items:any[]) { return (items||[]).filter(t=>t.ativo).length; }
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
