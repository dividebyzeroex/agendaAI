import { SupabaseService } from '../../services/supabase.service';
import { boundedFetch } from '../../core/helpers/bounded-fetch';
import { canSubmitCashPayment, requiresReceivedPaymentConfirmation } from '../../core/helpers/cash-payment-confirmation';
import { Component, inject, OnInit, ChangeDetectorRef, ElementRef, ViewChild, HostListener } from '@angular/core';
import { interval } from 'rxjs';
import { PayQrComponent } from '../../components/pay-qr/pay-qr';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { agendaDay } from '../../utils/agenda-day';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ProdutosService, Produto } from '../../services/produtos.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { ProfissionalService } from '../../services/profissional.service';
import { ClienteService } from '../../services/cliente.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-caixa',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PayQrComponent],
  templateUrl: './admin-caixa.html',
  styleUrls: ['./admin-caixa.css'],
})
export class AdminCaixa implements OnInit {
  private agendaService = inject(AgendaEventService);
  private prodService = inject(ProdutosService);
  private estService = inject(EstabelecimentoService);
  private profService = inject(ProfissionalService);
  private clienteService = inject(ClienteService);
  private authService = inject(AuthService);
  get isOwner() {
    return this.authService.userProfileValue?.role === 'dono';
  }
  private cdr = inject(ChangeDetectorRef);

  private route = inject(ActivatedRoute);
  private destroy = inject(DestroyRef);
  private requestedId = this.route.snapshot.queryParamMap.get('atendimento');
  private requestedHandled = false;
  private connectDb = inject(SupabaseService).client;
  onlineEnabled = false;
  onlinePending = false;
  expressCheckoutUrl = '';
  payQrUrl = '';
  pendingOnline: Array<{
    id: string; token: string; customer: string; amount: number; createdAt: string;
  }> = [];
  pendingOnlineLoading = false;
  pendingOnlineError = '';
  payQrToken = '';
  payQrLabel = '';
  payQrAmount = 0;
  activePaymentChecking = false;
  private pendingCheckInFlight = false;

  getPayUrl(token: string): string { return window.location.origin + '/comanda/' + token; }
  getExpressPayUrl(token: string): string {
    if (token === this.payQrToken && this.payQrUrl) return this.payQrUrl;
    if (token === this.comandaToken && this.expressCheckoutUrl) return this.expressCheckoutUrl;
    return this.getPayUrl(token);
  }
  private verifiedStripeUrl(value: unknown): string {
    if (typeof value !== 'string') throw Error('Link de pagamento não retornado.');
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.stripe.com')
      throw Error('Endereço do checkout Stripe inválido.');
    return parsed.toString();
  }

  async loadPendingCharges() {
    const tenant = this.estService.estabelecimento$.value?.id;
    if (!tenant || !this.sessaoAtual || this.pendingCheckInFlight) return;
    this.pendingCheckInFlight = true;
    this.pendingOnlineLoading = true;
    this.pendingOnlineError = '';
    try {
      // Both tables have existing tenant-scoped RLS; no public admin endpoint is required.
      const {data: orders, error: orderError} = await this.connectDb
        .from('connect_orders')
        .select('id,amount_cents,status,created_at')
        .eq('estabelecimento_id', tenant)
        .eq('purpose', 'checkout')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(25);
      if (orderError) throw orderError;
      const ids = (orders || []).map(o => o.id);
      if (!ids.length) {
        if (tenant === this.estService.estabelecimento$.value?.id) this.pendingOnline = [];
        return;
      }
      const { data: receipts, error: receiptError } = await this.connectDb.from('caixa_itens')
        .select('id,cliente_nome,token_publico,valor_total,status_caixa')
        .eq('estabelecimento_id', tenant)
        .in('id', ids);
      if (receiptError) throw receiptError;
      const receiptById = new Map((receipts || []).map(r => [r.id, r]));
      if (tenant !== this.estService.estabelecimento$.value?.id) return;
      this.pendingOnline = (orders || []).flatMap(o => {
        const receipt = receiptById.get(o.id);
        if (!receipt || receipt.status_caixa !== 'pendente' || !receipt.token_publico) return [];
        return [{ id:o.id, token:receipt.token_publico, customer:receipt.cliente_nome || 'Cliente',
          amount:Number(o.amount_cents || 0)/100, createdAt:o.created_at }];
      });
    } catch {
      if (tenant === this.estService.estabelecimento$.value?.id)
        this.pendingOnlineError = 'Não foi possível atualizar os pagamentos pendentes.';
    } finally {
      this.pendingOnlineLoading = false;
      this.pendingCheckInFlight = false;
      this.cdr.markForCheck();
    }
  }

