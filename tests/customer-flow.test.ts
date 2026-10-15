// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync, globSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, ɵresolveComponentResources } from '@angular/core';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { AgendarModalComponent } from '../src/app/components/agendar-modal/agendar-modal.component';
import { NovoClienteModalComponent } from '../src/app/components/novo-cliente-modal/novo-cliente-modal.component';
import { Agendar } from '../src/app/pages/agendar/agendar';
import { Onboarding } from '../src/app/pages/onboarding/onboarding';
import { AdminClientes } from '../src/app/pages/admin-clientes/admin-clientes';
import { AdminCaixa } from '../src/app/pages/admin-caixa/admin-caixa';
import { ClienteService } from '../src/app/services/cliente.service';
import { EstabelecimentoService } from '../src/app/services/estabelecimento.service';
import { EstabelecimentoPublicoService } from '../src/app/services/estabelecimento-publico.service';
import { AgendaEventService } from '../src/app/services/agenda-event.service';
import { ProfissionalService } from '../src/app/services/profissional.service';
import { ProdutosService } from '../src/app/services/produtos.service';
import { SecurityService } from '../src/app/services/security.service';
import { AuthService } from '../src/app/services/auth.service';
import { SupabaseService } from '../src/app/services/supabase.service';
import { SmsService } from '../src/app/services/sms.service';
import { SegmentoConfigService } from '../src/app/services/segmento-config.service';
import { appointmentWindow } from '../src/app/utils/appointment-window';
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => {
  TestBed.resetTestEnvironment();
  vi.unstubAllGlobals();
});
let clients: any,
  est: any,
  agenda: any,
  pro: any,
  auth: any,
  db: any,
  params: Record<string, string>,
  query: Record<string, string>,
  navigate: any;
