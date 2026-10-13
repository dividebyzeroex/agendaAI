import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { PlatformMetrics, PlatformService, PlatformTenant } from '../../services/platform';

type Tab = 'commercial' | 'finance' | 'operations';
interface Prospect {
  id: string; business_name: string; email: string | null; status: string;
  segment: string | null; consent_at: string | null; unsubscribed_at: string | null;
  created_at: string; last_contact_at: string | null;
}
interface Message { id: string; status: string; created_at: string; sent_at: string | null; prospect_id: string | null; }
interface Payment { id: string; status: string; amount_cents: number; currency: string; created_at: string; paid_at: string | null; estabelecimento_id: string | null; }
interface Support { id: string; status: string; created_at: string; estabelecimento_id: string | null; category: string | null; }
interface ErrorEvent { id: string; page_path: string | null; error_code: string | null; user_id: string | null; created_at: string; }
interface AgentRun { id: string; agent: string; status: string; created_at: string; }
interface ActionItem { title: string; detail: string; count: number; link: string; icon: string; }

@Component({
  selector: 'app-platform-insights',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './platform-insights.html',
  styleUrls: ['./platform-insights.css']
})
export class PlatformInsights implements OnInit {
  private readonly client = inject(SupabaseService).client;
  private readonly platform = inject(PlatformService);
  private readonly cdr = inject(ChangeDetectorRef);
  tab: Tab = 'commercial';
  range: 30 | 90 | 365 = 30;
  loading = true;
  error = '';
  updatedAt: Date | null = null;
  metrics: PlatformMetrics | null = null;
  tenants: PlatformTenant[] = [];
  prospects: Prospect[] = [];
  messages: Message[] = [];
  payments: Payment[] = [];
  support: Support[] = [];
  errors: ErrorEvent[] = [];
  runs: AgentRun[] = [];
  partial = false;
  // Client-side summaries are bounded to 1,000 newest records per source.
  readonly sourceLimit = 1000;

  ngOnInit(): void { void this.refresh(); }
  chooseTab(value: Tab): void { this.tab = value; }
  setRange(value: number): void {
    if (value === 30 || value === 90 || value === 365) this.range = value;
  }
  private get cutoff(): number { return Date.now() - this.range * 86_400_000; }
  private inRange(date: string | null | undefined): boolean {
    return !!date && Number.isFinite(Date.parse(date)) && Date.parse(date) >= this.cutoff;
  }

