// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync, globSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA, ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { AdminLayout } from '../src/app/layouts/admin-layout/admin-layout';
import { AuthService } from '../src/app/services/auth.service';
import { EstabelecimentoService } from '../src/app/services/estabelecimento.service';
import { AppActivityService } from '../src/app/services/app-activity.service';
import { NotificationService } from '../src/app/services/notification.service';
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
let profile: BehaviorSubject<any>;
beforeEach(async () => {
  await ɵresolveComponentResources((url) =>
    Promise.resolve(readFileSync(globSync('src/app/**/' + url.replace(/^\.\//, ''))[0], 'utf8')),
  );
  TestBed.resetTestingModule();
  profile = new BehaviorSubject({ role: 'dono', nome: 'João' });
  TestBed.configureTestingModule({
    imports: [AdminLayout],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { profile$: profile, logout: vi.fn(),setUnitRole:vi.fn() } },
      {
        provide: EstabelecimentoService,
        useValue: { units$:new BehaviorSubject([]),estabelecimento$: new BehaviorSubject({ nome: 'Meu Studio', slug: 'studio' }) },
      },
      { provide: AppActivityService, useValue: {} },
      NotificationService,
    ],
  });
  TestBed.overrideComponent(AdminLayout, {
    set: {
      template: readFileSync('src/app/layouts/admin-layout/admin-layout.html', 'utf8'),
      styles: [],
      styleUrls: [],
      imports: [CommonModule, RouterModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    },
  });
});
it('keeps four daily destinations visible and management discoverable without automatically opening a tutorial', async () => {
  const f = TestBed.createComponent(AdminLayout);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  const nav = f.nativeElement.querySelector('nav.sidebar-nav');
  expect(
    Array.from(nav.querySelectorAll(':scope > a')).map((a: any) => a.textContent.trim()),
  ).toEqual(['Hoje', 'Agenda', 'Clientes', 'Caixa']);
  expect(nav.querySelector('details').open).toBe(false);
  expect(nav.textContent).toContain('Plano e assinatura');
  expect(f.nativeElement.querySelector('app-onboarding-modal')).toBeNull();
  profile.next({ role: 'financeiro', nome: 'Financeiro' });
  await f.whenStable();
  f.detectChanges();
  expect(
    Array.from(nav.querySelectorAll(':scope > a')).map((a: any) => a.textContent.trim()),
  ).toEqual(['Hoje', 'Agenda', 'Caixa']);
  expect(nav.textContent).not.toContain('Plano e assinatura');
  f.destroy();
});
it('opens a usable mobile menu while keeping the background content inert', async () => {
  const f = TestBed.createComponent(AdminLayout);
  f.componentInstance.isMobile = true;
  f.detectChanges();
  await f.whenStable();
  const button = f.nativeElement.querySelector('[aria-label="Abrir menu"]');
  button.click();
  f.detectChanges();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(f.nativeElement.querySelector('#customer-content').hasAttribute('inert')).toBe(true);
  f.nativeElement.querySelector('[aria-label="Fechar menu"]').click();
  f.detectChanges();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(f.nativeElement.querySelector('#customer-content').hasAttribute('inert')).toBe(false);
  f.destroy();
});