const service = { id: 'service', titulo: 'Corte', preco: 40, duracao_min: 45, ativo: true };
const customer = {
  id: 'client',
  nome: 'Ana',
  telefone: '11999999999',
  metadata: { petNome: 'Rex' },
};
beforeEach(async () => {
  await ɵresolveComponentResources((url) =>
    Promise.resolve(readFileSync(globSync('src/app/**/' + url.replace(/^\.\//, ''))[0], 'utf8')),
  );
  TestBed.resetTestingModule();
  params = {};
  query = { start: '2026-10-15T12:00:00Z' };
  navigate = vi.fn().mockResolvedValue(true);
  clients = {
    clientes$: new BehaviorSubject([customer]),
    loading$: new BehaviorSubject(false),
    error$: new BehaviorSubject(''),
    getClientes: () => clients.clientes$.value,
    addCliente: vi.fn().mockResolvedValue({ id: 'new-client' }),
    updateCliente: vi.fn().mockResolvedValue(customer),
  };
  est = {
    estabelecimento$: new BehaviorSubject({ id: 'tenant', nome: 'Studio', slug: 'studio' }),
    activeId$: new BehaviorSubject(null),
    servicos$: new BehaviorSubject([service]),
    fetchServicos: vi.fn().mockResolvedValue(undefined),
    createEstabelecimento: vi.fn().mockResolvedValue({ id: 'tenant' }),
  };
  agenda = {
    currentEvents: [],
    events$: new BehaviorSubject([]),
    addSeries: vi.fn().mockResolvedValue({ id: 'event' }),
  };
  pro = {
    fetchProfissionais: vi.fn().mockResolvedValue([{ id: 'pro', nome: 'João' }]),
    finalizarEEnviarCaixa: vi.fn().mockResolvedValue({ id: 'cash', token_publico: 'receipt' }),
    supabase: { from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })) },
  };
  auth = {
    userProfileValue: { id: 'user', nome: 'João', role: 'dono' },
    redirectAfterLogin: vi.fn().mockResolvedValue(undefined),
  };
  db = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user', email: 'user@example.test' } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-only', user: { id: 'user' } } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: { get: (k: string) => params[k] || null },
            queryParamMap: { get: (k: string) => query[k] || null, has: (k: string) => k in query },
          },
        },
      },
      { provide: ClienteService, useValue: clients },
      { provide: EstabelecimentoService, useValue: est },
      { provide: AgendaEventService, useValue: agenda },
      { provide: ProfissionalService, useValue: pro },
      { provide: SecurityService, useValue: { decryptData: async (s: string) => s } },
      { provide: AuthService, useValue: auth },
      { provide: SupabaseService, useValue: { client: db } },
      {
        provide: EstabelecimentoPublicoService,
        useValue: { getBusyIntervals: vi.fn().mockResolvedValue([]) },
      },
      { provide: ProdutosService, useValue: { produtos$: new BehaviorSubject([]) } },
      { provide: SmsService, useValue: {} },
      { provide: SegmentoConfigService, useValue: { current: { id: 'petshop' } } },
      { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
it('creates an appointment from one form, calculates the service duration, and preselects the sole professional', async () => {
  const f = TestBed.createComponent(AgendarModalComponent);
  f.detectChanges();
  await vi.waitFor(() => expect(f.componentInstance.loadingCatalog).toBe(false));
  f.detectChanges();
  expect(f.nativeElement.querySelector('[role=dialog]')).toBeNull();
  expect(f.nativeElement.querySelector('.disclosure').open).toBe(false);
  const c = f.componentInstance;
  expect(c.form.profissionalId).toBe('pro');
  expect(c.endTime).toBe('09:45');
  c.selectCliente(customer);
  c.day = '2026-10-16';
  c.time = '14:30';
  await c.confirmar();
  expect(agenda.addSeries).toHaveBeenCalledWith(
    expect.objectContaining({
      start: '2026-10-16T17:30:00.000Z',
      end: '2026-10-16T18:15:00.000Z',
      cliente_id: 'client',
      servico_id: 'service',
      profissional_id: 'pro',
    }),1,14,expect.any(String),
  );
  expect(clients.addCliente).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith(['/admin/agenda'], { queryParams: { dia: '2026-10-16' } });
  f.destroy();
});
it('preserves a newly created client when booking fails, so retry does not duplicate the client', async () => {
  const f = TestBed.createComponent(AgendarModalComponent);
  f.detectChanges();
  await vi.waitFor(() => expect(f.componentInstance.loadingCatalog).toBe(false));
  const c = f.componentInstance;
  c.clienteQuery = 'Maria';
  c.usarNovoCliente();
  agenda.addSeries.mockRejectedValueOnce(new Error('Conexão indisponível'));
  await c.confirmar();
  expect(c.erro).toBe('Conexão indisponível');
  expect(c.form.clienteId).toBe('new-client');
  await c.confirmar();
  expect(clients.addCliente).toHaveBeenCalledTimes(1);
  expect(agenda.addSeries).toHaveBeenCalledTimes(2);
  f.destroy();
});
it('blocks a conflicting appointment before saving and permits an adjacent slot', async () => {
  const f = TestBed.createComponent(AgendarModalComponent);
  f.detectChanges();
  await vi.waitFor(() => expect(f.componentInstance.loadingCatalog).toBe(false));
  const c = f.componentInstance;
  c.selectCliente(customer);
  agenda.currentEvents = [
    {
      id: 'other',
      profissional_id: 'pro',
      start: '2026-10-15T12:30:00Z',
      end: '2026-10-15T13:00:00Z',
      status: 'confirmado',
    },
  ];
  await c.confirmar();
  expect(c.erro).toContain('já tem');
  expect(agenda.addSeries).not.toHaveBeenCalled();
  c.time = '10:00';
  await c.confirmar();
  expect(agenda.addSeries).toHaveBeenCalledOnce();
  f.destroy();
});
it('rejects invalid civil dates and uses São Paulo time at a date boundary', () => {
  expect(appointmentWindow('2026-02-30', '09:00', 30)).toBeNull();
  expect(appointmentWindow('2026-10-15', '24:00', 30)).toBeNull();
  expect(appointmentWindow('2026-10-15', '09:00', NaN)).toBeNull();
  expect(appointmentWindow('2026-10-15', '23:45', 30)).toEqual({
    start: '2026-10-16T02:45:00.000Z',
    end: '2026-10-16T03:15:00.000Z',
  });
});
it('does not mutate a saved client pet profile while editing before save', async () => {
  params.id = 'client';
  const f = TestBed.createComponent(NovoClienteModalComponent);
  f.detectChanges();
  await f.whenStable();
  const c = f.componentInstance;
  c.form.metadata.petNome = 'Luna';
  expect(customer.metadata.petNome).toBe('Rex');
  expect(clients.updateCliente).not.toHaveBeenCalled();
  await c.confirmar();
  expect(clients.updateCliente).toHaveBeenCalledWith(
    'client',
    expect.objectContaining({ metadata: { petNome: 'Luna' } }),
  );
  f.destroy();
});
it('shows both customers when a family shares a telephone and offers a useful no-results state', async () => {
  clients.clientes$.next([customer, { ...customer, id: 'child', nome: 'Bia' }]);
  const f = TestBed.createComponent(AdminClientes);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  expect(f.nativeElement.querySelectorAll('article.simple-row')).toHaveLength(2);
  const input = f.nativeElement.querySelector('input[type=search]');
  input.value = 'inexistente';
  input.dispatchEvent(new Event('input'));
  await f.whenStable();
  f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Nenhum resultado');
  expect(f.nativeElement.textContent).not.toContain('Sua carteira está vazia');
  f.destroy();
});
it('skips a separate professional step and removes artificial transitions in public booking', async () => {
  const c = TestBed.runInInjectionContext(() => new Agendar());
  c.selectedService = service;
  c.pros = [{ id: 'pro', nome: 'João', servicos: ['service'] }] as any;
  vi.spyOn(c, 'goStep2').mockImplementation(() => {
    c.step = 'step2';
  });
  c.goStepPro();
  expect(c.selectedPro?.id).toBe('pro');
  expect(c.step).toBe('step2');
  await c.goToStep('step3', 'loading');
  expect(c.step).toBe('step3');
  expect(c.isTransitioning).toBe(false);
});
it('creates a workspace from essentials and explicit terms without requiring CNPJ, address or business volume', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
  );
  const f = TestBed.createComponent(Onboarding);
  f.detectChanges();
  await f.whenStable();
  const c = f.componentInstance;
  c.form = {
    ...c.form,
    nome: 'Meu Studio',
    segmento: 'salao_beleza',
    telefone: '11999999999',
    slug: 'meu-studio',
  };
  c.termsAccepted = true;
  await c.finalizar();
  expect(est.createEstabelecimento).toHaveBeenCalledWith(
    expect.objectContaining({
      nome: 'Meu Studio',
      cnpj: '',
      endereco_completo: '',
      onboarding_completo: true,
    }),
  );
  expect(auth.redirectAfterLogin).toHaveBeenCalledOnce();
  expect(f.nativeElement.querySelectorAll('form')).toHaveLength(1);
  f.destroy();
});
it('keeps a customized booking slug when the business name changes', () => {
  const c = TestBed.runInInjectionContext(() => new Onboarding());
  c.form.nome = 'Studio Novo';
  c.onNameChange();
  expect(c.form.slug).toBe('studio-novo');
  c.slugEdited = true;
  c.form.slug = 'minha-marca';
  c.form.nome = 'Outro nome';
  c.onNameChange();
  expect(c.form.slug).toBe('minha-marca');
});
it('opens the requested completed appointment in checkout without recording money', async () => {
  query = { atendimento: 'event' };
  const c = TestBed.runInInjectionContext(() => new AdminCaixa());
  c.sessaoAtual = { id: 'session' };
  c.eventosPendentes = [
    {
      id: 'event',
      status: 'concluido',
      cliente_id: 'client',
      servico_id: 'service',
      start: '2026-10-15T12:00:00Z',
      end: '2026-10-15T12:45:00Z',
      title: 'Ana',
    },
  ];
  await c.openRequested();
  expect(c.eventoSelecionado?.id).toBe('event');
  expect(c.clienteSelecionadoId).toBe('client');
  expect(c.servicoPrincipal?.id).toBe('service');
  expect(pro.finalizarEEnviarCaixa).not.toHaveBeenCalled();
});
it('does not open a print popup or duplicate a receipt after a successful checkout', async () => {
  const c = TestBed.runInInjectionContext(() => new AdminCaixa());
  c.sessaoAtual = { id: 'session' };
  c.clientesLista = [customer];
  c.clienteSelecionadoId = 'client';
  c.servicoPrincipal = service;
  c.formaPagamento = 'pix';
  const print = vi.spyOn(c, 'imprimirComprovante').mockImplementation(() => {});
  vi.spyOn(c, 'fetchMovimentacoes').mockResolvedValue(undefined);
  await c.finalizarEGerarComanda(true);
  await c.finalizarEGerarComanda(true);
  expect(pro.finalizarEEnviarCaixa).toHaveBeenCalledOnce();
  expect(print).not.toHaveBeenCalled();
  expect(c.comandaToken).toBe('receipt');
});

