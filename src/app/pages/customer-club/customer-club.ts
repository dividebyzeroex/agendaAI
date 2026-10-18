import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
@Component({
  selector: 'app-customer-club',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-club.html',
  styleUrls: ['./customer-club.css'],
})
export class CustomerClub implements OnInit {
  private route = inject(ActivatedRoute);
  token = this.route.snapshot.paramMap.get('token') || '';
  club = signal<any>(null);
  loading = signal(false);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  accepted = false;
  cancelOpen = false;
  cancelConfirmed = false;
  ngOnInit() {
    void this.load();
  }
  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await boundedFetch(
        '/api/billing?action=club-info&token=' + encodeURIComponent(this.token),
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Não foi possível conferir o clube.');
      this.club.set(d);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Clube indisponível.');
    } finally {
      this.loading.set(false);
    }
  }
  async action(action: 'accept' | 'pay' | 'cancel') {
    if (this.busy()) return;
    if (action === 'accept' && !this.accepted) {
      this.error.set('Autorize as condições para continuar.');
      return;
    }
    if (action === 'cancel' && !this.cancelConfirmed) {
      this.error.set('Confirme que deseja cancelar os próximos débitos.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await boundedFetch('/api/billing?action=club-' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          accepted: this.accepted,
          termsVersion: this.club().termsVersion,
          confirmed: this.cancelConfirmed,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Não foi possível concluir.');
      if (d.url) {
        const u = new URL(d.url);
        if (u.protocol !== 'https:' || u.hostname !== 'checkout.stripe.com')
          throw Error('Link de pagamento inválido.');
        window.location.assign(d.url);
        return;
      }
      this.cancelOpen = false;
      this.notice.set(
        d.cancelled
          ? 'Renovação cancelada. Você pode usar as sessões do ciclo pago até o vencimento.'
          : 'Pagamento confirmado.',
      );
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }
}
