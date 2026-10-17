import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
@Component({
  selector: 'app-customer-portal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './customer-portal.html',
  styleUrls: ['./customer-portal.css'],
})
export class CustomerPortal implements OnInit {
  token = inject(ActivatedRoute).snapshot.paramMap.get('token') || '';
  data = signal<any>(null);
  loading = signal(false);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  confirm = signal('');
  ngOnInit() {
    void this.load();
  }
  async request(action: string, extra: any = {}) {
    const r = await boundedFetch('/api/public-booking?action=portal-' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, ...extra }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Não foi possível concluir.');
    return d;
  }
  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await this.request('info'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Portal indisponível.');
    } finally {
      this.loading.set(false);
    }
  }
  canChange(a: any) {
    return (
      ['pendente', 'confirmado'].includes(a.status) && Date.parse(a.start) > Date.now() + 7200000
    );
  }
  async cancel(event: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const d = await this.request('cancel', { event, confirmed: true });
      this.confirm.set('');
      this.notice.set(
        d.requested
          ? 'Pedido registrado. O estabelecimento precisa tratar o sinal para concluir o cancelamento.'
          : 'Horário cancelado. A sessão reservada foi liberada.',
      );
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      this.busy.set(false);
    }
  }
}
