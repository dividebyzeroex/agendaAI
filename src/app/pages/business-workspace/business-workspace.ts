import { Component, inject, DestroyRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';
import { SecurityService } from '../../services/security.service';
import { BusinessService } from '../../services/business.service';
const config: Record<string, { title: string; description: string; tables: string[] }> = {
  fila: {
    title: 'Fila de espera',
    description:
      'Atenda quem chegou sem horário marcado. O rodízio respeita os serviços e a agenda da equipe.',
    tables: ['walkin_queue', 'professional_rotation'],
  },
  fidelizacao: {
    title: 'Pacotes e clube',
    description: 'Venda sessões antecipadas e acompanhe o saldo de cada cliente.',
    tables: ['service_bundles', 'customer_passes', 'pass_redemptions'],
  },
  satisfacao: {
    title: 'Satisfação dos clientes',
    description: 'Ouça quem foi atendido e acompanhe as avaliações recebidas.',
    tables: ['service_feedback'],
  },
  financeiro: {
    title: 'Contas a pagar e receber',
    description: 'Organize vencimentos, registre baixas parciais e acompanhe compromissos.',
    tables: ['financial_titles', 'financial_settlements'],
  },
  estoque: {
    title: 'Controle de estoque',
    description: 'Planeje reposições, acompanhe custos e registre o consumo de insumos.',
    tables: ['produtos', 'inventory_movements', 'service_supplies'],
  },
  fichas: {
    title: 'Fichas e pets',
    description: 'Registre informações do atendimento com histórico e consentimento.',
    tables: ['client_pets', 'intake_templates', 'client_intakes'],
  },
  relacionamento: {
    title: 'Relacionamento',
    description: 'Prepare campanhas e controle os canais autorizados por cada cliente.',
    tables: ['client_contact_preferences', 'client_campaigns'],
  },
  pagina: {
    title: 'Página de reservas',
    description: 'Personalize sua apresentação e escolha como receber novos agendamentos.',
    tables: ['business_settings'],
  },
};
@Component({
  selector: 'app-business-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './business-workspace.html',
  styleUrls: ['./business-workspace.css'],
})
export class BusinessWorkspace implements OnInit {
  private route = inject(ActivatedRoute);
  private est = inject(EstabelecimentoService);
  private db = inject(SupabaseService).client;
  private security = inject(SecurityService);
  private cdr = inject(ChangeDetectorRef);
  private destroy = inject(DestroyRef);
  business = inject(BusinessService);
  module = this.route.snapshot.data['module'] as string;
  config = config[this.module];
  data: Record<string, any[]> = {};
  campaignProgress: Record<string, any> = {};
  selectedCampaign = '';
  campaignRecipients: any[] = [];
  recipientTotal = 0;
  recipientPage = 0;
  recipientLoading = false;
  recipientError = '';
  private recipientGeneration = 0;
  private recipientAbort?: AbortController;
  loaded = false;
  loading = false;
  busy = false;
  error = '';
  notice = '';
  tenant = '';
  generation = 0;
  private abort?: AbortController;
  clients: any[] = [];
  services: any[] = [];
  professionals: any[] = [];
  events: any[] = [];
  form: any = {};
  editing = false;
  answers: string[] = [];
  selectedTemplate = '';
  selectedClient = '';
  selectedPet = '';
  consent = false;
  gallery = '';
  headline = '';
  approval = false;
  constructor() {
    this.destroy.onDestroy(() => {
      ++this.generation;
      this.abort?.abort();
      this.recipientAbort?.abort();
      ++this.recipientGeneration;
    });
  }
  ngOnInit() {
    this.est.activeId$.pipe(takeUntilDestroyed(this.destroy)).subscribe((id) => {
      this.tenant = id || '';
      this.form = {};
      this.busy = false;
      this.clients = [];
      this.services = [];
      this.professionals = [];
      this.events = [];
      this.receiptUrl = '';
      this.data = {};
      this.campaignProgress = {};
      this.selectedCampaign = '';
      this.campaignRecipients = [];
      this.recipientTotal = 0;
      this.recipientError = '';
      this.recipientAbort?.abort();
      ++this.recipientGeneration;
      this.recipientLoading = false;
      this.editing = false;
      this.notice = '';
      void this.load();
    });
  }
  async load() {
    const g = ++this.generation;
    this.abort?.abort();
    this.abort = new AbortController();
    this.error = '';
    this.loaded = false;
    this.loading = false;
    if (!this.tenant) return;
    this.loading = true;
    this.cdr.markForCheck();
    const tenant = this.tenant;
    const signal = this.abort.signal;
    const timer = setTimeout(() => this.abort?.signal === signal && this.abort.abort(), 20000);
    try {
      const tables = await Promise.allSettled(
        this.config.tables.map(async (table) => {
          let q = this.db
            .from(table)
            .select('*', { count: 'exact' })
            .eq('estabelecimento_id', tenant);
          if (table === 'walkin_queue') q = q.eq('status', 'waiting');
          q =
            table === 'business_settings' ||
            table === 'professional_rotation' ||
            table === 'service_supplies' ||
            table === 'client_contact_preferences'
              ? q
              : q.order('created_at', { ascending: false });
          const { data, error, count } = await q.limit(500).abortSignal(signal);
          if (error && ['42P01', 'PGRST205'].includes(error.code))
            throw Error(
              'Este módulo aguarda a liberação da infraestrutura. Os cadastros e a agenda continuam disponíveis.',
            );
          if (error) throw error;
          return { table, rows: data || [], count };
        }),
      );
      for (const r of tables) if (r.status === 'rejected') throw r.reason;
      const campaigns = tables.find(
        (r) => r.status === 'fulfilled' && r.value.table === 'client_campaigns',
      );
      const campaignIds =
        campaigns?.status === 'fulfilled' ? campaigns.value.rows.map((r: any) => r.id) : [];
      const lookups = await Promise.allSettled([
        this.db.rpc('get_clientes_by_estab', { p_estab_id: tenant }).abortSignal(signal),
        this.db.rpc('get_servicos_by_estab', { p_estab_id: tenant }).abortSignal(signal),
        this.db.rpc('get_profissionais_by_estab', { p_estab_id: tenant }).abortSignal(signal),
        this.db
          .from('agenda_events')
          .select('id,title,status,cliente_id,servico_id,start')
          .eq('estabelecimento_id', tenant)
          .gte('start', new Date(Date.now() - 90 * 86400000).toISOString())
          .order('start', { ascending: false })
          .limit(500)
          .abortSignal(signal),
        this.module === 'relacionamento'
          ? this.db
              .rpc('campaign_progress', { p_tenant: tenant, p_campaigns: campaignIds })
              .abortSignal(signal)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (g !== this.generation) return;
      for (const r of tables) if (r.status === 'rejected') throw r.reason;
      for (const r of lookups)
        if (r.status === 'rejected' || r.value.error)
          throw Error('Não foi possível conferir os cadastros.');
      this.data = {};
      let truncated = false;
      for (const r of tables)
        if (r.status === 'fulfilled') {
          this.data[r.value.table] = r.value.rows;
          truncated ||= (r.value.count || 0) > 500;
        }
      const value = (i: number) =>
        lookups[i].status === 'fulfilled'
          ? (lookups[i] as PromiseFulfilledResult<any>).value.data || []
          : [];
      const [clients, pros, events] = await Promise.all([
        Promise.all(value(0).map((c: any) => this.security.decryptObject(c, ['nome']))),
        Promise.all(value(2).map((p: any) => this.security.decryptObject(p, ['nome']))),
        Promise.all(value(3).map((e: any) => this.security.decryptObject(e, ['title']))),
      ]);
      if (g !== this.generation) return;
      this.campaignProgress = Object.fromEntries(value(4).map((r: any) => [r.campaign_id, r]));
      this.clients = clients;
      this.professionals = pros.filter((p: any) => p.ativo);
      this.events = events;
      this.services = value(1).filter((s: any) => s.ativo !== false);
      this.loaded = true;
      if (this.selectedCampaign)
        void this.loadCampaignRecipients(this.selectedCampaign, this.recipientPage);
      if (truncated)
        this.notice =
          this.module === 'relacionamento'
            ? 'Mostrando as 500 campanhas e preferências mais recentes. Os totais de cada campanha incluem todo o seu público.'
            : 'Mostrando os 500 registros mais recentes de cada lista. Os resumos desta tela abrangem somente os registros exibidos.';
      const settings = this.data['business_settings']?.[0];
      if (settings) {
        this.headline = settings.headline;
        this.gallery = (settings.gallery || []).join('\n');
        this.approval = settings.approval_required;
      }
    } catch (e) {
      if (g === this.generation)
        this.error = e instanceof Error ? e.message : 'Não foi possível carregar. Tente novamente.';
    } finally {
      clearTimeout(timer);
      if (g === this.generation) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  async act(action: string, d: any = {}, success = 'Salvo.') {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    const tenant = this.tenant;
    try {
      if (action === 'campaign-add') d = { ...d, due_at: new Date(d.due_at).toISOString() };
      const result = await this.business.command(action, d, tenant);
      if (tenant !== this.tenant) return;
      this.notice = success;
      this.editing = false;
      this.form = {};
      await this.load();
      if (result?.receipt_token) {
        const url = window.location.origin + '/comanda/' + result.receipt_token;
        this.notice = 'Venda criada. Abra a comanda para o cliente pagar: ' + url;
        this.receiptUrl = url;
      }
      return result;
    } catch (e) {
      if (tenant === this.tenant)
        this.error = e instanceof Error ? e.message : 'Não foi possível salvar.';
      return undefined;
    } finally {
      if (tenant === this.tenant) {
        this.busy = false;
        this.cdr.markForCheck();
      }
    }
  }
  receiptUrl = '';
  start(kind: string) {
    this.editing = true;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    this.form = {
      type: kind,
      kind:
        kind === 'membership'
          ? 'membership'
          : kind === 'payable'
            ? 'payable'
            : kind === 'receivable'
              ? 'receivable'
              : 'package',
      sessions: 4,
      validity_days: kind === 'membership' ? 30 : 90,
      payment_method: 'pix',
      due_date: today,
      competence: today,
      channel: 'email',
      segment: 'inactive',
      due_at: new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T'),
    };
  }
  async loadCampaignRecipients(campaignId: string, page = 0) {
    const tenant = this.tenant;
    if (!tenant || page < 0) return;
    const g = ++this.recipientGeneration;
    this.recipientAbort?.abort();
    this.recipientAbort = new AbortController();
    const signal = this.recipientAbort.signal;
    const timer = setTimeout(
      () => this.recipientAbort?.signal === signal && this.recipientAbort.abort(),
      15000,
    );
    this.selectedCampaign = campaignId;
    this.recipientPage = page;
    this.campaignRecipients = [];
    this.recipientLoading = true;
    this.recipientError = '';
    try {
      const { data, error, count } = await this.db
        .from('campaign_recipients')
        .select('id,cliente_id,status,provider_id,sent_at', { count: 'exact' })
        .eq('estabelecimento_id', tenant)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * 50, page * 50 + 49)
        .abortSignal(signal);
      if (g !== this.recipientGeneration) return;
      if (error) throw error;
      this.campaignRecipients = data || [];
      this.recipientTotal = count || 0;
    } catch {
      if (g === this.recipientGeneration)
        this.recipientError = 'Não foi possível conferir o público. Tente novamente.';
    } finally {
      clearTimeout(timer);
      if (g === this.recipientGeneration) {
        this.recipientLoading = false;
        this.cdr.markForCheck();
      }
    }
  }
  campaignTitle(id: string) {
    return (this.data['client_campaigns'] || []).find((c) => c.id === id)?.title || 'Campanha';
  }
  customer(id: string) {
    return this.clients.find((c) => c.id === id)?.nome || 'Cliente não identificado';
  }
  service(id: string) {
    return this.services.find((c) => c.id === id)?.titulo || 'Serviço não identificado';
  }
  professional(id: string) {
    return this.professionals.find((c) => c.id === id)?.nome || 'Profissional';
  }
  get waiting() {
    return (this.data['walkin_queue'] || [])
      .filter((r) => r.status === 'waiting')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  rotation(pro: string) {
    return (this.data['professional_rotation'] || []).find((r) => r.profissional_id === pro);
  }
  get passes() {
    return this.data['customer_passes'] || [];
  }
  get templates() {
    return this.data['intake_templates'] || [];
  }
  get intakes() {
    return this.data['client_intakes'] || [];
  }
  passState(p: any) {
    return p.status === 'active' && Date.parse(p.expires_at) <= Date.now() ? 'expired' : p.status;
  }
  get activePasses() {
    return this.passes.filter(
      (p) => p.status === 'active' && p.remaining > 0 && Date.parse(p.expires_at) > Date.now(),
    );
  }
  get products() {
    return this.data['produtos'] || [];
  }
  get lowStock() {
    return this.products.filter((p) => p.ativo && p.estoque <= p.minimum_stock);
  }
  get stockValue() {
    return this.products.reduce((v, p) => v + Number(p.estoque) * Number(p.unit_cost), 0);
  }
  get financial() {
    const rows = (this.data['financial_titles'] || []).filter((r) => !r.cancelled);
    const open = (kind: string) =>
      rows
        .filter((r) => r.kind === kind)
        .reduce((s, r) => s + Number(r.amount) - Number(r.settled), 0);
    const month = new Date()
      .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      .slice(0, 7);
    const accrual = (kind: string) =>
      rows
        .filter((r) => r.kind === kind && r.competence.startsWith(month))
        .reduce((s, r) => s + Number(r.amount), 0);
    return {
      pay: open('payable'),
      receive: open('receivable'),
      result: accrual('receivable') - accrual('payable'),
    };
  }
  outstanding(row: any) {
    return Number(row.amount) - Number(row.settled);
  }
  overdue(row: any) {
    return (
      !row.cancelled &&
      this.outstanding(row) > 0 &&
      row.due_date < new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    );
  }
  get feedback() {
    return this.data['service_feedback'] || [];
  }
  get responses() {
    return this.feedback.filter((r) => r.submitted_at);
  }
  get average() {
    return this.responses.length
      ? this.responses.reduce((a, r) => a + r.rating, 0) / this.responses.length
      : 0;
  }
  templateChanged() {
    this.answers = (
      this.templates.find((t) => t.id === this.selectedTemplate)?.questions || []
    ).map(() => '');
  }
  get questions() {
    return this.templates.find((t) => t.id === this.selectedTemplate)?.questions || [];
  }
  petsFor(client: string) {
    return (this.data['client_pets'] || []).filter((p) => p.cliente_id === client);
  }
  async saveTemplate() {
    await this.act(
      'template-add',
      {
        title: this.form.title,
        questions: String(this.form.questions || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      'Modelo criado. Cada preenchimento preserva sua versão.',
    );
  }
  async saveIntake() {
    const result = await this.act(
      'intake-add',
      {
        cliente_id: this.selectedClient,
        pet_id: this.selectedPet,
        template_id: this.selectedTemplate,
        answers: this.answers,
        consent: this.consent,
      },
      'Ficha salva no histórico.',
    );
    if (result) {
      this.answers = [];
      this.selectedTemplate = '';
      this.consent = false;
    }
  }
  async saveSettings() {
    await this.act(
      'settings',
      {
        approval_required: this.approval,
        headline: this.headline,
        gallery: this.gallery
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      'Página atualizada.',
    );
  }
  label(s: string) {
    return (
      (
        {
          waiting: 'Na fila',
          assigned: 'Chamado',
          cancelled: 'Cancelado',
          pending: 'Aguardando',
          active: 'Ativo',
          expired: 'Expirado',
          refund_pending: 'Reembolso em conferência',
          package: 'Pacote',
          membership: 'Clube',
          payable: 'A pagar',
          receivable: 'A receber',
          draft: 'Rascunho',
          scheduled: 'Envio agendado',
          completed: 'Lotes processados',
          paused: 'Pausada por acesso indisponível',
          sending: 'Envio em conferência',
          ready: 'Público preparado',
          email: 'E-mail',
          sms: 'SMS',
          whatsapp: 'WhatsApp',
          sent: 'Aceito pelo provedor',
          failed: 'Conferir falha ou envio incerto',
          suppressed: 'Suprimido',
        } as Record<string, string>
      )[s] || s
    );
  }
  async scheduleCampaign(id: string) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.business.scheduleCampaign(id, this.tenant);
      this.notice =
        'Envio agendado na rotina diária, às 08h de São Paulo, após a data escolhida. Até 10 destinatários por campanha a cada execução.';
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Não foi possível agendar.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async copy(path: string) {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      this.notice = 'Link copiado.';
    } catch {
      this.error = 'Não foi possível copiar. Abra o link para compartilhar.';
    }
    this.cdr.markForCheck();
  }
}
