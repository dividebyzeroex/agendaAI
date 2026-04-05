import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BillingService } from '../services/billing.service';
import { map, take } from 'rxjs';

/**
 * Guard para garantir que o estabelecimento tenha uma assinatura ativa 
 * ou esteja dentro do período de carência de 5 dias.
 */
export const billingGuard: CanActivateFn = (route, state) => {
  const billingService = inject(BillingService);
  const router = inject(Router);

  // Se o usuário já está tentando acessar a página de faturamento, permita sempre
  if (state.url.includes('/admin/billing')) {
    return true;
  }

  return billingService.canAccessAdmin().pipe(
    take(1),
    map(canAccess => {
      if (canAccess) {
        return true;
      }

      // Se não tem acesso, redireciona para a página de billing
      console.warn('[BillingGuard] Acesso negado: Plano expirado há mais de 5 dias.');
      return router.parseUrl('/admin/billing');
    })
  );
};