  async refresh(): Promise<void> {
    if (this.loading && this.updatedAt) return;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
    try {
      const [metrics, tenants, prospects, messages, payments, support, errors, runs] = await Promise.all([
        this.platform.getGlobalMetrics(),
        this.platform.getTenants(),
        this.client.from('commercial_prospects')
          .select('id,business_name,email,status,segment,consent_at,unsubscribed_at,created_at,last_contact_at')
          .order('created_at', {ascending:false}).limit(this.sourceLimit),
        this.client.from('commercial_messages')
          .select('id,prospect_id,status,sent_at,created_at')
          .gte('created_at', since).order('created_at', {ascending:false}).limit(this.sourceLimit),
        this.client.from('commercial_payments')
          .select('id,estabelecimento_id,amount_cents,currency,status,paid_at,created_at')
          .eq('livemode', true).gte('created_at', since)
          .order('created_at', {ascending:false}).limit(this.sourceLimit),
        this.client.from('support_messages')
          .select('id,status,category,estabelecimento_id,created_at')
          .in('status', ['aberto','em_analise'])
          .order('created_at', {ascending:false}).limit(this.sourceLimit),
        this.client.from('app_error_events')
          .select('id,page_path,error_code,user_id,created_at')
          .gte('created_at', since).order('created_at', {ascending:false}).limit(this.sourceLimit),
        this.client.from('commercial_agent_runs')
          .select('id,agent,status,created_at')
          .gte('created_at', since).order('created_at', {ascending:false}).limit(200)
      ]);
      for (const item of [prospects, messages, payments, support, errors, runs]) {
        if (item.error) throw item.error;
      }
      this.metrics = metrics;
      this.tenants = tenants;
      this.prospects = (prospects.data || []) as Prospect[];
      this.messages = (messages.data || []) as Message[];
      this.payments = (payments.data || []) as Payment[];
      this.support = (support.data || []) as Support[];
      this.errors = (errors.data || []) as ErrorEvent[];
      this.runs = (runs.data || []) as AgentRun[];
      this.partial = [prospects, messages, payments, support, errors].some(item => (item.data?.length || 0) >= this.sourceLimit)
        || (runs.data?.length || 0) >= 200;
      this.updatedAt = new Date();
    } catch {
      this.error = 'Não foi possível atualizar todos os indicadores. Os últimos dados carregados foram preservados.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  get newLeads(): Prospect[] { return this.prospects.filter(p => p.status === 'new'); }
  get missingEmail(): Prospect[] { return this.newLeads.filter(p => !p.email?.trim()); }
  get addressableLeads(): Prospect[] {
    return this.newLeads.filter(p => !!p.email?.trim() && !!p.consent_at && !p.unsubscribed_at);
  }
  get contactedLeads(): number {
    return this.prospects.filter(p => ['contacted', 'replied', 'trial', 'won'].includes(p.status)).length;
  }
  get repliedLeads(): number {
    return this.prospects.filter(p => ['replied', 'trial', 'won'].includes(p.status)).length;
  }
  get trialLeads(): number { return this.prospects.filter(p => p.status === 'trial').length; }
  get wonLeads(): number { return this.prospects.filter(p => p.status === 'won').length; }
  get replyRate(): number { return this.contactedLeads ? this.repliedLeads / this.contactedLeads * 100 : 0; }
  get winRate(): number { return this.contactedLeads ? this.wonLeads / this.contactedLeads * 100 : 0; }
  get sentMessages(): Message[] { return this.messages.filter(m => m.status === 'sent' && this.inRange(m.sent_at)); }
  get failedMessages(): Message[] { return this.messages.filter(m => m.status === 'failed' && this.inRange(m.created_at)); }
  get queuedMessages(): Message[] { return this.messages.filter(m => m.status === 'queued'); }

  get paidPayments(): Payment[] {
    return this.payments.filter(p => p.status === 'paid' && p.currency?.toLowerCase() === 'brl' && this.inRange(p.paid_at));
  }
  get revenue(): number { return this.paidPayments.reduce((sum, p) => sum + p.amount_cents / 100, 0); }
  get averagePayment(): number { return this.paidPayments.length ? this.revenue / this.paidPayments.length : 0; }
  get failedPayments(): Payment[] { return this.payments.filter(p => p.status === 'failed' && this.inRange(p.created_at)); }
  get pendingPayments(): Payment[] { return this.payments.filter(p => p.status === 'pending' && this.inRange(p.created_at)); }
  get payingShare(): number {
    return this.metrics?.activeTenants ? this.metrics.payingTenants / this.metrics.activeTenants * 100 : 0;
  }

  get expiringTrials(): PlatformTenant[] {
    const now = Date.now();
    return this.tenants.filter(t => t.status === 'trial' && !!t.trial_ends_at
      && Date.parse(t.trial_ends_at) >= now
      && Date.parse(t.trial_ends_at) <= now + 7 * 86_400_000)
      .sort((a,b) => Date.parse(a.trial_ends_at || '') - Date.parse(b.trial_ends_at || ''));
  }
  get expiredTrials(): PlatformTenant[] {
    return this.tenants.filter(t => t.status === 'trial' && !!t.trial_ends_at && Date.parse(t.trial_ends_at) < Date.now());
  }
  get openTickets(): Support[] { return this.support; }
  get recentErrors(): ErrorEvent[] { return this.errors.filter(e => this.inRange(e.created_at)); }
  get failedRuns(): AgentRun[] { return this.runs.filter(r => this.inRange(r.created_at) && ['blocked','failed','partial'].includes(r.status)); }
  get errorGroups(): Array<{key: string; page: string; code: string; count: number}> {
    const grouped = new Map<string, {key: string; page: string; code: string; count: number}>();
    for (const e of this.recentErrors) {
      const page = e.page_path || 'Não identificado';
      const code = e.error_code || 'Erro não classificado';
      const key = page + '|' + code;
      const entry = grouped.get(key) || {key, page, code, count: 0};
      entry.count += 1;
      grouped.set(key, entry);
    }
    return [...grouped.values()].sort((a,b) => b.count - a.count).slice(0, 8);
  }
  get segmentRows(): Array<{name: string; count: number; share: number}> {
    const map = new Map<string, number>();
    for (const p of this.prospects) {
      const name = p.segment?.trim() || 'Não informado';
      map.set(name, (map.get(name) || 0) + 1);
    }
    const total = this.prospects.length || 1;
    return [...map.entries()].map(([name,count]) => ({name,count,share:count/total*100}))
      .sort((a,b) => b.count-a.count).slice(0, 7);
  }
  get revenueMonths(): Array<{key: string; label: string; total: number; percent: number}> {
    const keys: Array<{key: string; label: string; total: number; percent: number}> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1, 12);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      keys.push({key, label: date.toLocaleDateString('pt-BR', {month:'short'}), total:0, percent:0});
    }
    for (const p of this.payments) {
      if (p.status !== 'paid' || p.currency?.toLowerCase() !== 'brl' || !p.paid_at) continue;
      const date = new Date(p.paid_at);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      const row = keys.find(item => item.key === key);
      if (row) row.total += p.amount_cents / 100;
    }
    const max = Math.max(1, ...keys.map(k => k.total));
    return keys.map(row => ({...row, percent:row.total / max * 100}));
  }
  get actions(): ActionItem[] {
    const items: ActionItem[] = [];
    if (this.missingEmail.length) items.push({title:'Completar contatos comerciais',detail:'Prospects novos sem endereço de e-mail.',count:this.missingEmail.length,link:'/platform-admin/growth',icon:'pi-envelope'});
    if (this.addressableLeads.length) items.push({title:'Prospects elegíveis ainda não abordados',detail:'Com e-mail e autorização registrados no CRM.',count:this.addressableLeads.length,link:'/platform-admin/growth',icon:'pi-users'});
    if (this.failedMessages.length) items.push({title:'Revisar falhas no envio',detail:'Mensagens comerciais com erro no período.',count:this.failedMessages.length,link:'/platform-admin/growth',icon:'pi-exclamation-triangle'});
    if (this.expiringTrials.length) items.push({title:'Acompanhar testes terminando',detail:'Testes gratuitos que encerram em até sete dias.',count:this.expiringTrials.length,link:'/platform-admin/tenants',icon:'pi-calendar'});
    if (this.openTickets.length) items.push({title:'Responder solicitações de suporte',detail:'Atendimentos abertos ou em análise.',count:this.openTickets.length,link:'/platform-admin/control',icon:'pi-comments'});
    if (this.failedRuns.length) items.push({title:'Investigar execuções incompletas',detail:'Rotinas bloqueadas, parciais ou com falha.',count:this.failedRuns.length,link:'/platform-admin/settings',icon:'pi-bolt'});
    if (this.failedPayments.length) items.push({title:'Revisar pagamentos com falha',detail:'Transações de produção sem sucesso no período.',count:this.failedPayments.length,link:'/platform-admin/billing',icon:'pi-credit-card'});
    if (this.recentErrors.length) items.push({title:'Verificar erros da aplicação',detail:'Eventos técnicos registrados no período.',count:this.recentErrors.length,link:'/platform-admin/control',icon:'pi-shield'});
    return items.sort((a,b) => b.count-a.count);
  }
  get lastRuns(): AgentRun[] { return this.runs.filter(r => this.inRange(r.created_at)).slice(0,10); }
  runName(name:string):string {
    return ({research:'Pesquisa',gmail_outreach:'Envios comerciais',commercial_followup:'Acompanhamento',finance_monitor:'Revisão financeira',billing_verification:'Verificação de cobrança',agent_configuration:'Configuração',webhook_verification:'Webhook'} as Record<string,string>)[name] || name;
  }
  statusLabel(status:string):string {
    return ({completed:'Concluído',partial:'Parcial',blocked:'Bloqueado',failed:'Falhou',queued:'Na fila',sent:'Enviado',paid:'Pago',pending:'Pendente'} as Record<string,string>)[status] || status;
  }
  exportProspects():void {
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g,'""') + '"';
    const header = ['Empresa','E-mail','Segmento','Status','Último contato'];
    const rows = this.prospects.map(p => [p.business_name,p.email,p.segment,p.status,p.last_contact_at]);
    const csv = '\uFEFF' + [header, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agendaai-prospects-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
