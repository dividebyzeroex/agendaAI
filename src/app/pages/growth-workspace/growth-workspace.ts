import { Component, inject, DestroyRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SecurityService } from '../../services/security.service';
import { GrowthService } from '../../services/growth.service';
const config: Record<
  string,
  { title: string; description: string; back: string; backLabel: string }
> = {
  clube: {
    title: 'Clube recorrente',
    description:
      'Mensalidades automáticas, sessões liberadas após pagamento e renovação sob controle.',
    back: 'fidelizacao',
    backLabel: 'Pacotes e ofertas',
  },
  resultados: {
    title: 'Visão financeira',
    description: 'Entenda o resultado, antecipe compromissos e confira os recebimentos.',
    back: 'financeiro',
    backLabel: 'Contas a pagar e receber',
  },
  retencao: {
    title: 'Retenção automática',
    description: 'Convide o cliente a voltar no momento certo, com regras simples e opcionais.',
    back: 'relacionamento',
    backLabel: 'Campanhas e preferências',
  },
  unidades: {
    title: 'Minha rede',
    description:
      'Acompanhe as unidades, distribua acessos e movimente o estoque com rastreabilidade.',
    back: 'agenda',
    backLabel: 'Voltar à agenda',
  },
};
@Component({
  selector: 'app-growth-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './growth-workspace.html',
  styleUrls: ['./growth-workspace.css'],
})
export class GrowthWorkspace implements OnInit {
  private route = inject(ActivatedRoute);
  private db = inject(SupabaseService).client;
  private security = inject(SecurityService);
  private destroy = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private growth = inject(GrowthService);
  est = inject(EstabelecimentoService);
  module = this.route.snapshot.data['module'] as string;
  config = config[this.module];
  tenant = '';
  loading = false;
  loaded = false;
  busy = false;
  error = '';
  notice = '';
  editing = false;
  form: any = {};
  generation = 0;
  private abort?: AbortController;
  clients: any[] = [];
  professionals: any[] = [];
  bundles: any[] = [];
  clubs: any[] = [];
  rules: any[] = [];
  ruleSummary: Record<string, any> = {};
  worker: any = null;
  report: any = null;
  month = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  opening = 0;
  tab = 'dre';
  titles: any[] = [];
  networks: any[] = [];
  networkId = '';
  units: any[] = [];
  transfers: any[] = [];
  products: any[] = [];
  audit: any[] = [];
  shareUrl = '';
  cancelId = '';
  sections = [
    { value: 'other_income', label: 'Outras receitas operacionais', kind: 'receivable' },
    { value: 'taxes', label: 'Impostos sobre receita', kind: 'payable' },
    { value: 'direct_cost', label: 'Custos diretos', kind: 'payable' },
    { value: 'operating_expense', label: 'Despesas operacionais', kind: 'payable' },
    { value: 'financial_income', label: 'Receitas financeiras', kind: 'receivable' },
    { value: 'financial_expense', label: 'Despesas financeiras', kind: 'payable' },
    {
      value: 'non_operating_income',
      label: 'Outras receitas não operacionais',
      kind: 'receivable',
    },
    { value: 'non_operating_expense', label: 'Outras despesas não operacionais', kind: 'payable' },
  ];
  ngOnInit() {
    this.destroy.onDestroy(() => {
      ++this.generation;
      this.abort?.abort();
    });
    this.est.activeId$.pipe(takeUntilDestroyed(this.destroy)).subscribe((id) => {
      this.tenant = id || '';
      this.form = {};
      this.editing = false;
      this.shareUrl = '';
      this.networkId = '';
      this.cancelId = '';
      this.busy = false;
      this.notice = '';
      void this.load();
    });
  }
  private async rows(table: string, tenant = this.tenant, columns = '*'): Promise<any[]> {
    let query = this.db
      .from(table)
      .select(columns, { count: 'exact' })
      .eq('estabelecimento_id', tenant);
    if (table === 'financial_titles') {
      const end = new Date(this.month + '-01T00:00:00Z');
      end.setUTCMonth(end.getUTCMonth() + 1);
      query = query
        .gte('competence', this.month + '-01')
        .lt('competence', end.toISOString().slice(0, 10));
    }
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .limit(500)
      .abortSignal(this.abort!.signal);
    if (error) throw error;
    if ((count || 0) > 500)
      this.notice =
        'Listas limitadas aos 500 registros mais recentes. Os relatórios consolidados usam todo o período.';
    return (data || []) as any[];
  }
  private async rpc(name: string, args: any = {}) {
    const { data, error } = await this.db.rpc(name, args).abortSignal(this.abort!.signal);
    if (error) throw error;
    return data;
  }
  async load() {
    const g = ++this.generation,
      t = this.tenant;
    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const timer = setTimeout(() => this.abort?.signal === signal && this.abort.abort(), 25000);
    this.loading = true;
    this.loaded = false;
    this.error = '';
    this.cdr.markForCheck();
    try {
      if (!t) return;
      if (this.module === 'clube') {
        const [clubs, bundles, clients, worker] = await Promise.all([
          this.rows(
            'club_contracts',
            t,
            'id,cliente_id,title,price,sessions,status,renew_enabled,consent_at,next_due,token,created_at',
          ),
          this.rows('service_bundles'),
          this.rpc('get_clientes_by_estab', { p_estab_id: t }),
          this.rpc('growth_worker_status', { p_tenant: t }),
        ]);
        const decrypted = await Promise.all(
          (clients || []).map((c: any) => this.security.decryptObject(c, ['nome'])),
        );
        if (g !== this.generation) return;
        this.clubs = clubs;
        this.bundles = bundles.filter((b: any) => b.kind === 'membership' && b.active);
        this.clients = decrypted;
        this.worker = worker;
      } else if (this.module === 'resultados') {
        const [report, titles] = await Promise.all([
          this.rpc('finance_report', {
            p_tenant: t,
            p_month: this.month + '-01',
            p_opening: Number(this.opening || 0),
          }),
          this.rows('financial_titles'),
        ]);
        if (g !== this.generation) return;
        this.report = report;
        this.titles = titles.filter(
          (r: any) => !r.cancelled && r.competence?.slice(0, 7) === this.month,
        );
      } else if (this.module === 'retencao') {
        const [rules, summary, worker] = await Promise.all([
          this.rows('retention_rules'),
          this.rpc('retention_summary', { p_tenant: t }),
          this.rpc('growth_worker_status', { p_tenant: t }),
        ]);
        if (g !== this.generation) return;
        this.rules = [
          {
            kind: 'return',
            days: 30,
            title: 'Está na hora de voltar',
            message:
              'Seu próximo cuidado espera por você em {negocio}. Reserve seu horário: {link}',
            enabled: false,
          },
          {
            kind: 'renewal',
            days: 7,
            title: 'Aproveite seu pacote',
            message:
              'Seu pacote está perto de vencer. Confira seu saldo com a equipe de {negocio} e agende: {link}',
            enabled: false,
          },
          {
            kind: 'inactive',
            days: 60,
            title: 'Sentimos sua falta',
            message:
              'Que tal voltar a cuidar de você em {negocio}? Veja os horários disponíveis: {link}',
            enabled: false,
          },
        ].map((r) => ({ ...r, ...rules.find((s: any) => s.kind === r.kind) }));
        this.ruleSummary = Object.fromEntries((summary || []).map((s: any) => [s.id, s]));
        this.worker = worker;
      } else {
        const { data: networks, error } = await this.db
          .from('business_networks')
          .select('*')
          .order('name')
          .abortSignal(signal);
        if (error) throw error;
        const { data: links, error: linkError } = await this.db
          .from('network_units')
          .select('network_id,estabelecimento_id')
          .abortSignal(signal);
        if (linkError) throw linkError;
        if (g !== this.generation) return;
        this.networks = networks || [];
        this.networkId =
          this.networks.find((n) => n.id === this.networkId)?.id ||
          links?.find((l) => l.estabelecimento_id === t)?.network_id ||
          this.networks[0]?.id ||
          '';
        this.units = [];
        this.transfers = [];
        this.products = [];
        this.audit = [];
        if (this.networkId) {
          const [units, transferResult, auditResult, pros] = await Promise.all([
            this.rpc('network_summary', { p_network: this.networkId }),
            this.db
              .from('stock_transfers')
              .select('*')
              .eq('network_id', this.networkId)
              .order('created_at', { ascending: false })
              .limit(100)
              .abortSignal(signal),
            this.db
              .from('network_audit')
              .select('id,action,created_at')
              .eq('network_id', this.networkId)
              .order('created_at', { ascending: false })
              .limit(20)
              .abortSignal(signal),
            this.rpc('get_profissionais_by_estab', { p_estab_id: t }),
          ]);
          if (transferResult.error || auditResult.error)
            throw Error('Não foi possível conferir a rede.');
          const ids = (units || []).filter((u: any) => u.active).map((u: any) => u.id);
          const pr = ids.length
            ? await this.db
                .from('produtos')
                .select('id,nome,estabelecimento_id,estoque,unit_cost,ativo')
                .in('estabelecimento_id', ids)
                .eq('ativo', true)
                .limit(2000)
                .abortSignal(signal)
            : { data: [], error: null };
          if (pr.error) throw pr.error;
          const decrypted = await Promise.all(
            (pros || []).map((p: any) => this.security.decryptObject(p, ['nome'])),
          );
          if (g !== this.generation) return;
          this.units = units || [];
          this.transfers = transferResult.data || [];
          this.products = pr.data || [];
          this.audit = auditResult.data || [];
          this.professionals = decrypted;
        }
      }
      if (g === this.generation) this.loaded = true;
    } catch (e: any) {
      if (g === this.generation)
        this.error =
          e?.code === 'PGRST202'
            ? 'A infraestrutura desta atualização está sendo preparada. Tente novamente em instantes.'
            : e?.message || 'Não foi possível carregar. Tente novamente.';
    } finally {
      clearTimeout(timer);
      if (g === this.generation) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  async act(action: string, data: any, message = 'Salvo.', tenant = this.tenant) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    const g = this.generation;
    try {
      const result = await this.growth.command(tenant, action, data);
      if (g !== this.generation) return;
      this.editing = false;
      this.form = {};
      this.notice = message;
      this.cancelId = '';
      if (action === 'club-create')
        this.shareUrl = window.location.origin + '/clube/' + result.token;
      if (action === 'network-unit-create' || action === 'network-link')
        await this.est.refreshCurrent();
      await this.load();
      return result;
    } catch (e) {
      if (g === this.generation)
        this.error = e instanceof Error ? e.message : 'Não foi possível salvar.';
      return undefined;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async reconcile() {
    if (this.busy) return;
    this.busy = true;
    const t = this.tenant;
    this.error = '';
    try {
      const r = await this.growth.reconcile(t, this.month);
      if (t !== this.tenant) return;
      this.notice =
        r.checked +
        ' cobrança(s) conferidas na Stripe; ' +
        r.review +
        ' em conferência. Repita para atualizar o próximo lote.';
      await this.load();
    } catch (e) {
      if (t === this.tenant)
        this.error = e instanceof Error ? e.message : 'Não foi possível conciliar.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async saveRule(r: any) {
    await this.act(
      'retention-save',
      {
        kind: r.kind,
        days: Number(r.days),
        title: r.title,
        message: r.message,
        enabled: !!r.enabled,
      },
      r.enabled
        ? 'Regra ativada. O envio usa o canal autorizado e respeita a frequência máxima.'
        : 'Regra pausada. Mensagens pendentes desta regra foram retiradas.',
    );
  }
  async copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      this.notice = 'Link copiado.';
    } catch {
      this.shareUrl = url;
      this.error = 'Abra o link para compartilhar.';
    }
    this.cdr.markForCheck();
  }
  clubLink(c: any) {
    return window.location.origin + '/clube/' + c.token;
  }
  client(id: string) {
    return this.clients.find((c) => c.id === id)?.nome || 'Cliente';
  }
  unit(id: string) {
    return this.units.find((u) => u.id === id)?.name || 'Unidade';
  }
  product(id: string) {
    return this.products.find((p) => p.id === id)?.nome || 'Produto';
  }
  productsAt(id: string) {
    return this.products.filter((p) => p.estabelecimento_id === id);
  }
  selectProfessional(id: string) {
    const p = this.professionals.find((p) => p.id === id);
    if (p) {
      this.form.role = p.role === 'secretaria' ? 'recepcionista' : p.role;
      this.form.active = !!p.ativo;
    }
  }
  sectionsFor(kind: string) {
    return this.sections.filter((s) => s.kind === kind);
  }
  get resultAmount() {
    return Number(this.report?.dre?.at(-1)?.amount || 0);
  }
  get resultIsPartial() {
    const w = this.report?.warnings;
    return (
      !!w &&
      Number(w.unknown_product_cost) +
        Number(w.unknown_supply_cost) +
        Number(w.unknown_stripe_fee) +
        Number(w.unreconciled_refunds) +
        Number(w.fee_refunds_pending) +
        Number(w.pending_refunds) >
        0
    );
  }
  get networkTotals() {
    return this.units.reduce(
      (a, u) => ({
        clients: a.clients + Number(u.clients),
        received: a.received + Number(u.received),
        pending: a.pending + Number(u.pending),
        clubs: a.clubs + Number(u.clubs),
      }),
      { clients: 0, received: 0, pending: 0, clubs: 0 },
    );
  }
  get availableUnits() {
    return this.est.units$.value.filter(
      (u) => u.role === 'dono' && !this.units.some((s) => s.id === u.id),
    );
  }
  label(s: string) {
    return (
      (
        {
          pending: 'Aguardando adesão ou pagamento',
          active: 'Ativo',
          past_due: 'Pagamento pendente de regularização',
          cancelled: 'Cancelado',
          in_transit: 'Em trânsito',
          received: 'Recebido',
          return: 'Lembrete de retorno',
          renewal: 'Vencimento de pacote',
          inactive: 'Recuperação de inativos',
          'unit-role': 'Permissão atualizada',
          'network-link': 'Unidade vinculada',
          'network-unit-create': 'Unidade criada',
          'transfer-receive': 'Transferência recebida',
          'transfer-cancel': 'Transferência cancelada',
        } as Record<string, string>
      )[s] || s
    );
  }
}
