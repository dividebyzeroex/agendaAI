import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PayQrComponent } from '../../components/pay-qr/pay-qr';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
import {
  DisplaySnapshot, DISPLAY_RECORD_MS, DISPLAY_STALE_MS,
  DISPLAY_SUCCESS_MS, PAYMENT_POLL_MS, safePayUrl, validDisplaySecret,
  confirmedByProvider
} from '../../core/pay-display-protocol';
import { PayDisplayService } from '../../services/pay-display.service';

type Screen = 'unpaired' | 'idle' | 'draft' | 'awaiting' | 'recorded' | 'success' | 'issue';

/** A public, paired, read-only second screen. No cashier auth or financial writes. */
@Component({
  selector: 'app-checkout-display',
  standalone: true,
  imports: [CommonModule, PayQrComponent],
  templateUrl: './checkout-display.html',
  styleUrls: ['./checkout-display.css']
})
export class CheckoutDisplay implements OnInit, OnDestroy {
  private display = inject(PayDisplayService);
  private destroyRef = inject(DestroyRef);
  readonly screen = signal<Screen>('unpaired');
  readonly snapshot = signal<DisplaySnapshot | null>(null);
  readonly pairingError = signal('');
  readonly offline = signal(false);
  readonly paymentIssue = signal('');
  readonly checkingPayment = signal(false);
  readonly verifiedAt = signal(0);
  readonly connected = this.display.connected;
  readonly companyName = signal('Seu estabelecimento');
  readonly clock = signal(new Date());
  private activeToken = '';
  private verifyingToken = '';
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private lastPacketAt = 0;
  private lastHelloSent = 0;
  private lastRevision = -1;

  get items() { return this.snapshot()?.items || []; }
  get total() { return this.snapshot()?.total ?? 0; }
  get paymentUrl(): string {
    const s = this.snapshot();
    if (!s || !s.receiptToken) return '';
    const receiptUrl = new URL('/comanda/' + s.receiptToken, window.location.origin).href;
    return safePayUrl(s.paymentUrl, s.receiptToken, window.location.origin) || receiptUrl;
  }
  get dateTime(): string {
    return this.clock().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  async ngOnInit() {
    this.display.packets$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(packet=>{
      if (packet.type === 'snapshot') this.onSnapshot(packet.snapshot);
      if (packet.type === 'shutdown') {
        this.cancelResultTimer();
        this.activeToken = '';
        this.snapshot.set(null);
        this.screen.set('unpaired');
        this.pairingError.set('O pareamento foi encerrado pela recepção. Solicite um novo QR de conexão.');
      }
    });
    this.clockTimer = setInterval(()=>this.clock.set(new Date()), 10000);
    this.pollTimer = setInterval(()=>{
      if (document.visibilityState !== 'visible') return;
      this.offline.set(!!this.lastPacketAt && Date.now()-this.lastPacketAt > DISPLAY_STALE_MS);
      if (this.screen() === 'awaiting') void this.verifyPayment();
      if (Date.now() - this.lastHelloSent > 12000) {
        this.lastHelloSent = Date.now();
        void this.display.hello();
      }
    }, PAYMENT_POLL_MS);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const secret = fragment.get('pair') || '';
    if (!validDisplaySecret(secret)) {
      this.pairingError.set('Abra esta tela pelo botão “Display do cliente” dentro do caixa.');
      this.screen.set('unpaired');
      return;
    }
    this.screen.set('idle');
    this.pairingError.set('');
    try {
      await this.display.view(secret);
      void this.display.hello();
    } catch {
      this.pairingError.set('Não foi possível estabelecer o pareamento. Solicite um novo link ao caixa.');
      this.screen.set('unpaired');
    }
  }
  ngOnDestroy(): void {
    this.cancelResultTimer();
    if(this.pollTimer) clearInterval(this.pollTimer);
    if(this.clockTimer) clearInterval(this.clockTimer);
    this.display.leave();
  }

  private onSnapshot(next: DisplaySnapshot): void {
    this.lastPacketAt = Date.now();
    this.offline.set(false);
    if (next.revision <= this.lastRevision) return; // heartbeat: connectivity without restarting thank-you
    this.lastRevision = next.revision;
    this.companyName.set(next.establishment);
    // Do not allow an idle cashier to interrupt a customer's unfinished payment
    // or to erase the post-payment acknowledgement.
    if (next.phase === 'idle' &&
       (this.screen() === 'awaiting' || this.screen() === 'success' || this.screen() === 'recorded')) return;
    if (next.phase === 'awaiting' && this.screen() === 'success' &&
       this.activeToken === next.receiptToken) return;
    if (next.phase === 'recorded' && Date.now()-next.issuedAt > DISPLAY_RECORD_MS) {
      this.showIdle(next);
      return;
    }
    this.cancelResultTimer();
    this.snapshot.set(next);
    if (next.phase === 'idle') { this.activeToken = ''; this.screen.set('idle'); return; }
    if (next.phase === 'draft') { this.activeToken = ''; this.screen.set('draft'); return; }
    if (next.phase === 'recorded') {
      this.activeToken = '';
      this.screen.set('recorded');
      this.scheduleIdle(DISPLAY_RECORD_MS);
      return;
    }
    if (next.phase === 'awaiting') {
      if (next.receiptToken !== this.activeToken) {
        this.activeToken = next.receiptToken;
        this.paymentIssue.set('');
      }
      this.screen.set('awaiting');
      void this.verifyPayment();
    }
  }
  private showIdle(context: DisplaySnapshot | null): void {
    this.activeToken = '';
    this.screen.set('idle');
    if (context) this.snapshot.set({...context,phase:'idle',items:[],total:0,
      discount:0,prepaid:0,receiptToken:'',paymentUrl:''});
  }
  private scheduleIdle(ms: number): void {
    this.cancelResultTimer();
    this.resultTimer = setTimeout(()=>this.showIdle(this.snapshot()),ms);
  }
  private cancelResultTimer(): void {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = null;
  }
  private async verifyPayment(): Promise<void> {
    const token = this.activeToken;
    if (!token || this.verifyingToken || this.screen() !== 'awaiting') return;
    this.verifyingToken = token;
    this.checkingPayment.set(true);
    try {
      const response = await boundedFetch('/api/billing?action=connect-receipt&token=' +
        encodeURIComponent(token),{cache:'no-store'});
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (this.activeToken !== token || this.screen() !== 'awaiting') return;
      if (confirmedByProvider(token,data)) {
        this.verifiedAt.set(Date.now());
        this.screen.set('success');
        this.scheduleIdle(DISPLAY_SUCCESS_MS);
      } else if (data && typeof data === 'object') {
        const result = data as {online?:boolean;status?:string};
        if (result.online === false) {
          this.paymentIssue.set('Esta comanda não possui uma cobrança Stripe ativa. Confira com a recepção.');
          this.screen.set('issue');
        } else if (result.online === true &&
                   ['expired','refunded','refund_pending','disputed','cancelled'].includes(result.status || '')) {
          this.paymentIssue.set('Não foi possível concluir a cobrança. Peça ajuda à recepção.');
          this.screen.set('issue');
        }
      }
    } catch {
      // Network failure is NOT evidence that Stripe has paid.
    } finally {
      if(this.verifyingToken === token) this.verifyingToken = '';
      this.checkingPayment.set(false);
    }
  }
  async fullscreen(): Promise<void> {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); }
    catch { /* Platform may not support fullscreen, especially iPhone Safari. */ }
  }
}