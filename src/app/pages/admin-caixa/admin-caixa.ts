import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ProdutosService, Produto } from '../../services/produtos.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { ProfissionalService } from '../../services/profissional.service';
import { ClienteService } from '../../services/cliente.service';

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
  private cdr = inject(ChangeDetectorRef);

  eventosPendentes: AgendaEvent[] = [];
  isLoading = true;

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
  
  visitasFidelidade = 0;
  visitasMeta = 10;
  descontoPercentual = 0;
  aplicarFidelidade = false;
  isAniversariante = false;
  isFinalizing = false;

  async ngOnInit() {
    this.estService.activeId$.subscribe(id => {
      if (id) {
        this.fetchPendentes();
      }
    });

    this.prodService.produtos$.subscribe(p => {
      this.produtosCatalogo = p.filter(x => x.ativo && x.estoque > 0);
      this.cdr.detectChanges();
    });
  }

  async fetchPendentes() {
    this.isLoading = true;
    this.cdr.detectChanges();
    try {
      // Pega todos os eventos do dia que estão concluídos mas ainda não foram cobrados
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
        this.eventosPendentes = [...arr1, ...arr2];
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  formatTime(dt?: string): string {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async selecionarEvento(evento: AgendaEvent) {
    this.eventoSelecionado = evento;
    this.resetCheckoutState();
    
    // Serviço principal
    if (evento.servico_id) {
      const servicos = this.estService.servicos$.value;
      this.servicoPrincipal = servicos.find((s: any) => s.id === evento.servico_id);
      if (!this.servicoPrincipal && (evento as any).servicos) {
         this.servicoPrincipal = (evento as any).servicos;
      }
    }
    
    // Aniversariante
    if (evento.cliente_id) {
      const clientes = this.clienteService.getClientes();
      const cli = clientes.find((c: any) => c.id === evento.cliente_id);
      if (cli?.nascimento) {
        const [ano, mes] = cli.nascimento.split('-');
        const currentMes = new Date().getMonth() + 1;
        if (parseInt(mes, 10) === currentMes) {
          this.isAniversariante = true;
        }
      }

      // Fidelidade
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
    this.resetCheckoutState();
  }

  resetCheckoutState() {
    this.comandaProdutos = [];
    this.prodSelecionadoId = '';
    this.comandaToken = '';
    this.comandaFisica = '';
    this.emailCliente = '';
    this.formaPagamento = '';
    this.aplicarFidelidade = false;
    this.isAniversariante = false;
    this.visitasFidelidade = 0;
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

  async finalizarEGerarComanda() {
    if (!this.eventoSelecionado) return;
    if (!this.formaPagamento) { alert('Selecione uma forma de pagamento.'); return; }
    
    this.isFinalizing = true;
    try {
      const clienteNome = this.eventoSelecionado.title?.replace(/ - .*/, '') || 'Cliente';
      const caixaItem = await this.profService.finalizarEEnviarCaixa({
        eventId: this.eventoSelecionado.id!,
        clienteNome: clienteNome,
        servicoPrincipal: this.servicoPrincipal ? { titulo: this.servicoPrincipal.titulo, preco: this.servicoPrincipal.preco } as any : { titulo: 'Serviço', preco: 0 } as any,
        servicosExtras: [],
        produtos: this.comandaProdutos.map(cp => ({ id: cp.produto.id!, nome: cp.produto.nome, preco: cp.produto.preco, quantidade: cp.quantidade })),
        profissional: this.eventoSelecionado.profissional_nome || 'Profissional',
        comandaFisica: this.comandaFisica,
        emailCliente: this.emailCliente,
        formaPagamento: this.formaPagamento,
        fidelidadeDesconto: this.getDescontoFidelidade(),
        clienteId: this.eventoSelecionado.cliente_id,
        profissionalId: this.eventoSelecionado.profissional_id,
        servicoId: this.eventoSelecionado.servico_id,
        estabelecimentoId: this.estService.estabelecimento$.value?.id
      });
      
      this.comandaToken = caixaItem.token_publico || '';

      // Remover da lista
      this.eventosPendentes = this.eventosPendentes.filter(e => e.id !== this.eventoSelecionado!.id);
      
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
    this.resetCheckoutState();
  }
}
