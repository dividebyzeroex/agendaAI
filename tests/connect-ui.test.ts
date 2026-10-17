// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest';
import { ConnectPayments } from '../src/app/components/connect-payments/connect-payments';
import { SupabaseService } from '../src/app/services/supabase.service';
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
const base = {
  available: true,
  linked: false,
  ready: false,
  enabled: false,
  termsVersion: 'version',
  orders: [],
  payouts: [],
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await ɵresolveComponentResources((url) =>
    Promise.resolve(
      readFileSync('src/app/components/connect-payments/' + url.replace(/^\.\//, ''), 'utf8'),
    ),
  );
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => base });
  vi.stubGlobal('fetch', fetchMock);
  TestBed.configureTestingModule({
    imports: [ConnectPayments],
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          client: {
            auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } } }) },
          },
        },
      },
    ],
  });
  await TestBed.compileComponents();
});
async function render(state: any = base) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => state });
  const f = TestBed.createComponent(ConnectPayments);
  f.componentRef.setInput('tenantId', 'tenant-a');
  f.autoDetectChanges();
  await vi.waitFor(() => expect(f.componentInstance.busy()).toBe(false));
  await f.whenStable();
  return f;
}
it('shows a dedicated unlinked flow with explicit consent before linking', async () => {
  const f = await render();
  expect(f.nativeElement.textContent).toContain('Ainda não vinculada');
  expect(f.nativeElement.querySelector('button.primary').disabled).toBe(true);
  const checkbox = f.nativeElement.querySelector('input[type=checkbox]');
  checkbox.click();
  await f.whenStable();
  expect(f.nativeElement.querySelector('button.primary').disabled).toBe(false);
});
it('shows pending requirements and then a separate activation action for a ready account', async () => {
  const f = await render({ ...base, linked: true });
  expect(f.nativeElement.textContent).toContain('Continuar cadastro na Stripe');
  f.componentInstance.state.set({ ...base, linked: true, ready: true });
  await f.whenStable();
  expect(f.nativeElement.textContent).toContain('Ativar recebimentos online');
  expect(f.nativeElement.textContent).not.toContain('Continuar cadastro na Stripe');
});
it('pauses an active account without new acceptance and keeps its history visible', async () => {
  const f = await render({
    ...base,
    linked: true,
    ready: true,
    enabled: true,
    orders: [
      {
        id: 'o',
        status: 'paid',
        created_at: '2026-10-16',
        amount_cents: 5000,
        fee_cents: 100,
        refunded_cents: 1000,
        net_cents: 4800,
      },
    ],
    payouts: [],
  });
  expect(f.componentInstance.recentPaid).toBe(40);
  expect(f.nativeElement.textContent).toContain('Cobranças recentes');
  expect(f.nativeElement.querySelector('input[type=checkbox]')).toBeNull();
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...base, linked: true, ready: true }),
    });
  await f.componentInstance.toggle();
  const mutation = fetchMock.mock.calls.find((c) => String(c[0]).includes('connect-settings'));
  expect(JSON.parse(mutation![1].body)).toMatchObject({
    estabelecimentoId: 'tenant-a',
    enabled: false,
  });
  expect(f.componentInstance.state().enabled).toBe(false);
});
it('shows a recoverable error after a failed status request', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Tente novamente mais tarde.' }),
  });
  const f = TestBed.createComponent(ConnectPayments);
  f.componentRef.setInput('tenantId', 'tenant-a');
  f.autoDetectChanges();
  await vi.waitFor(() => expect(f.componentInstance.busy()).toBe(false));
  await f.whenStable();
  expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain(
    'Tente novamente mais tarde.',
  );
  await f.componentInstance.load();
  await f.whenStable();
  expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
});
it('ignores a stale response when the tenant changes', async () => {
  let resolve: any;
  fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const f = TestBed.createComponent(ConnectPayments);
  f.componentRef.setInput('tenantId', 'tenant-a');
  f.autoDetectChanges();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  f.componentRef.setInput('tenantId', 'tenant-b');
  await f.whenStable();
  await vi.waitFor(() => expect(f.componentInstance.state()).toEqual(base));
  resolve({ ok: true, json: async () => ({ ...base, linked: true }) });
  await new Promise((r) => setTimeout(r, 0));
  expect(f.componentInstance.state().linked).toBe(false);
});
