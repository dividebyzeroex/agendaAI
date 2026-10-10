import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';

import { authGuard } from './guards/auth.guard';
import { billingGuard } from './guards/billing.guard';
import { roleGuard } from './guards/role.guard';
import { platformOwnerGuard } from './guards/platform-owner.guard';


export const routes: Routes = [
  { path: '', component: Landing, pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'termos', loadComponent: () => import('./pages/terms/terms').then(m => m.Terms) },
  { path: 'primeiro-acesso', loadComponent: () => import('./pages/primeiro-acesso/primeiro-acesso').then(m => m.PrimeiroAcesso) },
  { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding').then(m => m.Onboarding), canActivate: [authGuard] },
  // Rota pública de agendamento — /agendar/:slug (ex: /agendar/barbearia-do-joao)
  { path: 'agendar/:slug', loadComponent: () => import('./pages/agendar/agendar').then(m => m.Agendar) },
  // Fallback genérico sem slug
  { path: 'agendar', loadComponent: () => import('./pages/agendar/agendar').then(m => m.Agendar) },
  // Rota pública para visualização de comanda
  { path: 'comanda/:token', loadComponent: () => import('./pages/comanda/comanda').then(m => m.ComandaComponent) },

  {
    path: 'admin',
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [authGuard, billingGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/admin/admin').then(m => m.Admin) },
      { path: 'portal', loadComponent: () => import('./components/portal-profissional/portal-profissional').then(m => m.PortalProfissionalComponent) },
      { path: 'agenda', loadComponent: () => import('./pages/admin-agenda/admin-agenda').then(m => m.AdminAgenda) },
      { path: 'clientes', loadComponent: () => import('./pages/admin-clientes/admin-clientes').then(m => m.AdminClientes) },
      { path: 'configuracoes', loadComponent: () => import('./pages/admin-configuracoes/admin-configuracoes').then(m => m.AdminConfiguracoes) },
      {
        path: 'analytics',
        loadComponent: () => import('./pages/admin-analytics/admin-analytics').then(m => m.AdminAnalytics),
        canActivate: [roleGuard],
        data: { roles: ['dono', 'financeiro'] }
      },
      {
        path: 'profissionais',
        loadComponent: () => import('./pages/admin-profissionais/admin-profissionais').then(m => m.AdminProfissionais),
        canActivate: [roleGuard],
        data: { roles: ['dono'] }
      },
      {
        path: 'produtos',
        loadComponent: () => import('./pages/admin-produtos/admin-produtos').then(m => m.AdminProdutos),
        canActivate: [roleGuard],
        data: { roles: ['dono', 'gerente'] }
      },
      {
        path: 'caixa',
        loadComponent: () => import('./pages/admin-caixa/admin-caixa').then(m => m.AdminCaixa),
        canActivate: [roleGuard],
        data: { roles: ['dono', 'financeiro', 'recepcionista'] }
      },
      {
        path: 'comissoes',
        loadComponent: () => import('./pages/admin-comissoes/admin-comissoes').then(m => m.AdminComissoes),
        canActivate: [roleGuard],
        data: { roles: ['dono', 'financeiro', 'barbeiro'] }
      },
      {
        path: 'billing',
        loadComponent: () => import('./pages/admin-billing/admin-billing').then(m => m.AdminBilling),
        canActivate: [roleGuard],
        data: { roles: ['dono'] }
      },
      {
        path: 'chatbots',
        redirectTo: 'configuracoes', pathMatch: 'full'
      }
    ]
  },
  {
    path: 'platform-admin',
    loadComponent: () => import('./layouts/platform-layout/platform-layout').then(m => m.PlatformLayout),
    canActivate: [platformOwnerGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/platform-dashboard/platform-dashboard').then(m => m.PlatformDashboard) },
      { path: 'growth', loadComponent: () => import('./pages/platform-growth/platform-growth').then(m => m.PlatformGrowth) },
      { path: 'tenants', loadComponent: () => import('./pages/platform-tenants/platform-tenants').then(m => m.PlatformTenants) },
      { path: 'observability', redirectTo: 'growth', pathMatch: 'full' },
      { path: 'social', redirectTo: 'growth', pathMatch: 'full' },
      { path: 'billing', loadComponent: () => import('./pages/platform-billing/platform-billing').then(m => m.PlatformBilling) },
      { path: 'settings', loadComponent: () => import('./pages/platform-settings/platform-settings').then(m => m.PlatformSettings) }
    ]
  },
  { path: '**', redirectTo: '' }
];
