import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
@Component({
  selector: 'app-connect-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './connect-payments.html',
  styleUrls: ['./connect-payments.css'],
})
export class ConnectPayments implements OnChanges, OnDestroy {
  @Input() tenantId = '';
  private db = inject(SupabaseService).client;
  state = signal<any>(null);
  busy = signal(false);
  error = signal('');
  refundId = signal('');
  accepted = false;
  onboardingUrl = signal('');
  private generation = 0;
  private destroyed = false;
  ngOnDestroy() {
    this.destroyed = true;
    ++this.generation;
  }
  get accountStatus() {
    const s = this.state();
    if (!s?.available) return 'Indisponível no momento';
    if (!s.linked) return 'Ainda não vinculada';
    if (!s.ready) return 'Cadastro pendente';
    return s.enabled ? 'Recebimentos online ativos' : 'Conta pronta para ativar';
  }
  get step() {
    const s = this.state();
    return !s?.linked ? 1 : !s.ready ? 2 : 3;
  }
  get recentPaid() {
    return (
      (this.state()?.orders || [])
        .filter((o: any) => o.status === 'paid')
        .reduce((n: number, o: any) => n + (o.amount_cents - (o.refunded_cents || 0)), 0) / 100
    );
  }
  get recentPending() {
    return (
      (this.state()?.orders || [])
        .filter((o: any) => o.status === 'pending')
        .reduce((n: number, o: any) => n + o.amount_cents, 0) / 100
    );
  }
  ngOnChanges() {
    ++this.generation;
    this.busy.set(false);
    this.error.set('');
    this.refundId.set('');
    this.state.set(null);
    this.accepted = false;
    this.onboardingUrl.set('');
    void this.load();
  }
  private async request(action: string, body?: any, tenantId = this.tenantId) {
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (!session) throw Error('Entre novamente para conferir os recebimentos.');
    const r = await boundedFetch(
      '/api/billing?action=connect-' +
        action +
        (body ? '' : '&estabelecimentoId=' + encodeURIComponent(tenantId)),
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify({ ...body, estabelecimentoId: tenantId }) } : {}),
      },
    );
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Recebimentos indisponíveis.');
    return data;
  }
  async load() {
    const g = ++this.generation;
    if (!this.tenantId) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const state = await this.request('status');
      if (g === this.generation && !this.destroyed) this.state.set(state);
    } catch (e) {
      if (g === this.generation && !this.destroyed)
        this.error.set(e instanceof Error ? e.message : 'Falha ao conferir recebimentos.');
    } finally {
      if (g === this.generation && !this.destroyed) this.busy.set(false);
    }
  }
  async onboard() {
    if (this.busy() || !this.accepted || !this.state()?.available) return;
    const g = this.generation;
    const tenantId = this.tenantId;
    this.busy.set(true);
    this.error.set('');
    try {
      const d = await this.request(
        'onboard',
        {
          termsAccepted: this.accepted,
          termsVersion: this.state().termsVersion,
        },
        tenantId,
      );
      if (g !== this.generation || this.destroyed) return;
      const url = new URL(d.url);
      if (
        url.protocol !== 'https:' ||
        !(url.hostname === 'connect.stripe.com' || url.hostname.endsWith('.stripe.com'))
      )
        throw Error('Link Stripe inválido.');
      this.onboardingUrl.set(d.url);
      window.location.assign(d.url);
    } catch (e) {
      if (g === this.generation && !this.destroyed)
        this.error.set(e instanceof Error ? e.message : 'Falha ao vincular.');
    } finally {
      if (g === this.generation && !this.destroyed) this.busy.set(false);
    }
  }
  async toggle() {
    if (
      this.busy() ||
      !this.state()?.linked ||
      (!this.state().enabled && (!this.accepted || !this.state().ready || !this.state().available))
    )
      return;
    const g = this.generation,
      tenantId = this.tenantId;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.request(
        'settings',
        {
          enabled: !this.state().enabled,
          termsAccepted: this.accepted,
          termsVersion: this.state().termsVersion,
        },
        tenantId,
      );
      if (g === this.generation && !this.destroyed) await this.load();
    } catch (e) {
      if (g === this.generation && !this.destroyed)
        this.error.set(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      if (g === this.generation && !this.destroyed) this.busy.set(false);
    }
  }
  async operate(action: string, o: any) {
    if (this.busy() || !['cancel', 'refund'].includes(action)) return;
    const g = this.generation,
      tenantId = this.tenantId;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.request(action, { orderId: o.id }, tenantId);
      if (g === this.generation && !this.destroyed) {
        this.refundId.set('');
        await this.load();
      }
    } catch (e) {
      if (g === this.generation && !this.destroyed)
        this.error.set(e instanceof Error ? e.message : 'Falha na operação.');
    } finally {
      if (g === this.generation && !this.destroyed) this.busy.set(false);
    }
  }
  label(status: string) {
    return (
      (
        {
          pending: 'Aguardando',
          paid: 'Confirmado',
          expired: 'Expirado',
          refunded: 'Reembolsado',
          disputed: 'Em contestação',
          in_transit: 'Em trânsito',
          failed: 'Falhou',
          canceled: 'Cancelado',
        } as Record<string, string>
      )[status] || status
    );
  }
}