  async reviewActivePayment() {
    if (!this.onlinePending || !this.comandaToken || this.activePaymentChecking) return;
    const token = this.comandaToken;
    this.activePaymentChecking = true;
    try {
      const result = await boundedFetch('/api/billing?action=connect-receipt&token=' + encodeURIComponent(token));
      if (!result.ok) return;
      const status = await result.json();
      if (this.comandaToken !== token) return;
      if (status.online && status.status === 'paid') {
        this.onlinePending = false;
        this.notify('Pagamento confirmado pela Stripe. A comanda foi baixada.');
        void this.fetchMovimentacoes();
        void this.loadPendingCharges();
      } else if (status.online && ['expired','refunded','disputed'].includes(status.status)) {
        this.notify('Cobrança requer atenção: ' + status.status + '. Consulte Recebimentos.', true);
      }
    } catch {
      // Webhook is authoritative. Network problems must never mark a charge as paid.
    } finally {
      this.activePaymentChecking = false;
      this.cdr.markForCheck();
    }
  }

  async openPendingQr(item: {token:string;customer:string;amount:number}) {
    const token = item.token;
    this.payQrToken = token;
    this.payQrUrl = this.getPayUrl(token);
    this.payQrLabel = item.customer;
    this.payQrAmount = item.amount;
    this.cdr.markForCheck();
    // An existing Stripe checkout session is reused, not duplicated.
    if (!this.onlineEnabled) return;
    try {
      const response = await boundedFetch('/api/billing?action=connect-pay', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token})
      });
      const data = await response.json();
      if (response.ok && this.payQrToken === token)
        this.payQrUrl = this.verifiedStripeUrl(data.url);
    } catch {
      // Safe fallback: the public comanda can still open Stripe Checkout.
    } finally { this.cdr.markForCheck(); }
  }
  closePendingQr() {
    this.payQrToken = '';
    this.payQrUrl = '';
    this.payQrLabel = '';
    this.payQrAmount = 0;
  }
  @HostListener('document:keydown.escape')
  onEscape() { if (this.payQrToken) this.closePendingQr(); }

  async copyPayLink(token: string) {
    try {
      await navigator.clipboard.writeText(this.getExpressPayUrl(token));
      this.notify('Link de pagamento copiado.');
    } catch {
      this.notify('Não foi possível copiar. Abra a comanda pelo link.', true);
    }
  }
  async sharePayLink(token: string) {
    const url = this.getExpressPayUrl(token);
    if (typeof navigator.share !== 'function') return this.copyPayLink(token);
    try {
      await navigator.share({title:'Pagamento da comanda',text:'Acesse sua comanda e escolha como pagar:',url});
    } catch (error: any) {
      if (error?.name !== 'AbortError') this.notify('Não foi possível compartilhar o link.', true);
    }
  }

  async loadConnect() {
    this.onlineEnabled = false;
    const id = this.estService.estabelecimento$.value?.id;
    if (!id) return;
    try {
      const {
        data: { session },
      } = await this.connectDb.auth.getSession();
      const r = await boundedFetch('/api/billing?action=connect-status&estabelecimentoId=' + id, {
        headers: { Authorization: 'Bearer ' + session?.access_token },
      });
      const state = await r.json();
      if (id === this.estService.estabelecimento$.value?.id)
        this.onlineEnabled = r.ok && state.available && state.enabled && state.ready;
    } catch {}
    this.cdr.markForCheck();
  }
  checkoutKey = crypto.randomUUID();
  overview: any = null;
  overviewError = '';
  async loadOverview() {
    const id = this.estService.estabelecimento$.value?.id;
    if (!id) return;
    try {
      const { data, error } = await this.profService['supabase'].rpc('cash_overview', {
        p_tenant: id,
      });
      if (error) throw error;
      if (id !== this.estService.estabelecimento$.value?.id) return;
      if (data?.commissions)
        data.commissions = await Promise.all(
          data.commissions.map(async (c: any) => ({
            ...c,
            nome: await this.profService['security'].decryptData(c.nome),
          })),
        );
      this.overview = data;
      this.overviewError = '';
    } catch {
      this.overviewError = 'Não foi possível conferir o resumo financeiro.';
    }
    this.cdr.markForCheck();
  }
  message = '';
  messageError = false;
  sessionError = false;
  sessionBusy = false;
  lastClosure: any = null;
  get cashTaskActive() {
    return this.showFechamentoModal || this.showSangriaModal;
  }
  get selectedClientName() {
    return this.clientesLista.find((c) => c.id === this.clienteSelecionadoId)?.nome || '';
  }
  notify(message: string, error = false) {
    this.message = message;
    this.messageError = error;
    this.cdr.markForCheck();
  }
  openTask(type: 'movement' | 'close') {
    this.showSangriaModal = type === 'movement';
    this.showFechamentoModal = false;
    this.message = '';
    if (type === 'close') this.prepararFechamento();
  }
  closeTask() {
    this.showSangriaModal = false;
    this.showFechamentoModal = false;
  }
  async openRequested() {
    if (!this.requestedId || this.requestedHandled || !this.sessaoAtual) return;
    const target =
      this.eventosPendentes.find((e) => e.id === this.requestedId) ||
      this.agendaService.currentEvents.find((e) => e.id === this.requestedId);
    if (!target) return;
    this.requestedHandled = true;
    if (target.status !== 'concluido' || target.cobranca_enviada) {
      this.notify('Este atendimento já foi cobrado ou ainda precisa ser concluído.');
      return;
    }
    await this.selecionarEvento(target);
  }
  eventosPendentes: AgendaEvent[] = [];
  isLoading = true;
  isLoadingMovs = false;

  // POS Session State
  sessaoAtual: any = null;
  movimentacoes: any[] = [];
  currentTab: 'fila' | 'movimentacoes' = 'fila';

  // Modals
  showAberturaModal = false;
  showFechamentoModal = false;
  showSangriaModal = false;
  showVendaAvulsaModal = false;

  // Abertura
  trocoInicial: number = 0;

  // Fechamento
  saldoInformado: number | null = null;
  fechamentoRelatorio: any = null;

  // Sangria / Suprimento
  tipoMovimento: 'sangria' | 'suprimento' = 'sangria';
  valorMovimento: number = 0;
  motivoMovimento: string = '';
  formaMovimento: string = 'dinheiro';

  // Checkout State
  eventoSelecionado: AgendaEvent | null = null;
  servicoPrincipal: any;
  produtosCatalogo: Produto[] = [];
  prodSelecionadoId = '';
  comandaProdutos: { produto: Produto; quantidade: number }[] = [];
  comandaToken = '';
  checkoutComplete = false;
  comandaFisica = '';
  emailCliente = '';
  formaPagamento: string = '';
  manualPaymentConfirmed = false;
  readonly canSubmitCashPayment = canSubmitCashPayment;
  requiresManualConfirmation(): boolean {
    return requiresReceivedPaymentConfirmation(this.formaPagamento);
  }
  onPaymentMethodChanged(method: string): void {
    this.formaPagamento = method;
    this.manualPaymentConfirmed = false;
    this.valorRecebido = null;
  }
  valorRecebido: number | null = null;
  clienteSelecionadoId: string = '';
  clientesLista: any[] = [];

  visitasFidelidade = 0;
  visitasMeta = 0;
  descontoPercentual = 0;
  aplicarFidelidade = false;
  isAniversariante = false;
  isFinalizing = false;
  prepaidAmount = 0;
  depositVerified = true;

  // Impressao
  @ViewChild('printArea') printArea!: ElementRef;

  async ngOnInit() {
    this.estService.activeId$.pipe(takeUntilDestroyed(this.destroy)).subscribe((id) => {
      this.overview = null;
      this.overviewError = '';
      this.sessaoAtual = null;
      this.pendingOnline = [];
      this.closePendingQr();
      this.eventosPendentes = [];
      this.requestedHandled = false;
      this.cancelarCheckout();
      if (id) void this.loadConnect();
      if (id)
        void Promise.all([this.checkSessaoAberta(), this.fetchPendentes()]).then(() => {
          void this.loadPendingCharges();
          return this.openRequested();
        });
    });
    this.agendaService.events$
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => void this.openRequested());

    // Non-blocking payment observation. Stops automatically when the cashier page is destroyed.
    interval(16000).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      if (document.visibilityState !== 'visible' || !this.sessaoAtual) return;
      void this.loadPendingCharges();
      void this.reviewActivePayment();
    });

    this.prodService.produtos$.pipe(takeUntilDestroyed(this.destroy)).subscribe((p) => {
      this.produtosCatalogo = p.filter((x) => x.ativo && x.estoque > 0);
      this.cdr.detectChanges();
    });
    this.clienteService.clientes$.pipe(takeUntilDestroyed(this.destroy)).subscribe((c) => {
      this.clientesLista = c || [];
      this.cdr.detectChanges();
    });
  }

  // --- SESSÃO DO CAIXA ---

  async checkSessaoAberta() {
    this.isLoading = true;
    this.sessionError = false;
    void this.loadOverview();
    try {
      const estabId = this.estService.estabelecimento$.value?.id;
      if (!estabId) return;

      const { data, error } = await this.profService['supabase']
        .from('caixa_sessoes')
        .select('*')
        .eq('estabelecimento_id', estabId)
        .eq('status', 'aberto')
        .order('data_abertura', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        this.sessaoAtual = data;
        this.fetchMovimentacoes();
      } else {
        this.sessaoAtual = null;
      }
    } catch {
      this.sessionError = true;
      this.notify('Não foi possível verificar o caixa. Tente carregar novamente.', true);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async abrirCaixa() {
    if (this.sessionBusy || this.sessionError) return;
    if (!Number.isFinite(Number(this.trocoInicial)) || Number(this.trocoInicial) < 0) {
      this.notify('Informe um saldo inicial válido.', true);
      return;
    }
    this.sessionBusy = true;
    try {
      const estabId = this.estService.estabelecimento$.value?.id;
      const profile = this.authService.userProfileValue;
      if (!estabId || !profile) return;

      const { data, error } = await this.profService['supabase'].rpc('open_cash_atomic', {
        p_tenant: estabId,
        p_initial: Number(this.trocoInicial || 0),
        p_name: profile.nome,
      });

      if (error) throw error;

      this.sessaoAtual = data;
      this.showAberturaModal = false;
      void this.fetchMovimentacoes();
      void this.loadPendingCharges();
      await this.openRequested();
      this.notify('Caixa aberto.');
    } catch (e: any) {
      this.notify('Não foi possível abrir o caixa: ' + e.message, true);
    } finally {
      this.sessionBusy = false;
      this.cdr.markForCheck();
    }
  }

  prepararFechamento() {
    let entradas = 0;
    let saidas = 0;

    this.movimentacoes.forEach((m) => {
      if (m.forma_pagamento === 'dinheiro') {
        if (m.tipo === 'venda' || m.tipo === 'suprimento') {
          entradas += Number(m.valor);
        } else if (m.tipo === 'sangria' || m.tipo === 'estorno') {
          saidas += Number(m.valor);
        }
      }
    });

    const openingRecorded = this.movimentacoes.some(
      (m) => m.tipo === 'suprimento' && m.descricao === 'Troco inicial de abertura',
    );
    const calculado =
      (openingRecorded ? 0 : Number(this.sessaoAtual.saldo_inicial || 0)) + entradas - saidas;

    this.fechamentoRelatorio = {
      saldoInicial: this.sessaoAtual.saldo_inicial,
      totalEntradasDinheiro: entradas,
      totalSaidasDinheiro: saidas,
      saldoCalculado: calculado,
    };

    if (this.isLoadingMovs) {
      this.notify('Aguarde a conferência das movimentações.', true);
      return;
    }
    this.showFechamentoModal = true;
  }

  async fecharCaixa() {
    if (this.sessionBusy) return;
    if (this.saldoInformado === null) {
      this.notify('Informe o valor contado na gaveta para prosseguir.', true);
      return;
    }

    this.sessionBusy = true;
    try {
      const { data, error } = await this.profService['supabase'].rpc('close_cash_atomic', {
        p_session: this.sessaoAtual.id,
        p_counted: Number(this.saldoInformado),
      });

      if (error) throw error;

      this.notify('Caixa fechado. O relatório está disponível para impressão.');
      this.lastClosure = { data, movimentacoes: [...this.movimentacoes] };
      this.sessaoAtual = null;
      this.showFechamentoModal = false;
      this.saldoInformado = null;
    } catch (e: any) {
      this.notify('Não foi possível fechar o caixa: ' + e.message, true);
    } finally {
      this.sessionBusy = false;
      this.cdr.markForCheck();
    }
  }

  // --- MOVIMENTAÇÕES ---

  async fetchMovimentacoes() {
    if (!this.sessaoAtual) return;
    this.isLoadingMovs = true;
    try {
      const { data, error } = await this.profService['supabase']
        .from('caixa_movimentacoes')
        .select('*')
        .eq('sessao_id', this.sessaoAtual.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        this.movimentacoes = data;
      }
    } catch (e) {
      this.notify(
        'Não foi possível conferir as movimentações. Atualize antes de fechar o caixa.',
        true,
      );
    } finally {
      void this.loadOverview();
      this.isLoadingMovs = false;
      this.cdr.detectChanges();
    }
  }

  async registrarMovimentoManual() {
    if (this.sessionBusy) return;
    if (!this.valorMovimento || this.valorMovimento <= 0) {
      this.notify('Informe um valor maior que zero.', true);
      return;
    }

    this.sessionBusy = true;
    try {
      const profile = this.authService.userProfileValue;
      const { error } = await this.profService['supabase'].from('caixa_movimentacoes').insert([
        {
          sessao_id: this.sessaoAtual.id,
          tipo: this.tipoMovimento,
          forma_pagamento: this.formaMovimento,
          valor: this.valorMovimento,
          descricao:
            this.motivoMovimento ||
            (this.tipoMovimento === 'sangria' ? 'Retirada de caixa' : 'Entrada manual'),
          operador_nome: profile?.nome,
        },
      ]);

      if (error) throw error;
      this.notify('Movimentação registrada.');
      this.showSangriaModal = false;
      this.valorMovimento = 0;
      this.motivoMovimento = '';
      this.fetchMovimentacoes();
    } catch (e: any) {
      this.notify('Não foi possível registrar: ' + e.message, true);
    } finally {
      this.sessionBusy = false;
      this.cdr.markForCheck();
    }
  }

  async estornarMovimento(mov: any) {
    if (this.sessionBusy || !this.sessaoAtual) return;
    if (
      !confirm(
        `Registrar estorno de R$ ${mov.valor}? Confira a devolução ao cliente; esta ação registra o estorno no caixa e não devolve dinheiro pelo banco.`,
      )
    )
      return;
    this.sessionBusy = true;
    try {
      const { error } = await this.profService['supabase'].rpc('reverse_cash_atomic', {
        p_movement: mov.id,
        p_session: this.sessaoAtual.id,
      });
      if (error) throw error;
      this.notify(
        'Estorno registrado. Confira a devolução ao cliente; produtos não voltam automaticamente ao estoque.',
      );
      await this.fetchMovimentacoes();
    } catch (e: any) {
      this.notify(e.message || 'Não foi possível estornar.', true);
    } finally {
      this.sessionBusy = false;
      this.cdr.markForCheck();
    }
  }

  // --- CHECKOUT EXISTENTE ---

  async fetchPendentes() {
    const establishmentId = this.estService.estabelecimento$.value?.id;
    if (!establishmentId) return;
    try {
      const hoje = agendaDay(new Date());
      const { data, error } = await this.profService['supabase']
        .from('agenda_events')
        .select('*, clientes(nome, telefone), servicos(titulo, preco, emoji, duracao_min)')
        .eq('estabelecimento_id', establishmentId)
        .lte('start', `${hoje}T23:59:59.999-03:00`)
        .eq('status', 'concluido')
        .is('cobranca_enviada', null)
        .order('start', { ascending: false });

      if (error) {
        this.notify('Não foi possível consultar atendimentos pendentes.', true);
      } else {
        const { data: dataTrue, error: secondError } = await this.profService['supabase']
          .from('agenda_events')
          .select('*, clientes(nome, telefone), servicos(titulo, preco, emoji, duracao_min)')
          .eq('estabelecimento_id', establishmentId)
          .lte('start', `${hoje}T23:59:59.999-03:00`)
          .eq('status', 'concluido')
          .eq('cobranca_enviada', false)
          .order('start', { ascending: false });

        if (secondError) throw secondError;
        let arr1 = data || [];
        let arr2 = dataTrue || [];
        const combined = [...arr1, ...arr2];

        this.eventosPendentes = await Promise.all(
          combined.map(async (e: any) => {
            const security = (this.profService as any).security;
            if (e.title) e.title = await security.decryptData(e.title);
            if (e.clientes) {
              if (e.clientes.nome) e.clientes.nome = await security.decryptData(e.clientes.nome);
              if (e.clientes.telefone)
                e.clientes.telefone = await security.decryptData(e.clientes.telefone);
            }
            if (e.profissional_nome)
              e.profissional_nome = await security.decryptData(e.profissional_nome);
            return e;
          }),
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  formatTime(dt?: string): string {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async selecionarEvento(evento: AgendaEvent) {
    if (!this.sessaoAtual) {
      this.notify('Abra o caixa abaixo para receber este atendimento.');
      return;
    }

    this.eventoSelecionado = evento;
    this.resetCheckoutState();
    this.depositVerified = false;
    const tenant = this.estService.estabelecimento$.value?.id;
    const { data: deposit, error: depositError } = await this.profService['supabase']
      .from('booking_deposits')
      .select('amount,status')
      .eq('event_id', evento.id)
      .eq('estabelecimento_id', tenant)
      .abortSignal(AbortSignal.timeout(15000))
      .maybeSingle();
    if (
      tenant !== this.estService.estabelecimento$.value?.id ||
      this.eventoSelecionado?.id !== evento.id
    )
      return;
    if (depositError || (deposit && deposit.status !== 'paid')) {
      this.notify(
        'Não foi possível confirmar o sinal. Confira Recebimentos antes de concluir.',
        true,
      );
      this.cdr.markForCheck();
      return;
    }
    this.prepaidAmount = Number(deposit?.amount || 0);
    this.depositVerified = true;

    if (evento.servico_id) {
      const servicos = this.estService.servicos$.value;
      this.servicoPrincipal = servicos.find((s: any) => s.id === evento.servico_id);
      if (!this.servicoPrincipal && (evento as any).servicos) {
        this.servicoPrincipal = (evento as any).servicos;
      }
    }

    if (this.servicoPrincipal && evento.profissional_id && evento.servico_id) {
      const { data: rule, error } = await this.profService['supabase']
        .from('profissional_servicos')
        .select('valor_proprio')
        .eq('profissional_id', evento.profissional_id)
        .eq('servico_id', evento.servico_id)
        .maybeSingle();
      if (error) {
        this.notify(
          'Não foi possível conferir o preço do profissional. Tente abrir o atendimento novamente.',
          true,
        );
        this.servicoPrincipal = null;
        return;
      }
      if (rule?.valor_proprio != null)
        this.servicoPrincipal = { ...this.servicoPrincipal, preco: Number(rule.valor_proprio) };
    }
    if (evento.cliente_id) {
      this.clienteSelecionadoId = evento.cliente_id;
      const clientes = this.clienteService.getClientes();
      const cli = clientes.find((c: any) => c.id === evento.cliente_id);
      if (cli?.nascimento) {
        const [ano, mes] = cli.nascimento.split('-');
        const currentMes = new Date().getMonth() + 1;
        if (parseInt(mes, 10) === currentMes) {
          this.isAniversariante = true;
        }
      }

      const config = this.estService.estabelecimento$.value?.config_fidelidade;
      if (config?.ativo) {
        this.visitasMeta = config.visitas_meta || 10;
        this.descontoPercentual = config.desconto_percentual || 0;
        this.visitasFidelidade = await this.clienteService.getVisitasFidelidadePendentes(
          evento.cliente_id,
        );
      }
    }

    this.cdr.detectChanges();
  }

  cancelarCheckout() {
    this.eventoSelecionado = null;
    this.showVendaAvulsaModal = false;
    this.resetCheckoutState();
  }

  resetCheckoutState() {
    this.prepaidAmount = 0;
    this.depositVerified = true;
    this.comandaProdutos = [];
    this.prodSelecionadoId = '';
    this.comandaToken = '';
    this.expressCheckoutUrl = '';
    this.checkoutComplete = false;
    this.closePendingQr();
    this.onlinePending = false;
    this.checkoutKey = crypto.randomUUID();
    this.comandaFisica = '';
    this.emailCliente = '';
    this.formaPagamento = '';
    this.manualPaymentConfirmed = false;
    this.valorRecebido = null;
    this.clienteSelecionadoId = '';
    this.aplicarFidelidade = false;
    this.isAniversariante = false;
    this.visitasFidelidade = 0;
    this.visitasMeta = 0;
    this.descontoPercentual = 0;
    this.servicoPrincipal = null;
  }

  iniciarVendaAvulsa() {
    if (!this.sessaoAtual) {
      this.notify('Abra o caixa abaixo para receber.');
      return;
    }
    this.eventoSelecionado = null;
    this.resetCheckoutState();
    this.showVendaAvulsaModal = true;
  }

  async onClienteChange() {
    this.aplicarFidelidade = false;
    this.visitasFidelidade = 0;
    this.isAniversariante = false;

    if (!this.clienteSelecionadoId) return;

    const clientes = this.clienteService.getClientes();
    const cli = clientes.find((c: any) => c.id === this.clienteSelecionadoId);
    if (cli?.nascimento) {
      const [ano, mes] = cli.nascimento.split('-');
      const currentMes = new Date().getMonth() + 1;
      if (parseInt(mes, 10) === currentMes) {
        this.isAniversariante = true;
      }
    }

    const config = this.estService.estabelecimento$.value?.config_fidelidade;
    if (config?.ativo) {
      this.visitasMeta = config.visitas_meta || 10;
      this.descontoPercentual = config.desconto_percentual || 0;
      this.visitasFidelidade = await this.clienteService.getVisitasFidelidadePendentes(
        this.clienteSelecionadoId,
      );
    }

    this.cdr.detectChanges();
  }

  addProdutoNaComanda() {
    if (!this.prodSelecionadoId) return;
    const prod = this.produtosCatalogo.find((p) => p.id === this.prodSelecionadoId);
    if (!prod) return;

    const exist = this.comandaProdutos.find((cp) => cp.produto.id === prod.id);
    if (exist) {
      if (exist.quantidade < prod.estoque) exist.quantidade++;
    } else {
      this.comandaProdutos.push({ produto: prod, quantidade: 1 });
    }
    this.prodSelecionadoId = '';
  }

  diminuirQtd(index: number) {
    this.comandaProdutos[index].quantidade--;
    if (this.comandaProdutos[index].quantidade <= 0) {
      this.comandaProdutos.splice(index, 1);
    }
  }

  getValorTotalCheckout(): number {
    const servico = this.servicoPrincipal?.preco || 0;
    const fidelidadeDesc = this.aplicarFidelidade ? servico * (this.descontoPercentual / 100) : 0;
    const produtos = this.comandaProdutos.reduce(
      (sum, cp) => sum + cp.produto.preco * cp.quantidade,
      0,
    );
    return Math.max(0, servico - fidelidadeDesc + produtos - this.prepaidAmount);
  }

  getDescontoFidelidade(): number {
    const servico = this.servicoPrincipal?.preco || 0;
    return this.aplicarFidelidade ? servico * (this.descontoPercentual / 100) : 0;
  }

  getTroco(): number {
    if (!this.valorRecebido) return 0;
    const total = this.getValorTotalCheckout();
    return Math.max(0, this.valorRecebido - total);
  }

  async finalizarEGerarComanda(isAvulso: boolean = false) {
    if (this.isFinalizing || this.checkoutComplete || !this.depositVerified) return;
    if (
      !this.sessaoAtual ||
      !this.clientesLista.some((c) => c.id === this.clienteSelecionadoId) ||
      !this.formaPagamento
    ) {
      this.notify('Confira cliente, caixa aberto e forma de pagamento.', true);
      return;
    }
    if (!canSubmitCashPayment(this.formaPagamento, this.manualPaymentConfirmed)) {
      this.notify('Confirme que o pagamento foi recebido antes de registrar. Para cobrar o cliente, selecione AgendaAI Pay Express.', true);
      return;
    }
    if (
      this.getValorTotalCheckout() <= 0 ||
      (this.formaPagamento === 'dinheiro' &&
        Number(this.valorRecebido) < this.getValorTotalCheckout())
    ) {
      this.notify('Confira o total e o valor recebido.', true);
      return;
    }

    this.isFinalizing = true;
    try {
      let clienteNome = 'Venda Avulsa';
      let eventId = '';
      let profissionalNome = this.authService.userProfileValue?.nome || 'Balcão';
      let clienteId, profissionalId, servicoId;

      if (!isAvulso && this.eventoSelecionado) {
        eventId = this.eventoSelecionado.id || '';
        profissionalNome = this.eventoSelecionado.profissional_nome || 'Profissional';
        profissionalId = this.eventoSelecionado.profissional_id;
        servicoId = this.eventoSelecionado.servico_id;
      }

      if (this.clienteSelecionadoId) {
        clienteId = this.clienteSelecionadoId;
        const cli = this.clientesLista.find((c) => c.id === this.clienteSelecionadoId);
        if (cli) clienteNome = cli.nome;
      }

      const total = this.getValorTotalCheckout();

      const caixaItem = await this.profService.finalizarEEnviarCaixa({
        eventId: eventId,
        clienteNome: clienteNome,
        servicoPrincipal: this.servicoPrincipal
          ? ({ titulo: this.servicoPrincipal.titulo, preco: this.servicoPrincipal.preco } as any)
          : null,
        servicosExtras: [],
        produtos: this.comandaProdutos.map((cp) => ({
          id: cp.produto.id!,
          nome: cp.produto.nome,
          preco: cp.produto.preco,
          quantidade: cp.quantidade,
        })),
        profissional: profissionalNome,
        comandaFisica: this.comandaFisica,
        emailCliente: this.emailCliente,
        formaPagamento: this.formaPagamento === 'online' ? 'cartao_credito' : this.formaPagamento,
        online: this.formaPagamento === 'online',
        fidelidadeDesconto: this.getDescontoFidelidade(),
        clienteId: clienteId,
        profissionalId: profissionalId,
        servicoId: servicoId,
        estabelecimentoId: this.estService.estabelecimento$.value?.id,
        sessaoId: this.sessaoAtual.id,
        checkoutKey: this.checkoutKey,
        valorRecebido: this.valorRecebido,
      });

      // checkout_atomic may return an existing receipt for an appointment already settled.
      // Never present an earlier manual receipt as a new, unpaid Stripe checkout.
      if (this.formaPagamento === 'online' && caixaItem.status_caixa !== 'pendente') {
        throw Error('Este atendimento já possui um pagamento registrado ou concluído. Confira a comanda antes de criar outra cobrança.');
      }
      if (this.formaPagamento !== 'online' &&
          (caixaItem.status_caixa === 'pendente' ||
           caixaItem.payment_provider === 'stripe_connect' ||
           caixaItem.forma_pagamento !== this.formaPagamento)) {
        throw Error('A comanda já existe com outra modalidade de recebimento. Confira a cobrança original antes de continuar.');
      }
      this.onlinePending = caixaItem.status_caixa === 'pendente';
      this.checkoutComplete = true;
      this.comandaToken = caixaItem.token_publico || '';
      if (this.onlinePending) {
        const response = await boundedFetch('/api/billing?action=connect-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.comandaToken }),
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(
            result.error || 'Cobrança preparada; confira o link e não registre novamente.',
          );
        this.expressCheckoutUrl = this.verifiedStripeUrl(result.url);
      }

      if (!isAvulso && this.eventoSelecionado) {
        this.eventosPendentes = this.eventosPendentes.filter(
          (e) => e.id !== this.eventoSelecionado!.id,
        );
      }

      this.fetchMovimentacoes();
      if (this.onlinePending) void this.loadPendingCharges();

      void this.agendaService.reload();
      void this.loadOverview();
      this.notify(
        this.onlinePending
          ? 'Cobrança criada. Compartilhe a comanda para o cliente pagar. O recebimento será confirmado pela Stripe.'
          : 'Recebimento confirmado pelo atendente: ' +
              Number(caixaItem.valor_total).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              }) +
              ' registrado. Você pode conferir a comanda.',
      );

      this.cdr.detectChanges();
    } catch (e: any) {
      this.notify(
        this.checkoutComplete
          ? this.onlinePending
            ? 'Cobrança pendente criada. Não crie outra cobrança; confira a comanda ou cancele em Preparar minha agenda → Receber pela aplicação.'
            : 'Venda registrada, mas não foi possível atualizar as movimentações. Não registre novamente; confira o caixa.'
          : 'Não foi possível concluir: ' + e.message,
        true,
      );
    } finally {
      this.isFinalizing = false;
      this.cdr.detectChanges();
    }
  }

  getComandaUrl(): string {
    return window.location.origin + '/comanda/' + this.comandaToken;
  }

  concluirTela() {
    this.eventoSelecionado = null;
    this.showVendaAvulsaModal = false;
    this.resetCheckoutState();
  }

  // --- IMPRESSÃO TÉRMICA (80mm) ---
  imprimirComprovante(caixaItem: any, total: number, isAvulso: boolean) {
    const estNome = this.estService.estabelecimento$.value?.nome || 'Estabelecimento';
    const dataHora = new Date().toLocaleString('pt-BR');

    let html = `
      <html>
      <head>
        <style>
          @page { margin: 0; size: 80mm 297mm; }
          body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; margin: 0; font-size: 12px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .flex-between { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 16px;">${estNome}</div>
        <div class="center">COMPROVANTE DE VENDA</div>
        <div class="center">${dataHora}</div>
        <div class="divider"></div>
        <div><strong>Cliente:</strong> ${caixaItem.cliente_nome || 'Consumidor'}</div>
        <div><strong>Atendente:</strong> ${caixaItem.profissional || 'Balcão'}</div>
        <div class="divider"></div>
        <div class="bold">ITENS DA COMANDA:</div>
    `;

    if (this.servicoPrincipal) {
      html += `<div class="flex-between"><span>1x ${this.servicoPrincipal.titulo}</span><span>R$ ${this.servicoPrincipal.preco.toFixed(2)}</span></div>`;
    }
    this.comandaProdutos.forEach((cp) => {
      html += `<div class="flex-between"><span>${cp.quantidade}x ${cp.produto.nome}</span><span>R$ ${(cp.produto.preco * cp.quantidade).toFixed(2)}</span></div>`;
    });

    if (this.aplicarFidelidade) {
      html += `<div class="flex-between"><span>Desc. Fidelidade</span><span>-R$ ${this.getDescontoFidelidade().toFixed(2)}</span></div>`;
    }

    if (caixaItem.prepaid_amount > 0)
      html += `<div class="flex-between"><span>Sinal já recebido</span><span>-R$ ${Number(caixaItem.prepaid_amount).toFixed(2)}</span></div>`;
    html += `
        <div class="divider"></div>
        <div class="flex-between bold" style="font-size: 14px;"><span>TOTAL</span><span>R$ ${total.toFixed(2)}</span></div>
        <div class="flex-between"><span>Forma Pagto:</span><span>${this.formaPagamento.toUpperCase()}</span></div>
        <div class="divider"></div>
        <div class="center">Obrigado pela preferência!</div>
        <div class="center">Desenvolvido por AgendaAI</div>
      </body>
      </html>
    `;

    this.abrirEImprimir(html);
  }

  imprimirFechamento(sessao: any, movs: any[]) {
    const estNome = this.estService.estabelecimento$.value?.nome || 'Estabelecimento';
    const dataHora = new Date().toLocaleString('pt-BR');

    let entradasDinheiro = 0,
      saidasDinheiro = 0;
    let totalPix = 0,
      totalCredito = 0,
      totalDebito = 0;

    movs.forEach((m) => {
      const v = Number(m.valor);
      if (m.forma_pagamento === 'dinheiro') {
        if (m.tipo === 'venda' || m.tipo === 'suprimento') entradasDinheiro += v;
        if (m.tipo === 'sangria' || m.tipo === 'estorno') saidasDinheiro += v;
      } else if (m.forma_pagamento === 'pix' && m.tipo === 'venda') {
        totalPix += v;
      } else if (m.forma_pagamento === 'cartao_credito' && m.tipo === 'venda') {
        totalCredito += v;
      } else if (m.forma_pagamento === 'cartao_debito' && m.tipo === 'venda') {
        totalDebito += v;
      }
    });

    const saldoCalc = Number(
      sessao.saldo_final_calculado ??
        Number(sessao.saldo_inicial || 0) + entradasDinheiro - saidasDinheiro,
    );
    const dif = sessao.saldo_final_informado - saldoCalc;

    let html = `
      <html>
      <head>
        <style>
          @page { margin: 0; size: 80mm 297mm; }
          body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; margin: 0; font-size: 12px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .flex-between { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 16px;">${estNome}</div>
        <div class="center">FECHAMENTO DE CAIXA (Z-READ)</div>
        <div class="center">${dataHora}</div>
        <div class="divider"></div>
        <div><strong>Operador:</strong> ${sessao.operador_nome}</div>
        <div><strong>Abertura:</strong> ${new Date(sessao.data_abertura).toLocaleString('pt-BR')}</div>
        <div><strong>Fechamento:</strong> ${new Date(sessao.data_fechamento).toLocaleString('pt-BR')}</div>
        <div class="divider"></div>

        <div class="flex-between"><span>Fundo de Caixa (Abertura)</span><span>R$ ${Number(sessao.saldo_inicial).toFixed(2)}</span></div>
        <div class="flex-between"><span>(+) Entradas em Dinheiro</span><span>R$ ${entradasDinheiro.toFixed(2)}</span></div>
        <div class="flex-between"><span>(-) Saídas em Dinheiro</span><span>R$ ${saidasDinheiro.toFixed(2)}</span></div>
        <div class="flex-between bold"><span>(=) SALDO CALCULADO (GAVETA)</span><span>R$ ${saldoCalc.toFixed(2)}</span></div>
        <div class="flex-between"><span>Gaveta Contada (Informado)</span><span>R$ ${Number(sessao.saldo_final_informado).toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="flex-between bold"><span>QUEBRA DE CAIXA</span><span>R$ ${dif.toFixed(2)}</span></div>

        <div class="divider"></div>
        <div class="center bold">RESUMO OUTRAS FORMAS</div>
        <div class="flex-between"><span>PIX</span><span>R$ ${totalPix.toFixed(2)}</span></div>
        <div class="flex-between"><span>Crédito</span><span>R$ ${totalCredito.toFixed(2)}</span></div>
        <div class="flex-between"><span>Débito</span><span>R$ ${totalDebito.toFixed(2)}</span></div>

        <div class="divider"></div>
        <div class="center">AgendaAI - PDV</div>
      </body>
      </html>
    `;

    this.abrirEImprimir(html);
  }

  abrirEImprimir(htmlContent: string) {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }
}
