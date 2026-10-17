import { Component, inject, OnInit, DestroyRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
@Component({
  selector: 'app-integration-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './integration-workspace.html',
  styleUrls: ['./integration-workspace.css'],
})
export class IntegrationWorkspace implements OnInit {
  private db = inject(SupabaseService).client;
  private est = inject(EstabelecimentoService);
  private destroy = inject(DestroyRef);
  tenant = '';
  tab = 'whatsapp';
  loading = signal(false);
  busy = signal(false);
  error = signal('');
  notice = signal('');
  data = signal<any>(null);
  config: any = {};
  whatsappToken = '';
  fiscalToken = '';
  whatsappConfirmed = false;
  productionConfirmed = false;
  receipts: any[] = [];
  products: any[] = [];
  receipt = '';
  customerDocument = '';
  preview = signal<any>(null);
  sendConfirm = '';
  editingProduct = '';
  editProduct(p: any, open: boolean) {
    if (open) {
      this.editingProduct = p.id;
      this.config.fiscal_profile.products[p.id] ||= { descricao: p.nome, unidade_comercial: 'UN' };
    } else if (this.editingProduct === p.id) this.editingProduct = '';
  }
  issuerFields = [
    { key: 'nome_emitente', label: 'Razão social' },
    { key: 'nome_fantasia_emitente', label: 'Nome fantasia' },
    { key: 'inscricao_estadual_emitente', label: 'Inscrição estadual' },
    { key: 'logradouro_emitente', label: 'Logradouro' },
    { key: 'numero_emitente', label: 'Número' },
    { key: 'bairro_emitente', label: 'Bairro' },
    { key: 'municipio_emitente', label: 'Município' },
    { key: 'codigo_municipio_emitente', label: 'Código IBGE' },
    { key: 'uf_emitente', label: 'UF' },
    { key: 'cep_emitente', label: 'CEP' },
    { key: 'regime_tributario_emitente', label: 'Regime tributário (código)' },
  ];
  taxFields = [
    { key: 'ncm', label: 'NCM' },
    { key: 'cfop', label: 'CFOP' },
    { key: 'icms_origem', label: 'Origem ICMS' },
    { key: 'icms_situacao_tributaria', label: 'Situação ICMS' },
    { key: 'pis_situacao_tributaria', label: 'Situação PIS' },
    { key: 'cofins_situacao_tributaria', label: 'Situação COFINS' },
  ];
  ngOnInit() {
    this.est.estabelecimento$.pipe(takeUntilDestroyed(this.destroy)).subscribe((t) => {
      if (t?.id && t.id !== this.tenant) {
        this.tenant = t.id;
        this.data.set(null);
        this.whatsappToken = '';
        this.fiscalToken = '';
        void this.load();
      }
    });
  }
  async request(action: string, extra: any = {}) {
    const tenant = this.tenant;
    const {
      data: { session },
    } = await this.db.auth.getSession();
    if (!session) throw Error('Entre novamente.');
    const r = await boundedFetch('/api/billing?action=' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ estabelecimentoId: tenant, ...extra }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Não foi possível concluir.');
    return d;
  }
  async load() {
    const tenant = this.tenant;
    if (!tenant) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const [d, r, p] = await Promise.all([
        this.request('integration-info'),
        this.db
          .from('caixa_itens')
          .select('id,cliente_nome,valor_total,created_at')
          .eq('estabelecimento_id', tenant)
          .eq('status_caixa', 'pago')
          .order('created_at', { ascending: false })
          .limit(100)
          .abortSignal(AbortSignal.timeout(15000)),
        this.db
          .from('produtos')
          .select('id,nome')
          .eq('estabelecimento_id', tenant)
          .eq('ativo', true)
          .order('nome')
          .limit(2000)
          .abortSignal(AbortSignal.timeout(15000)),
      ]);
      if (tenant !== this.tenant) return;
      if (r.error || p.error) throw Error('Não foi possível conferir vendas ou produtos.');
      this.data.set(d);
      this.config = d.config || {
        whatsapp_enabled: false,
        whatsapp_phone_id: '',
        whatsapp_template: '',
        pix_enabled: false,
        fiscal_enabled: false,
        fiscal_environment: 'homologation',
        fiscal_kind: 'nfse',
        fiscal_cnpj: '',
        fiscal_profile: {},
      };
      this.config.fiscal_profile = {
        simple: false,
        issRate: 0,
        ...this.config.fiscal_profile,
        issuer: this.config.fiscal_profile?.issuer || {},
        products: this.config.fiscal_profile?.products || {},
      };
      this.receipts = r.data || [];
      this.products = p.data || [];
      this.whatsappConfirmed = !!this.config.whatsapp_enabled;
      this.productionConfirmed = this.config.fiscal_environment === 'production';
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Área indisponível.');
    } finally {
      if (tenant === this.tenant) this.loading.set(false);
    }
  }
  async action(action: string, extra: any = {}) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const d = await this.request(action, extra);
      if (action === 'fiscal-preview') this.preview.set(d.payload);
      else {
        this.notice.set(
          action === 'integration-save'
            ? 'Configuração salva.'
            : action === 'fiscal-draft'
              ? 'Rascunho criado. Revise antes de enviar.'
              : 'Andamento atualizado.',
        );
        this.whatsappToken = '';
        this.fiscalToken = '';
        this.sendConfirm = '';
        await this.load();
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Tente novamente.');
    } finally {
      this.busy.set(false);
    }
  }
  save() {
    return this.action('integration-save', {
      config: this.config,
      whatsappToken: this.whatsappToken,
      fiscalToken: this.fiscalToken,
      whatsappConfirmed: this.whatsappConfirmed,
      productionConfirmed: this.productionConfirmed,
    });
  }
  status(s: string) {
    return (
      (
        {
          pending: 'Na fila',
          sending: 'Sem confirmação',
          sent: 'Enviado',
          delivered: 'Entregue',
          read: 'Lido',
          failed: 'Falhou',
          suppressed: 'Suprimido',
          draft: 'Rascunho',
          processing: 'Em processamento',
          authorized: 'Autorizada',
          rejected: 'Rejeitada',
          cancelled: 'Cancelada',
          review: 'Revisar resultado',
        } as Record<string, string>
      )[s] || s
    );
  }
}
