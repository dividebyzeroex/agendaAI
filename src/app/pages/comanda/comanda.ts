import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
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
  receiptSource = signal<'checking' | 'stripe' | 'merchant' | 'unavailable'>('checking');
  receiptState = signal('checking');
  paidAt = signal<string | null>(null);
  recordedMethod = signal('');
  receiptWarning = signal('');
  get receiptLabel(): string {
    const state = this.receiptState();
    if (this.receiptSource() === 'checking' || this.receiptSource() === 'unavailable')
      return 'CONFERINDO';
    if (this.receiptSource() === 'merchant' && state === 'pago') return 'REGISTRADO NO CAIXA';
    if (state === 'paid' || state === 'pago') return 'PAGO';
    if (state === 'cancelado' || state === 'refunded') return 'CANCELADO';
    if (state === 'expired') return 'EXPIRADO';
    if (state === 'disputed' || state === 'refund_pending') return 'EM ANÁLISE';
    return 'PENDENTE';
  }
  get receiptPaid(): boolean {
    return this.receiptSource() === 'stripe' && this.receiptState() === 'paid';
  }
  get receiptRecorded(): boolean {
    return this.receiptSource() === 'merchant' && this.receiptState() === 'pago';
  }
  get paymentMethodLabel(): string {
    if (this.receiptSource() === 'stripe') return 'Stripe Connect';
    return ({
      pix:'Pix externo', dinheiro:'Dinheiro',
      cartao_credito:'Cartão de crédito presencial',
      cartao_debito:'Cartão de débito presencial'
    } as Record<string,string>)[this.recordedMethod()] || 'Não informado';
  }
  reservationStatus = signal('');
  paymentPurpose = signal('');
  paymentBusy = signal(false);
  checkingPayment = signal(false);
  paymentError = signal('');
  async conferirPagamento() {
    if (!this.token || this.checkingPayment()) return;
    const token = this.token;
    this.checkingPayment.set(true);
    try {
      const r = await boundedFetch(
        '/api/billing?action=connect-receipt&token=' + encodeURIComponent(this.token),
      );
      if (!r.ok || this.token !== token) return;
      const d = await r.json();
      if (this.token !== token) return;
      if (typeof d.online !== 'boolean' || typeof d.status !== 'string')
        throw Error('Resposta incompleta ao consultar a cobrança.');
      this.receiptSource.set(d.online ? 'stripe' : 'merchant');
      this.receiptState.set(d.status);
      this.onlineStatus.set(d.online ? d.status : '');
      this.recordedMethod.set(d.paymentMethod || '');
      this.paidAt.set(d.paidAt || null);
      if (this.caixaItem && typeof d.professional === 'string' && d.professional.trim())
        this.caixaItem = {...this.caixaItem,profissional:d.professional.trim()};
      this.receiptWarning.set('');
      this.reservationStatus.set(d.reservationStatus || '');
      this.paymentPurpose.set(d.purpose || '');
      if (d.online && d.status === 'paid' && this.caixaItem)
        this.caixaItem = { ...this.caixaItem, status_caixa: 'pago' };
    } catch {
      // The RPC alone must not be treated as proof of a Stripe payment.
      if (this.receiptSource() === 'checking') this.receiptSource.set('unavailable');
      this.receiptWarning.set('Não foi possível verificar a situação do pagamento. Tente atualizar.');
    } finally {
      this.checkingPayment.set(false);
    }
  }
  async pagar() {
    if (this.paymentBusy() || this.onlineStatus() !== 'pending') return;
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
    // Watch only while the current customer still has an outstanding Stripe order.
    interval(12000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (document.visibilityState === 'visible' && this.onlineStatus() === 'pending'
          && !this.paymentBusy() && !this.loading()) void this.conferirPagamento();
    });
    this.estService.estabelecimento$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((est) => {
      if (est?.nome) this.nomeEstabelecimento.set(est.nome);
    });
    await this.carregarComanda();
  }

  async carregarComanda() {
    this.loading.set(true);
    this.paymentError.set('');
    this.onlineStatus.set('');
    this.receiptSource.set('checking');
    this.receiptState.set('checking');
    this.recordedMethod.set('');
    this.paidAt.set(null);
    this.receiptWarning.set('');
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
      if (typeof data.estabelecimento?.nome === 'string' && data.estabelecimento.nome.trim())
        this.nomeEstabelecimento.set(data.estabelecimento.nome.trim());
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