it('offers any available professional and sends the actual eligible ID required by the booking API', async () => {
  const c = TestBed.runInInjectionContext(() => new Agendar());
  c.estab = { id: 'tenant' } as any;
  c.selectedService = service;
  c.selectedDate = '2099-10-15';
  const day = new Date('2099-10-15T12:00:00-03:00').getUTCDay();
  c.schedule = [{ dia_semana: day, ativo: true, abre: '09:00', fecha: '10:00' }] as any;
  const availability = { dia_semana: day, ativo: true, hora_inicio: '09:00', hora_fim: '10:00' };
  c.pros = [
    { id: 'busy', nome: 'Ocupado', servicos: ['service'], disponibilidades: [availability] },
    { id: 'free', nome: 'Disponível', servicos: ['service'], disponibilidades: [availability] },
  ] as any;
  const pub = TestBed.inject(EstabelecimentoPublicoService);
  vi.mocked(pub.getBusyIntervals).mockResolvedValue([
    { start: '2099-10-15T12:00:00Z', end: '2099-10-15T13:00:00Z', profissional_id: 'busy' },
  ]);
  await c.refreshSlots();
  expect(c.slots.find((s) => s.time === '09:00')?.available).toBe(true);
  c.selectTime({ time: '09:00', available: true });
  expect(c.bookingProfessional?.id).toBe('free');
  c.custName = 'Ana';
  c.custPhone = '11999999999';
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'booking' }) });
  vi.stubGlobal('fetch', fetcher);
  await c.finalize();
  expect(JSON.parse(fetcher.mock.calls[0][1].body).profissional_id).toBe('free');
});
it('does not offer a professional during their lunch break', async () => {
  const c = TestBed.runInInjectionContext(() => new Agendar());
  c.estab = { id: 'tenant' } as any;
  c.selectedService = { ...service, duracao_min: 30 };
  c.selectedDate = '2099-10-15';
  const day = new Date('2099-10-15T12:00:00-03:00').getUTCDay();
  c.schedule = [{ dia_semana: day, ativo: true, abre: '12:00', fecha: '14:00' }] as any;
  c.pros = [
    {
      id: 'pro',
      nome: 'João',
      servicos: ['service'],
      disponibilidades: [
        {
          dia_semana: day,
          ativo: true,
          hora_inicio: '09:00',
          hora_fim: '18:00',
          intervalo_inicio: '12:00',
          intervalo_fim: '13:00',
        },
      ],
    },
  ] as any;
  await c.refreshSlots();
  expect(c.slots.find((s) => s.time === '12:30')?.available).toBe(false);
  expect(c.slots.find((s) => s.time === '13:00')?.available).toBe(true);
});

it('prevents re-registering a sale if the receipt exists but its cash movement update fails', async () => {
  const c = TestBed.runInInjectionContext(() => new AdminCaixa());
  c.sessaoAtual = { id: 'session' };
  c.clientesLista = [customer];
  c.clienteSelecionadoId = 'client';
  c.servicoPrincipal = service;
  c.formaPagamento = 'pix';
  pro.finalizarEEnviarCaixa.mockResolvedValue({ id: 'cash' });
  pro.supabase.from.mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: new Error('network') }),
  });
  await c.finalizarEGerarComanda(true);
  await c.finalizarEGerarComanda(true);
  expect(c.checkoutComplete).toBe(true);
  expect(pro.finalizarEEnviarCaixa).toHaveBeenCalledOnce();
  expect(c.message).toContain('Não registre novamente');
});
