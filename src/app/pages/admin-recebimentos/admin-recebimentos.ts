import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { ConnectPayments } from '../../components/connect-payments/connect-payments';
@Component({
  selector: 'app-admin-recebimentos',
  standalone: true,
  imports: [CommonModule, RouterLink, ConnectPayments],
  template: ` <div class="ag-page receipts-page">
    <a class="back" routerLink="/admin/caixa">← Voltar ao caixa</a>
    <header>
      <div>
        <h1>Recebimentos online</h1>
        <p>Receba por link e acompanhe o caminho do dinheiro até sua conta.</p>
      </div>
      <span class="provider"
        ><i class="pi pi-lock" aria-hidden="true"></i> Processado pela Stripe</span
      >
    </header>
    <p class="return-note" role="status" *ngIf="returning">
      Você voltou da Stripe. Estamos conferindo a situação da conta. Se houver informações
      pendentes, continue o cadastro abaixo.
    </p>
    <app-connect-payments
      *ngIf="est.estabelecimento$ | async as tenant; else waiting"
      [tenantId]="tenant.id || ''"
    ></app-connect-payments>
    <ng-template #waiting><p role="status">Carregando seu estabelecimento…</p></ng-template>
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .receipts-page {
        max-width: 1040px;
        margin: auto;
        color: var(--text-main, #172033);
      }
      .back {
        color: var(--primary-color, #655cf0);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 24px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: start;
        margin-bottom: 30px;
      }
      h1 {
        font-size: clamp(1.6rem, 3vw, 2rem);
        margin: 0 0 8px;
        letter-spacing: -0.035em;
      }
      header p {
        color: var(--text-muted, #64748b);
        margin: 0;
        line-height: 1.6;
      }
      .provider {
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        font-size: 0.8rem;
        color: var(--text-muted, #64748b);
        padding-top: 8px;
      }
      .return-note {
        padding: 16px;
        background: #eef2ff;
        border-radius: 10px;
        line-height: 1.6;
      }
      @media (max-width: 600px) {
        header {
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }
        .provider {
          padding: 0;
        }
      }
    `,
  ],
})
export class AdminRecebimentos {
  est = inject(EstabelecimentoService);
  returning = ['return', 'refresh'].includes(
    inject(ActivatedRoute).snapshot.queryParamMap.get('connect') || '',
  );
}
