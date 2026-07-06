import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs';

export const platformOwnerGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.checkSession();
  const profile = authService.userProfileValue;

  if (profile?.role === 'superadmin' || profile?.email === 'joao.almeida_msbrasil@outlook.com') {
    return true;
  }
  
  return router.parseUrl('/login');
};
