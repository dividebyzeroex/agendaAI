import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs';

export const platformOwnerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.profile$.pipe(
    take(1),
    map(profile => {
      // Check if user is the platform owner based on role or email
      if (profile?.role === 'superadmin' || profile?.email === 'joao.almeida_msbrasil@outlook.com') {
        return true;
      }
      
      // Se não for o superadmin, redireciona para login ou admin normal
      router.navigate(['/login']);
      return false;
    })
  );
};
