import { Component, inject, OnInit, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-caixa.html',
  styleUrls: ['./admin-caixa.css']
})
export class AdminCaixa implements OnInit {
  private agendaService = inject(AgendaEventService);
  private prodService = inject(ProdutosService);
  private estService = inject(EstabelecimentoService);
  private profService = inject(ProfissionalService);
  private clienteService = inject(ClienteService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

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
  comandaProdutos: { produto: Produto, quantidade: number }[] = [];
  comandaToken = '';
  comandaFisica = '';
  emailCliente = '';
  formaPagamento: string = '';
  valorRecebido: number | null = null;
  clienteSelecionadoId: string = '';
  clientesLista: any[] = [];
  
  visitasFidelidade = 0;
  visitasMeta = 10;
  descontoPercentual = 0;
  aplicarFidelidade = false;
  isAniversariante = false;
  isFinalizing = false;

  // Impressao
  @ViewChild('printArea') printArea!: ElementRef;

  async ngOnInit() {
    this.estService.activeId$.subscribe(id => {
      if (id) {
        this.checkSessaoAberta();
        this.fetchPendentes();
      }
    });

    this.prodService.produtos$.subscribe(p => {
      this.produtosCatalogo = p.filter(x => x.ativo && x.estoque > 0);
      this.cdr.detectChanges();
    });
    this.clienteService.clientes$.subscribe(c => {
      this.clientesLista = c || [];
      this.cdr.detectChanges();
    });
  }

  // --- SESSÃO DO CAIXA ---

  async checkSessaoAberta() {
    this.isLoading = true;
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

      if (data) {
        this.sessaoAtual = data;
        this.fetchMovimentacoes();
      } else {
        this.sessaoAtual = null;
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async abrirCaixa() {
    try {
      const estabId = this.estService.estabelecimento$.value?.id;
      const profile = this.authService.userProfileValue;
      if (!estabId || !profile) return;

      const { data, error } = await this.profService['supabase']
        .from('caixa_sessoes')
        .insert([{
          estabelecimento_id: estabId,
          operador_id: profile.id,
          operador_nome: profile.nome,
          saldo_inicial: this.trocoInicial || 0,
          status: 'aberto'
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Lança suprimento do troco inicial
      if (this.trocoInicial > 0) {
        await this.profService['supabase']
          .from('caixa_movimentacoes')
          .insert([{
            sessao_id: data.id,
            tipo: 'suprimento',
            forma_pagamento: 'dinheiro',
            valor: this.trocoInicial,
            descricao: 'Troco inicial de abertura',
            operador_nome: profile.nome
          }]);
      }

      this.sessaoAtual = data;
      this.showAberturaModal = false;
      this.fetchMovimentacoes();
    } catch (e: any) {
      alert('Erro ao abrir caixa: ' + e.message);
    }
  }

  prepararFechamento() {
    let entradas = 0;
    let saidas = 0;
    
    this.movimentacoes.forEach(m => {
      if (m.forma_pagamento === 'dinheiro') {
        if (m.tipo === 'venda' || m.tipo === 'suprimento') {
          entradas += Number(m.valor);
        } else if (m.tipo === 'sangria' || m.tipo === 'estorno') {
          saidas += Number(m.valor);
        }
      }
    });

    const calculado = entradas - saidas;
    
    this.fechamentoRelatorio = {
      saldoInicial: this.sessaoAtual.saldo_inicial,
      totalEntradasDinheiro: entradas,
      totalSaidasDinheiro: saidas,
      saldoCalculado: calculado
    };
    
    this.showFechamentoModal = true;
  }

  async fecharCaixa() {
    if (this.saldoInformado === null) {
      alert('Informe o valor contado na gaveta para prosseguir.');
      return;
    }

    try {
      const { data, error } = await this.profService['supabase']
        .from('caixa_sessoes')
        .update({
          status: 'fechado',
          data_fechamento: new Date().toISOString(),
          saldo_final_informado: this.saldoInformado,
          saldo_final_calculado: this.fechamentoRelatorio.saldoCalculado,
          observacoes: (this.saldoInformado !== this.fechamentoRelatorio.saldoCalculado) ? 'Diferença de caixa registrada.' : ''
        })
        .eq('id', this.sessaoAtual.id)
        .select()
        .single();
        
      if (error) throw error;
      
      alert('Caixa fechado com sucesso!');
      this.imprimirFechamento(data, this.movimentacoes);
      this.sessaoAtual = null;
      this.showFechamentoModal = false;
      this.saldoInformado = null;
      
    } catch (e: any) {
      alert('Erro ao fechar caixa: ' + e.message);
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

      if (data) {
        this.movimentacoes = data;
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoadingMovs = false;
      this.cdr.detectChanges();
    }
  }

  async registrarMovimentoManual() {
    if (!this.valorMovimento || this.valorMovimento <= 0) {
      alert('Valor inválido.');
      return;
    }
    
    try {
      const profile = this.authService.userProfileValue;
      await this.profService['supabase']
        .from('caixa_movimentacoes')
        .insert([{
          sessao_id: this.sessaoAtual.id,
          tipo: this.tipoMovimento,
          forma_pagamento: this.formaMovimento,
          valor: this.valorMovimento,
          descricao: this.motivoMovimento || (this.tipoMovimento === 'sangria' ? 'Retirada de caixa' : 'Entrada manual'),
          operador_nome: profile?.nome
        }]);
        
      alert(`${this.tipoMovimento} registrada com sucesso.`);
      this.showSangriaModal = false;
      this.valorMovimento = 0;
      this.motivoMovimento = '';
      this.fetchMovimentacoes();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    }
  }

  async estornarMovimento(mov: any) {
    if (!confirm(`Deseja realmente estornar este lançamento de R$ ${mov.valor}?`)) return;
    
    try {
      const profile = this.authService.userProfileValue;
      await this.profService['supabase']
        .from('caixa_movimentacoes')
        .insert([{
          sessao_id: this.sessaoAtual.id,
          tipo: 'estorno',
          forma_pagamento: mov.forma_pagamento,
          valor: mov.valor,
          descricao: `Estorno Ref: ${mov.id.substring(0,8)}`,
          operador_nome: profile?.nome
        }]);
      
      // Se for venda, também cancela a comanda atrelada (se houver)
      if (mov.caixa_item_id) {
         await this.profService['supabase']
           .from('caixa_itens')
           .update({ status_caixa: 'cancelado' })
           .eq('id', mov.caixa_item_id);
      }
      
      alert('Lançamento estornado.');
      this.fetchMovimentacoes();
    } catch (e: any) {
      alert('Erro ao estornar: ' + e.message);
    }
  }

  // --- CHECKOUT EXISTENTE ---
  
  async fetchPendentes() {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const { data, error } = await this.profService['supabase']
        .from('agenda_events')
        .select('*, clientes(nome, telefone), servicos(titulo, preco, emoji, duracao_min)')
        .gte('start', `${hoje}T00:00:00`)
        .lte('start', `${hoje}T23:59:59`)
        .eq('status', 'concluido')
        .is('cobranca_enviada', null) 
        .order('start', { ascending: false });

      if (error) {
        console.error('Erro ao buscar pendentes:', error);
      } else {
        const { data: dataTrue } = await this.profService['supabase']
          .from('agenda_events')
          .select('*, clientes(nome, telefone), servicos(titulo, preco, emoji, duracao_min)')
          .gte('start', `${hoje}T00:00:00`)
          .lte('start', `${hoje}T23:59:59`)
          .eq('status', 'concluido')
          .eq('cobranca_enviada', false) 
          .order('start', { ascending: false });
        
        let arr1 = data || [];
        let arr2 = dataTrue || [];
        const combined = [...arr1, ...arr2];
        
        this.eventosPendentes = await Promise.all(combined.map(async (e: any) => {
          const security = (this.profService as any).security;
          if (e.title) e.title = await security.decryptData(e.title);
          if (e.clientes) {
            if (e.clientes.nome) e.clientes.nome = await security.decryptData(e.clientes.nome);
            if (e.clientes.telefone) e.clientes.telefone = await security.decryptData(e.clientes.telefone);
          }
          if (e.profissional_nome) e.profissional_nome = await security.decryptData(e.profissional_nome);
          return e;
        }));
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
      alert('Abra o caixa primeiro antes de iniciar um pagamento.');
      return;
    }
    
    this.eventoSelecionado = evento;
    this.resetCheckoutState();
    
    if (evento.servico_id) {
      const servicos = this.estService.servicos$.value;
      this.servicoPrincipal = servicos.find((s: any) => s.id === evento.servico_id);
      if (!this.servicoPrincipal && (evento as any).servicos) {
         this.servicoPrincipal = (evento as any).servicos;
      }
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
        this.visitasFidelidade = await this.clienteService.getVisitasFidelidadePendentes(evento.cliente_id);
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
    this.comandaProdutos = [];
    this.prodSelecionadoId = '';
    this.comandaToken = '';
    this.comandaFisica = '';
    this.emailCliente = '';
    this.formaPagamento = '';
    this.valorRecebido = null;
    this.clienteSelecionadoId = '';
    this.aplicarFidelidade = false;
    this.isAniversariante = false;
    this.visitasFidelidade = 0;
    this.servicoPrincipal = null;
  }

  iniciarVendaAvulsa() {
    if (!this.sessaoAtual) { alert('Abra o caixa primeiro.'); return; }
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
      this.visitasFidelidade = await this.clienteService.getVisitasFidelidadePendentes(this.clienteSelecionadoId);
    }
    
    this.cdr.detectChanges();
  }

  addProdutoNaComanda() {
    if (!this.prodSelecionadoId) return;
    const prod = this.produtosCatalogo.find(p => p.id === this.prodSelecionadoId);
    if (!prod) return;

    const exist = this.comandaProdutos.find(cp => cp.produto.id === prod.id);
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
    const fidelidadeDesc = this.aplicarFidelidade ? (servico * (this.descontoPercentual / 100)) : 0;
    const produtos = this.comandaProdutos.reduce((sum, cp) => sum + (cp.produto.preco * cp.quantidade), 0);
    return Math.max(0, servico - fidelidadeDesc) + produtos;
  }

  getDescontoFidelidade(): number {
    const servico = this.servicoPrincipal?.preco || 0;
    return this.aplicarFidelidade ? (servico * (this.descontoPercentual / 100)) : 0;
  }

  getTroco(): number {
    if (!this.valorRecebido) return 0;
    const total = this.getValorTotalCheckout();
    return Math.max(0, this.valorRecebido - total);
  }

  async finalizarEGerarComanda(isAvulso: boolean = false) {
    if (!this.formaPagamento) { alert('Selecione uma forma de pagamento.'); return; }
    
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
        const cli = this.clientesLista.find(c => c.id === this.clienteSelecionadoId);
        if (cli) clienteNome = cli.nome;
      }

      const total = this.getValorTotalCheckout();
      
      const caixaItem = await this.profService.finalizarEEnviarCaixa({
        eventId: eventId,
        clienteNome: clienteNome,
        servicoPrincipal: this.servicoPrincipal ? { titulo: this.servicoPrincipal.titulo, preco: this.servicoPrincipal.preco } as any : null,
        servicosExtras: [],
        produtos: this.comandaProdutos.map(cp => ({ id: cp.produto.id!, nome: cp.produto.nome, preco: cp.produto.preco, quantidade: cp.quantidade })),
        profissional: profissionalNome,
        comandaFisica: this.comandaFisica,
        emailCliente: this.emailCliente,
        formaPagamento: this.formaPagamento,
        fidelidadeDesconto: this.getDescontoFidelidade(),
        clienteId: clienteId,
        profissionalId: profissionalId,
        servicoId: servicoId,
        estabelecimentoId: this.estService.estabelecimento$.value?.id,
        sessaoId: this.sessaoAtual.id
      });
      
      // Registrar Movimentação
      await this.profService['supabase'].from('caixa_movimentacoes').insert([{
        sessao_id: this.sessaoAtual.id,
        caixa_item_id: caixaItem.id,
        tipo: 'venda',
        forma_pagamento: this.formaPagamento,
        valor: total,
        descricao: `Venda #${caixaItem.comanda_fisica || caixaItem.id?.substring(0,6)}`,
        operador_nome: this.authService.userProfileValue?.nome
      }]);
      
      this.comandaToken = caixaItem.token_publico || '';

      if (!isAvulso && this.eventoSelecionado) {
        this.eventosPendentes = this.eventosPendentes.filter(e => e.id !== this.eventoSelecionado!.id);
      }
      
      this.fetchMovimentacoes();
      
      // Imprimir Recibo Automaticamente
      this.imprimirComprovante(caixaItem, total, isAvulso);

      this.cdr.detectChanges();
    } catch (e: any) {
      alert('Erro: ' + e.message);
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
    this.comandaProdutos.forEach(cp => {
      html += `<div class="flex-between"><span>${cp.quantidade}x ${cp.produto.nome}</span><span>R$ ${(cp.produto.preco * cp.quantidade).toFixed(2)}</span></div>`;
    });

    if (this.aplicarFidelidade) {
       html += `<div class="flex-between"><span>Desc. Fidelidade</span><span>-R$ ${this.getDescontoFidelidade().toFixed(2)}</span></div>`;
    }

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
    
    let entradasDinheiro = 0, saidasDinheiro = 0;
    let totalPix = 0, totalCredito = 0, totalDebito = 0;

    movs.forEach(m => {
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

    const saldoCalc = sessao.saldo_inicial + entradasDinheiro - saidasDinheiro;
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
