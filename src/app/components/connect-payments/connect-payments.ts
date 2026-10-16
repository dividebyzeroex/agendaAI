import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
@Component({
  selector: 'app-connect-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <details class="disclosure">
    <summary>Receber pela aplicação · Stripe Connect</summary>
    <p>Opcional. Sem conta vinculada, você recebe no estabelecimento e registra no caixa.</p>
    <p>
      Taxa AgendaAI: <strong>R$ 1,00 por pagamento confirmado</strong>, descontada do
      estabelecimento, além das tarifas Stripe. O preço do cliente não aumenta.
    </p>
    <p *ngIf="busy()" role="status">Conferindo recebimentos…</p>
    <p *ngIf="error()" role="alert">{{ error() }}</p>
    <ng-container *ngIf="state() as s">
      <p *ngIf="!s.available">Recebimento online aguardando configuração da plataforma.</p>
      <p *ngIf="s.linked">
        {{
          s.ready ? 'Cadastro Stripe concluído.' : 'Conclua as informações solicitadas pela Stripe.'
        }}
        {{ s.enabled ? 'Recebimento online ativado.' : 'Recebimento presencial selecionado.' }}
      </p>
      <label *ngIf="s.available"
        ><input type="checkbox" [(ngModel)]="accepted" /> Aceito a taxa de R$ 1,00, as tarifas
        Stripe e os prazos de disponibilização e repasse apresentados pela Stripe.</label
      >
      <p>
        <button type="button" (click)="onboard()" [disabled]="busy() || !s.available || !accepted">
          {{ s.linked ? 'Continuar cadastro na Stripe' : 'Vincular conta Stripe' }}
        </button>
      </p>
      <button
        *ngIf="s.linked"
        type="button"
        (click)="toggle()"
        [disabled]="busy() || (!s.enabled && (!s.ready || !s.available || !accepted))"
      >
        {{ s.enabled ? 'Usar somente recebimentos presenciais' : 'Ativar recebimento online' }}
      </button>
      <p>
        Os repasses bancários são processados pela Stripe conforme saldo disponível e calendário da
        conta.
        {{
          s.schedule === 'manual'
            ? 'A conta está com repasse manual; ajuste no painel Stripe para receber automaticamente.'
            : ''
        }}
      </p>
      <a *ngIf="s.linked" href="https://dashboard.stripe.com" target="_blank" rel="noopener"
        >Gerenciar banco, repasses e contestações na Stripe</a
      >
      <details *ngIf="s.orders?.length">
        <summary>Cobranças online recentes</summary>
        <article *ngFor="let o of s.orders">
          <p>
            {{ o.created_at | date: 'dd/MM HH:mm' }} ·
            {{ o.amount_cents / 100 | currency: 'BRL' }} · {{ label(o.status) }}
          </p>
          <small
            >Taxa AgendaAI: {{ o.fee_cents / 100 | currency: 'BRL'
            }}<span *ngIf="o.net_cents !== null">
              · Líquido original Stripe: {{ o.net_cents / 100 | currency: 'BRL' }}</span
            ></small
          >
          <p *ngIf="o.refunded_cents">
            Valor reembolsado: {{ o.refunded_cents / 100 | currency: 'BRL' }}
          </p>
          <p>
            <button
              *ngIf="o.status === 'pending'"
              type="button"
              (click)="operate('cancel', o)"
              [disabled]="busy()"
            >
              Cancelar cobrança pendente</button
            ><button
              *ngIf="o.status === 'paid'"
              type="button"
              (click)="refundId.set(o.id)"
              [disabled]="busy()"
            >
              Reembolsar
            </button>
          </p>
          <p *ngIf="refundId() === o.id">
            Devolver {{ o.amount_cents / 100 | currency: 'BRL' }} ao cliente e a taxa AgendaAI? As
            tarifas de processamento seguem as regras da Stripe. Revise comissões já pagas e
            devolução dos produtos.
            <button type="button" (click)="operate('refund', o)" [disabled]="busy()">
              Confirmar reembolso total
            </button>
            <button type="button" (click)="refundId.set('')">Voltar</button>
          </p>
        </article>
      </details>
      <details *ngIf="s.payouts?.length">
        <summary>Repasses bancários</summary>
        <p *ngFor="let p of s.payouts">
          {{ p.amountCents / 100 | currency: 'BRL' }} · {{ label(p.status) }} · previsão
          {{ p.arrivalDate * 1000 | date: 'dd/MM/yyyy' }}
        </p>
      </details>
    </ng-container>
    <p>
      <button type="button" (click)="load()" [disabled]="busy()">Atualizar recebimentos</button>
    </p>
  </details>`,
  styles: [
    `
      article {
        padding: 12px 0;
        border-top: 1px solid #e2e8f0;
      }
      button {
        margin: 4px 8px 4px 0;
        padding: 8px 12px;
        cursor: pointer;
      }
      label {
        display: block;
        margin: 12px 0;
      }
      small {
        color: #475569;
      }
    `,
  ],
})
export class ConnectPayments implements OnChanges {
  @Input() tenantId = '';
  private db = inject(SupabaseService).client;
  state = signal<any>(null);
  busy = signal(false);
  error = signal('');
  refundId = signal('');
  accepted = false;
  private generation = 0;
  ngOnChanges() {
    this.state.set(null);
    this.accepted = false;
    void this.load();
  }
  private async request(action: string, body?: any) {
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (!session) throw Error('Entre novamente para conferir os recebimentos.');
    const r = await boundedFetch(
      '/api/billing?action=connect-' +
        action +
        (body ? '' : '&estabelecimentoId=' + encodeURIComponent(this.tenantId)),
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify({ ...body, estabelecimentoId: this.tenantId }) } : {}),
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
      if (g === this.generation) this.state.set(state);
    } catch (e) {
      if (g === this.generation)
        this.error.set(e instanceof Error ? e.message : 'Falha ao conferir recebimentos.');
    } finally {
      if (g === this.generation) this.busy.set(false);
    }
  }
  async onboard() {
    this.busy.set(true);
    this.error.set('');
    try {
      const d = await this.request('onboard', {
        termsAccepted: this.accepted,
        termsVersion: this.state().termsVersion,
      });
      const url = new URL(d.url);
      if (
        url.protocol !== 'https:' ||
        !(url.hostname === 'connect.stripe.com' || url.hostname.endsWith('.stripe.com'))
      )
        throw Error('Link Stripe inválido.');
      window.location.assign(d.url);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Falha ao vincular.');
    } finally {
      this.busy.set(false);
    }
  }
  async toggle() {
    this.busy.set(true);
    try {
      await this.request('settings', {
        enabled: !this.state().enabled,
        termsAccepted: this.accepted,
        termsVersion: this.state().termsVersion,
      });
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      this.busy.set(false);
    }
  }
  async operate(action: string, o: any) {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.request(action, { orderId: o.id });
      this.refundId.set('');
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Falha na operação.');
    } finally {
      this.busy.set(false);
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
