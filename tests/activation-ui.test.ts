// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync, globSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { ActivationSummaryComponent } from '../src/app/components/activation-summary/activation-summary';
import { EstabelecimentoService } from '../src/app/services/estabelecimento.service';
import { SupabaseService } from '../src/app/services/supabase.service';
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
let tenant: BehaviorSubject<any>, rpc: ReturnType<typeof vi.fn>;
const summary = {
  period_start: '2026-10-01',
  period_end: '2026-10-14',
  during_trial: true,
  services_ready: false,
  staff_ready: false,
  schedule_ready: false,
  first_booking: false,
  appointments: 0,
  completed: 0,
  public_bookings: 0,
  clients: 0,
  cash_records: 0,
};
beforeEach(async () => {
  await ɵresolveComponentResources((url) =>
    Promise.resolve(readFileSync(globSync('src/app/**/' + url.replace(/^\.\//, ''))[0], 'utf8')),
  );
  TestBed.resetTestingModule();
  tenant = new BehaviorSubject<any>({ id: 'a', nome: 'Studio', slug: 'studio' });
  rpc = vi.fn().mockResolvedValue({ data: summary, error: null });
  TestBed.configureTestingModule({
    imports: [ActivationSummaryComponent],
    providers: [
      provideRouter([]),
      { provide: EstabelecimentoService, useValue: { estabelecimento$: tenant } },
      { provide: SupabaseService, useValue: { client: { rpc } } },
    ],
  });
});
it('shows just the next step on the dashboard and removes the prompt once setup is complete', async () => {
  const f = TestBed.createComponent(ActivationSummaryComponent);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  expect(f.nativeElement.querySelector('.primary').getAttribute('href')).toBe(
    '/admin/primeiros-passos',
  );
  expect(f.nativeElement.querySelector('.metrics')).toBeNull();
  expect(f.nativeElement.querySelector('app-quick-start')).toBeNull();
  rpc.mockResolvedValue({
    data: {
      ...summary,
      services_ready: true,
      staff_ready: true,
      schedule_ready: true,
      first_booking: true,
    },
  });
  await f.componentInstance.refresh();
  f.detectChanges();
  expect(f.nativeElement.querySelector('.activation-next')).toBeNull();
  f.destroy();
});
it('keeps detailed progress and the public link in the explicit setup page', async () => {
  const f = TestBed.createComponent(ActivationSummaryComponent);
  f.componentInstance.expanded = true;
  rpc.mockResolvedValue({
    data: {
      ...summary,
      services_ready: true,
      staff_ready: true,
      schedule_ready: true,
      first_booking: true,
      appointments: 5,
    },
  });
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  expect(f.nativeElement.textContent).toContain('4 de 4');
  expect(f.nativeElement.querySelector('.metrics strong').textContent).toBe('5');
  expect(f.nativeElement.querySelector('[target=_blank]').getAttribute('href')).toBe(
    '/agendar/studio',
  );
  expect(f.nativeElement.querySelector('details.value').open).toBe(false);
  f.destroy();
});
it('does not report zero usage on failure and discards a stale tenant response', async () => {
  rpc.mockResolvedValue({ error: { message: 'network' } });
  const f = TestBed.createComponent(ActivationSummaryComponent);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  expect(f.nativeElement.querySelector('[role=alert]')).not.toBeNull();
  expect(f.nativeElement.querySelector('.metrics')).toBeNull();
  let resolveA: (x: any) => void = () => {};
  rpc.mockImplementation(() => new Promise((r) => (resolveA = r)));
  const pending = f.componentInstance.refresh();
  rpc.mockResolvedValue({ data: { ...summary, clients: 9 } });
  tenant.next({ id: 'b', nome: 'Outro negócio' });
  await f.whenStable();
  resolveA({ data: { ...summary, clients: 100 } });
  await pending;
  expect(f.componentInstance.summary?.clients).toBe(9);
  f.destroy();
});
