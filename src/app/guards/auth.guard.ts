import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Aguarda a resolução do URL hash pelo Supabase antes de julgar o bloqueio
  const hasSession = await authService.checkSession();
  
  if (hasSession) {
    return true;
  }

  // Not logged in, redirect home/login
  return router.parseUrl('/login');
};
