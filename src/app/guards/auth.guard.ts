import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Aguarda a resolução do URL hash pelo Supabase antes de julgar o bloqueio
  const hasSession = await authService.checkSession();
  
  if (hasSession) {
    const profile = authService.userProfileValue;
    const isPrimeiroAcesso = profile?.primeiro_acesso || false;
    const onboardingPendente = !profile?.onboarding_concluido;

    // Se estiver em primeiro acesso ou onboarding pendente, e NÃO estiver na rota de primeiro-acesso
    if ((isPrimeiroAcesso || onboardingPendente) && state.url !== '/primeiro-acesso') {
      return router.parseUrl('/primeiro-acesso');
    }

    return true;
  }

  // Not logged in, redirect home/login
  return router.parseUrl('/login');
};
