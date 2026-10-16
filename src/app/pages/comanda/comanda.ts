import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

@Component({
  selector: 'app-comanda',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './comanda.html',
  styleUrls: ['./comanda.css'],
})
export class ComandaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);
  public estService = inject(EstabelecimentoService);

  private destroyRef = inject(DestroyRef);

  token = '';
  caixaItem: any = null;
  produtos: any[] = [];
  loading = signal(true);
  error = signal('');
  onlineStatus = signal('');
  paymentBusy = signal(false);
  paymentError = signal('');
  async conferirPagamento() {
    try {
      const r = await boundedFetch(
        '/api/billing?action=connect-receipt&token=' + encodeURIComponent(this.token),
      );
      if (!r.ok) return;
      const d = await r.json();
      this.onlineStatus.set(d.online ? d.status : '');
      if (d.status === 'paid' && this.caixaItem)
        this.caixaItem = { ...this.caixaItem, status_caixa: 'pago' };
    } catch {
      /* The receipt remains available when the payment provider is unreachable. */
    }
  }
  async pagar() {
    if (this.paymentBusy()) return;
    this.paymentBusy.set(true);
    this.paymentError.set('');
    try {
      const r = await boundedFetch('/api/billing?action=connect-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Não foi possível abrir o pagamento.');
      const url = new URL(d.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com')
        throw Error('Link de pagamento inválido.');
      window.location.assign(d.url);
    } catch (e) {
      this.paymentError.set(e instanceof Error ? e.message : 'Pagamento indisponível.');
    } finally {
      this.paymentBusy.set(false);
    }
  }

  // Customization
  nomeEstabelecimento = signal('Agenda AI');

  async ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.estService.estabelecimento$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((est) => {
      if (est?.nome) this.nomeEstabelecimento.set(est.nome);
    });
    await this.carregarComanda();
  }

  async carregarComanda() {
    this.loading.set(true);
    this.paymentError.set('');
    this.onlineStatus.set('');
    this.error.set('');
    this.caixaItem = null;
    this.produtos = [];
    if (!this.token) {
      this.error.set('Comanda não encontrada. Confira o link recebido.');
      this.loading.set(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound the whole RPC, including any wait for the authentication lock.
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('A conexão demorou demais. Tente novamente.'));
        }, 20000);
      });
      const { data, error } = await Promise.race([
        this.supabase.client
          .rpc('get_comanda_digital', { p_token: this.token })
          .abortSignal(controller.signal),
        timeout,
      ]);
      if (error) throw error;
      if (!data) {
        this.error.set('Comanda não encontrada. Confira o link recebido.');
        return;
      }
      this.caixaItem = data;
      this.produtos = data.produtos || [];
      void this.conferirPagamento();
    } catch {
      this.error.set(
        'Não foi possível carregar a comanda. Verifique sua conexão e tente novamente.',
      );
    } finally {
      clearTimeout(timer);
      this.loading.set(false);
    }
  }
}
