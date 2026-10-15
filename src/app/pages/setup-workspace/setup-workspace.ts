import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivationSummaryComponent } from '../../components/activation-summary/activation-summary';
@Component({
  selector: 'app-setup-workspace',
  standalone: true,
  imports: [RouterLink, ActivationSummaryComponent],
  template: `<div class="customer-page">
    <a class="back-link" routerLink="/admin/dashboard"
      ><i class="pi pi-arrow-left" aria-hidden="true"></i> Voltar ao início</a
    >
    <header class="page-heading">
      <div>
        <h1>Preparar minha agenda</h1>
        <p>Comece pequeno. Você pode ajustar tudo depois.</p>
      </div>
    </header>
    <app-activation-summary [expanded]="true"></app-activation-summary>
  </div>`,
})
export class SetupWorkspace {}
