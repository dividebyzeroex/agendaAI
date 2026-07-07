import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { Login } from './pages/login/login';
import { PrimeiroAcesso } from './pages/primeiro-acesso/primeiro-acesso';
import { Agendar } from './pages/agendar/agendar';
import { Onboarding } from './pages/onboarding/onboarding';
import { AdminLayout } from './layouts/admin-layout/admin-layout';

import { Admin } from './pages/admin/admin';
import { AdminAgenda } from './pages/admin-agenda/admin-agenda';
import { AdminClientes } from './pages/admin-clientes/admin-clientes';
import { AdminConfiguracoes } from './pages/admin-configuracoes/admin-configuracoes';
import { AdminAnalytics } from './pages/admin-analytics/admin-analytics';
import { AdminProfissionais } from './pages/admin-profissionais/admin-profissionais';
import { AdminBilling } from './pages/admin-billing/admin-billing';
import { AdminChatbots } from './pages/admin-chatbots/admin-chatbots';
import { authGuard } from './guards/auth.guard';
import { billingGuard } from './guards/billing.guard';
import { roleGuard } from './guards/role.guard';
import { platformOwnerGuard } from './guards/platform-owner.guard';

import { PlatformLayout } from './layouts/platform-layout/platform-layout';
import { PlatformDashboard } from './pages/platform-dashboard/platform-dashboard';
import { PlatformTenants } from './pages/platform-tenants/platform-tenants';
import { PlatformObservability } from './pages/platform-observability/platform-observability';
import { PlatformSocial } from './pages/platform-social/platform-social';
import { PlatformBilling } from './pages/platform-billing/platform-billing';
import { PlatformSettings } from './pages/platform-settings/platform-settings';

export const routes: Routes = [
  { path: '', component: Landing, pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'primeiro-acesso', component: PrimeiroAcesso },
  { path: 'onboarding', component: Onboarding, canActivate: [authGuard] },
  // Rota pública de agendamento — /agendar/:slug (ex: /agendar/barbearia-do-joao)
  { path: 'agendar/:slug', component: Agendar },
  // Fallback genérico sem slug
  { path: 'agendar', component: Agendar },

  { 
    path: 'admin', 
    component: AdminLayout,
    canActivate: [authGuard, billingGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Admin },
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
      },
      { 
        path: 'chatbots', 
        component: AdminChatbots, 
        canActivate: [roleGuard], 
        data: { roles: ['dono'] } 
      }
    ]
  },
  {
    path: 'platform-admin',
    component: PlatformLayout,
    canActivate: [platformOwnerGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: PlatformDashboard },
      { path: 'tenants', component: PlatformTenants },
      { path: 'observability', component: PlatformObservability },
      { path: 'social', component: PlatformSocial },
      { path: 'billing', component: PlatformBilling },
      { path: 'settings', component: PlatformSettings }
    ]
  },
  { path: '**', redirectTo: '' }
];
