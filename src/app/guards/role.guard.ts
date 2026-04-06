import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

/**
 * Guarda de Rotas baseada em Roles (Cargos).
 * Exemplo de uso nas rotas:
 * { path: 'financeiro', component: FinComponent, canActivate: [roleGuard], data: { roles: ['dono', 'financeiro'] } }
 */
export const roleGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Garante que temos uma sessão ativa
  const hasSession = await authService.checkSession();
  if (!hasSession) return router.parseUrl('/login');

  // 2. Obtém o perfil do usuário (primeira emissão válida)
  const profile = await firstValueFrom(authService.profile$);
  
  if (!profile) {
    // Se não houver perfil, redireciona para o login (segurança)
    return router.parseUrl('/login');
  }

  const allowedRoles: string[] = route.data?.['roles'] || [];

  // 3. Se a rota não exigir roles específicos, permite acesso (auth-only)
  if (allowedRoles.length === 0) return true;

  // 4. Verifica se o cargo do usuário está na lista de permitidos
  if (allowedRoles.includes(profile.role)) {
    return true;
  }

  // 5. Acesso Negado: Redireciona para o admin principal (home do colaborador)
  return router.parseUrl('/admin');
};
