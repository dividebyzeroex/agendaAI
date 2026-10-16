// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest';
import { ComandaComponent } from '../src/app/pages/comanda/comanda';
import { SupabaseService } from '../src/app/services/supabase.service';
import { EstabelecimentoService } from '../src/app/services/estabelecimento.service';
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
afterEach(() => vi.useRealTimers());
let rpc: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await ɵresolveComponentResources((url) =>
    Promise.resolve(readFileSync('src/app/pages/comanda/' + url.replace(/^\.\//, ''), 'utf8')),
  );
  TestBed.resetTestingModule();
  rpc = vi.fn();
  TestBed.overrideComponent(ComandaComponent, {
    set: {
      template: readFileSync('src/app/pages/comanda/comanda.html', 'utf8'),
      templateUrl: undefined,
      styleUrls: [],
    },
  });
  TestBed.configureTestingModule({
    imports: [ComandaComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: new Map([['token', 'receipt-token']]) } },
      },
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: EstabelecimentoService, useValue: { estabelecimento$: of(null) } },
    ],
  });
  await TestBed.compileComponents();
});
it('replaces the spinner with the receipt after an asynchronous response without user interaction', async () => {
  let resolve: any;
  const pending = new Promise((r) => (resolve = r));
  rpc.mockReturnValue({ abortSignal: () => pending });
  const f = TestBed.createComponent(ComandaComponent);
  f.autoDetectChanges();
  expect(f.nativeElement.textContent).toContain('Carregando');
  resolve({
    data: {
      cliente_nome: 'Ana',
      produtos: [],
      servicos: [],
      valor_total: 50,
      status_caixa: 'pago',
    },
    error: null,
  });
  await vi.waitFor(() => expect(f.componentInstance.loading()).toBe(false));
  await f.whenStable();
  expect(f.nativeElement.textContent).toContain('Ana');
  expect(f.nativeElement.textContent).not.toContain('Carregando');
});
it('shows an error then allows a successful retry', async () => {
  rpc
    .mockReturnValueOnce({ abortSignal: () => Promise.resolve({ error: { message: 'Failed' } }) })
    .mockReturnValueOnce({
      abortSignal: () =>
        Promise.resolve({ data: { cliente_nome: 'Ana', produtos: [], servicos: [] } }),
    });
  const f = TestBed.createComponent(ComandaComponent);
  f.autoDetectChanges();
  await vi.waitFor(() => expect(f.componentInstance.loading()).toBe(false));
  await f.whenStable();
  f.nativeElement.querySelector('button').click();
  await vi.waitFor(() => expect(f.componentInstance.loading()).toBe(false));
  await f.whenStable();
  expect(f.nativeElement.textContent).toContain('Ana');
  expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
});
it('ends a stalled request after twenty seconds and ignores its late response', async () => {
  vi.useFakeTimers();
  let resolve: any;
  let signal: AbortSignal | undefined;
  rpc.mockReturnValue({
    abortSignal: (s: AbortSignal) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    },
  });
  const f = TestBed.createComponent(ComandaComponent);
  const c = f.componentInstance;
  c.token = 'receipt-token';
  const pending = c.carregarComanda();
  await vi.advanceTimersByTimeAsync(20000);
  await pending;
  expect(c.loading()).toBe(false);
  expect(c.error()).toContain('Não foi possível');
  expect(signal?.aborted).toBe(true);
  resolve({ data: { cliente_nome: 'Late' } });
  await Promise.resolve();
  expect(c.caixaItem).toBeNull();
});
