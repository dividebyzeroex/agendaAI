import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { Login } from './pages/login/login';
import { LoginPro } from './pages/login-pro/login-pro';
import { Agendar } from './pages/agendar/agendar';
import { Profissional } from './pages/profissional/profissional';
import { Onboarding } from './pages/onboarding/onboarding';
import { AdminLayout } from './layouts/admin-layout/admin-layout';

import { Admin } from './pages/admin/admin';
import { AdminAgenda } from './pages/admin-agenda/admin-agenda';
import { AdminClientes } from './pages/admin-clientes/admin-clientes';
import { AdminConfiguracoes } from './pages/admin-configuracoes/admin-configuracoes';
import { AdminAnalytics } from './pages/admin-analytics/admin-analytics';
import { AdminProfissionais } from './pages/admin-profissionais/admin-profissionais';
import { AdminBilling } from './pages/admin-billing/admin-billing';
import { authGuard } from './guards/auth.guard';
import { billingGuard } from './guards/billing.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', component: Landing, pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'login-pro', component: LoginPro },
  { path: 'onboarding', component: Onboarding, canActivate: [authGuard] },
  // Rota pública de agendamento — /agendar/:slug (ex: /agendar/barbearia-do-joao)
  { path: 'agendar/:slug', component: Agendar },
  // Fallback genérico sem slug
  { path: 'agendar', component: Agendar },

  // Portal do Profissional — /pro/:slug (ex: /pro/barbearia-do-joao)
  { path: 'pro/:slug', component: Profissional },
  { path: 'pro',       component: Profissional },

  { 
    path: 'admin', 
    component: AdminLayout,
    canActivate: [authGuard, billingGuard],
    children: [
      { path: '', component: Admin, pathMatch: 'full' },
      { path: 'agenda', component: AdminAgenda },
      { path: 'clientes', component: AdminClientes },
      { path: 'configuracoes', component: AdminConfiguracoes },
      { 
        path: 'analytics', 
        component: AdminAnalytics, 
        canActivate: [roleGuard], 
        data: { roles: ['dono', 'financeiro'] } 
      },
      { 
        path: 'profissionais', 
        component: AdminProfissionais, 
        canActivate: [roleGuard], 
        data: { roles: ['dono'] } 
      },
      { 
        path: 'billing', 
        component: AdminBilling, 
        canActivate: [roleGuard], 
        data: { roles: ['dono'] } 
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
