import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { ProdutosService, Produto } from '../../services/produtos.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { ProfissionalService } from '../../services/profissional.service';
import { ClienteService } from '../../services/cliente.service';

@Component({
  selector: 'app-evento-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="modal-backdrop" (click)="fechar()">
    <div class="evento-modal-box" [class.checkout-mode]="isCheckoutMode" (click)="$event.stopPropagation()">
      <div class="evento-header" [style.border-left-color]="evento?.backgroundColor || '#1a73e8'">
        <div class="evento-icon">{{ getEmoji() }}</div>
        <div class="evento-info">
          <strong>
            {{ evento?.title }} 
            <span *ngIf="isAniversariante" class="ani-badge" title="Aniversariante do Mês!"><i class="pi pi-gift"></i></span>
          </strong>
          <span class="evento-time">{{ formatTime(evento?.start) }} → {{ formatTime(evento?.end) }}</span>
        </div>
        <button class="close-btn" (click)="fechar()"><i class="pi pi-times"></i></button>
      </div>

      <div class="evento-body" *ngIf="!isCheckoutMode && !isRecoveryMode">
        <div class="status-summary">
          <div class="ss-item">
            <span class="ss-label">Status Atual</span>
            <span class="status-pill-ent" [class]="evento?.status || 'confirmado'">
              {{ statusLabel(evento?.status) }}
            </span>
          </div>
          <div class="ss-item" *ngIf="evento?.profissional_nome">
            <span class="ss-label">Responsável</span>
            <span class="ss-val">{{ evento?.profissional_nome }}</span>
          </div>
        </div>

        <div class="obs-box" *ngIf="evento?.observacoes">
          <span class="ss-label">Observações</span>
          <p>{{ evento?.observacoes }}</p>
        </div>
      </div>

      <div class="evento-footer-ent" *ngIf="!isCheckoutMode && !isRecoveryMode">
        
        <!-- Casos onde o atendimento ainda não começou -->
        <ng-container *ngIf="evento?.status === 'confirmado' || !evento?.status">
          <button class="btn-primary primary" (click)="mudarStatus('em_atendimento')">
            <i class="pi pi-play"></i> Iniciar Atendimento
          </button>
          <button class="btn-primary warning" (click)="mudarStatus('noshow')">
            <i class="pi pi-user-minus"></i> No-Show
          </button>
        </ng-container>

        <!-- Caso onde o atendimento está em curso -->
        <ng-container *ngIf="evento?.status === 'em_atendimento'">
          <button class="btn-primary success" (click)="iniciarCheckout()">
            <i class="pi pi-check-circle"></i> Finalizar Atendimento
          </button>
        </ng-container>

        <!-- Caso onde já está concluído (Recuperação) -->
        <ng-container *ngIf="evento?.status === 'concluido'">
          <button class="btn-primary primary" (click)="iniciarRecuperacao()" [disabled]="isLoadingRecovery">
            <i class="pi" [class.pi-spin]="isLoadingRecovery" [class.pi-spinner]="isLoadingRecovery" [class.pi-receipt]="!isLoadingRecovery"></i> {{ isLoadingRecovery ? 'Carregando...' : 'Ver Comanda do Cliente' }}
          </button>
        </ng-container>

        <!-- Ações secundárias -->
        <div class="footer-secondary">
          <button class="btn-ghost danger" (click)="confirmarDelete()">
            <i class="pi" [class.pi-trash]="!confirmDelete" [class.pi-exclamation-triangle]="confirmDelete"></i>
            {{ confirmDelete ? 'Confirmar' : 'Excluir' }}
          </button>
          <button class="btn-ghost" (click)="fechar()">Fechar</button>
        </div>
      </div>

      <!-- VISÃO: RECUPERAÇÃO / COMANDA JÁ GERADA -->
      <div class="checkout-body custom-scroll" *ngIf="isRecoveryMode">
         <div class="chk-section text-center">
            <h3 style="margin-bottom: 4px; color: #1e293b;">Comanda Digital</h3>
            <p style="margin-top: 0; color: #64748b; font-size: 0.9rem;">Gerada em: {{ recoveredCaixa?.created_at | date:'dd/MM/yyyy HH:mm' }}</p>
         </div>
         
         <div class="chk-total" style="margin-top: 0; margin-bottom: 24px;">
           <span>Valor Total</span>
           <strong>R$ {{ recoveredCaixa?.valor_total | number:'1.2-2' }}</strong>
         </div>

         <div class="chk-section">
           <label class="input-label">E-mail do Cliente para Reenvio</label>
           <div style="display: flex; gap: 8px; margin-top: 6px;">
             <input type="email" [(ngModel)]="emailCliente" class="prod-select" placeholder="cliente@email.com">
             <button class="btn-primary primary" style="width: auto; padding: 10px 16px;" (click)="enviarComandaEmail()" [disabled]="isSendingEmail">
               <i class="pi pi-send" *ngIf="!isSendingEmail"></i>
               <i class="pi pi-spin pi-spinner" *ngIf="isSendingEmail"></i>
             </button>
           </div>
         </div>

         <div class="comanda-link-box">
            <p>Link de acesso público:</p>
            <a [href]="getComandaUrl()" target="_blank" class="comanda-url">Acessar Comanda</a>
            
            <div style="display:flex; justify-content:center; gap: 10px; margin-top: 16px;">
              <button class="btn-ghost" (click)="copiarLink()"><i class="pi pi-copy"></i> Copiar Link</button>
            </div>
         </div>
      </div>

      <div class="evento-footer-ent" *ngIf="isRecoveryMode">
         <button class="btn-ghost" (click)="fechar()">Fechar</button>
      </div>

      <!-- VISÃO: CHECKOUT / COMANDA -->
      <div class="checkout-body custom-scroll" *ngIf="isCheckoutMode">
        <div class="chk-section">
           <h4>Serviço Realizado</h4>
           <div class="chk-item" *ngIf="servicoPrincipal">
             <span>{{ servicoPrincipal.titulo }}</span>
             <strong>R$ {{ servicoPrincipal.preco | number:'1.2-2' }}</strong>
           </div>
           
           <div class="fidelidade-card" *ngIf="visitasMeta > 0 && evento?.cliente_id">
             <div class="fid-head">
               <i class="pi pi-star-fill" style="color: #f59e0b"></i> Fidelidade do Cliente
             </div>
             <p style="font-size: 0.85rem; color: #64748b; margin: 4px 0 10px 0;">
               Este cliente possui <b>{{ visitasFidelidade }}</b> visitas de <b>{{ visitasMeta }}</b> necessárias.
             </p>
             <div class="fid-progress-bg">
               <div class="fid-progress-fill" [style.width]="(visitasFidelidade / visitasMeta) * 100 + '%'"></div>
             </div>
             
             <div *ngIf="visitasFidelidade >= visitasMeta" style="margin-top: 12px; background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
               <label class="ag-checkbox" style="font-size: 0.9rem; font-weight: 500; color: #10b981; cursor: pointer;">
                 <input type="checkbox" [(ngModel)]="aplicarFidelidade" style="margin-right: 8px;">
                 Aplicar desconto de {{ descontoPercentual }}% no serviço!
               </label>
             </div>
           </div>

           <div class="chk-item" *ngIf="!servicoPrincipal">
             <span class="loading-text">Carregando serviço...</span>
           </div>
        </div>

        <div class="chk-section">
           <h4>Adicionar Produtos</h4>
           <div class="add-prod-row">
             <select [(ngModel)]="prodSelecionadoId" class="prod-select">
               <option value="">Selecione um produto...</option>
               <option *ngFor="let p of produtosCatalogo" [value]="p.id">
                 {{ p.nome }} - R$ {{ p.preco | number:'1.2-2' }} (Estoque: {{p.estoque}})
               </option>
             </select>
             <button class="btn-add-prod" (click)="addProdutoNaComanda()"><i class="pi pi-plus"></i></button>
           </div>

           <div class="comanda-items" *ngIf="comandaProdutos.length > 0">
              <div class="c-item" *ngFor="let cp of comandaProdutos; let i = index">
                <div class="c-item-info">
                  <span class="c-name">{{ cp.produto.nome }}</span>
                  <span class="c-price">R$ {{ cp.produto.preco | number:'1.2-2' }} x {{ cp.quantidade }}</span>
                </div>
                <div class="c-item-actions">
                   <button (click)="cp.quantidade = cp.quantidade + 1" [disabled]="cp.quantidade >= cp.produto.estoque"><i class="pi pi-plus"></i></button>
                   <button (click)="diminuirQtd(i)"><i class="pi pi-minus"></i></button>
                </div>
              </div>
           </div>
        </div>

        <div class="chk-section">
           <h4>Informações Opcionais</h4>
           <label class="input-label">Nº Comanda Física</label>
           <input type="text" [(ngModel)]="comandaFisica" class="prod-select" placeholder="Ex: 145" style="margin-bottom: 12px;">
           
           <label class="input-label">E-mail do Cliente (Envio de recibo)</label>
           <input type="email" [(ngModel)]="emailCliente" class="prod-select" placeholder="cliente@email.com" style="margin-bottom: 12px;">

           <label class="input-label">Forma de Pagamento</label>
           <select [(ngModel)]="formaPagamento" class="prod-select">
             <option value="">Ainda não pagou (Pendente)</option>
             <option value="pix">PIX</option>
             <option value="dinheiro">Dinheiro</option>
             <option value="cartao_credito">Cartão de Crédito</option>
             <option value="cartao_debito">Cartão de Débito</option>
           </select>
        </div>

        <div class="chk-total">
           <span>Total a Receber</span>
           <div style="display: flex; flex-direction: column; align-items: flex-end;">
             <strong *ngIf="aplicarFidelidade" style="font-size: 0.9rem; text-decoration: line-through; color: #94a3b8; font-weight: 400; line-height: 1;">
               R$ {{ (servicoPrincipal?.preco || 0) + (comandaProdutos.length > 0 ? getValorTotalCheckout() - (servicoPrincipal?.preco || 0) + getDescontoFidelidade() : 0) | number:'1.2-2' }}
             </strong>
             <strong style="color: var(--primary);">R$ {{ getValorTotalCheckout() | number:'1.2-2' }}</strong>
           </div>
        </div>
      </div>

      <div class="evento-footer-ent" *ngIf="isCheckoutMode">
         <button class="btn-primary success" [disabled]="isFinalizing" (click)="finalizarEGerarComanda()">
            <i class="pi pi-spin pi-spinner" *ngIf="isFinalizing"></i>
            <i class="pi pi-check-circle" *ngIf="!isFinalizing"></i>
            Gerar Comanda Digital
         </button>
         <div class="footer-secondary">
           <button class="btn-ghost" (click)="isCheckoutMode = false">Voltar</button>
         </div>
         
         <div class="comanda-link-box" *ngIf="comandaToken">
            <p>Comanda gerada com sucesso!</p>
            <a [href]="getComandaUrl()" target="_blank" class="comanda-url">Ver Comanda do Cliente</a>
            <button class="btn-primary primary" (click)="concluirEFechar()" style="width: 100%; margin-top: 8px;">Concluir Atendimento</button>
         </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(8px); z-index: 500;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
      animation: fadeIn .2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:none; } }

  .ani-badge {
    color: #a855f7;
    margin-left: 6px;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.1);
    padding: 2px 6px;
    border-radius: 12px;
  }
  
  .fidelidade-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    margin-top: 16px;
  }
  .fid-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 0.95rem;
    color: #0f172a;
  }
  .fid-progress-bg {
    width: 100%;
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }
  .fid-progress-fill {
    height: 100%;
    background: #10b981;
    transition: width 0.3s ease;
  }
  .ag-checkbox {
    display: flex;
    align-items: center;
  }
  
  .evento-modal-box {
      background: var(--glass-bg, rgba(255,255,255,0.95)); 
      backdrop-filter: blur(var(--glass-blur, 20px));
      -webkit-backdrop-filter: blur(var(--glass-blur, 20px));
      border-radius: 28px; width: 100%; max-width: 440px;
      box-shadow: 0 40px 100px rgba(0,0,0,0.25);
      border: 1px solid var(--glass-border);
      animation: slideUp .4s cubic-bezier(.2,.8,.2,1); overflow: hidden;
      transition: max-width 0.3s ease;
    }
    .evento-modal-box.checkout-mode { max-width: 500px; }

    .evento-header {
      display: flex; align-items: center; gap: 16px; padding: 2rem;
      background: #f8fafc; border-bottom: 1px solid rgba(0,0,0,0.03);
      border-left: 6px solid #3b82f6;
    }
    .evento-icon { font-size: 2rem; }
    .evento-info strong { display: block; font-size: 1.15rem; color: #0f172a; font-weight: 800; letter-spacing: -0.5px; }
    .evento-time { font-size: 0.9rem; color: #64748b; font-weight: 600; }

    .evento-body { padding: 2rem; }
    .status-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 2rem; }
    .ss-item { display: flex; flex-direction: column; gap: 6px; }
    .ss-label { font-size: 0.72rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .ss-val { font-size: 0.95rem; font-weight: 600; color: #1e293b; }

    .status-pill-ent { 
      padding: 6px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 800; 
      width: fit-content; text-transform: uppercase;
    }
    .status-pill-ent.confirmado { background: #ecfdf5; color: #059669; }
    .status-pill-ent.em_atendimento { background: #eff6ff; color: #2563eb; }
    .status-pill-ent.noshow { background: #fefce8; color: #a16207; }
    .status-pill-ent.concluido { background: #f1f5f9; color: #475569; }
    .status-pill-ent.cancelado { background: #fef2f2; color: #dc2626; }

    .obs-box { background: #f8fafc; padding: 1.5rem; border-radius: 18px; border: 1px dashed #e2e8f0; }
    .obs-box p { margin: 8px 0 0 0; font-size: 0.9rem; color: #475569; line-height: 1.5; }

    .evento-footer-ent { padding: 0 2rem 2rem 2rem; display: flex; flex-direction: column; gap: 12px; }
    .btn-primary {
      width: 100%; padding: 16px; border-radius: 16px; border: none;
      font-weight: 800; font-size: 1rem; cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .btn-primary.primary { background: #3b82f6; color: white; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3); }
    .btn-primary.warning { background: #fef9c3; color: #854d0e; border: 1.5px solid #fde047; }
    .btn-primary.success { background: #10b981; color: white; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3); }
    .btn-primary:hover { transform: translateY(-2px); opacity: 0.9; }

    .footer-secondary { display: flex; gap: 10px; margin-top: 8px; }
    .btn-ghost {
      flex: 1; padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
      color: #64748b; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
    }
    .btn-ghost.danger { color: #ef4444; border-color: #fecaca; background: #fff1f2; }
    .btn-ghost:hover { background: #f1f5f9; }

    .close-btn { background: none; border: none; cursor: pointer; color: #94a3b8; width: 32px; height: 32px; border-radius: 50%; transition: all .2s; }
    .close-btn:hover { background: #f1f5f9; color: #1e293b; }

    /* Checkout Styles */
    .checkout-body { padding: 1.5rem 2rem; max-height: 60vh; overflow-y: auto; }
    .chk-section { margin-bottom: 24px; }
    .chk-section h4 { margin: 0 0 12px 0; font-size: 0.9rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .input-label { display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .chk-item { display: flex; justify-content: space-between; padding: 12px 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; }
    
    .add-prod-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .prod-select { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-size: 0.95rem; }
    .btn-add-prod { background: #3b82f6; color: white; border: none; border-radius: 8px; width: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
    .btn-add-prod:hover { background: #2563eb; }

    .comanda-items { display: flex; flex-direction: column; gap: 8px; }
    .c-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
    .c-item-info { display: flex; flex-direction: column; }
    .c-name { font-weight: 600; color: #1e293b; font-size: 0.95rem; }
    .c-price { font-size: 0.85rem; color: #64748b; }
    .c-item-actions { display: flex; gap: 4px; }
    .c-item-actions button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; cursor: pointer; color: #64748b; }
    .c-item-actions button:hover:not([disabled]) { background: #e2e8f0; }
    
    .chk-total { display: flex; justify-content: space-between; align-items: center; padding: 20px; background: #ecfdf5; border-radius: 16px; color: #065f46; font-size: 1.1rem; border: 1px dashed #34d399; margin-top: 24px; }
    .chk-total strong { font-size: 1.4rem; font-weight: 800; }

    .comanda-link-box { margin-top: 16px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; text-align: center; }
    .comanda-link-box p { margin: 0 0 12px 0; color: #166534; font-weight: 600; }
    .comanda-url { display: inline-block; padding: 8px 16px; background: #22c55e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-bottom: 12px; width: 100%; box-sizing: border-box; text-align: center; }
  `]
})
export class EventoModalComponent implements OnInit {
  @Input() evento: AgendaEvent | null = null;
  @Output() fechado = new EventEmitter<void>();

  private agendaService = inject(AgendaEventService);
  private prodService = inject(ProdutosService);
  private estService = inject(EstabelecimentoService);
  private profService = inject(ProfissionalService);
  private clienteService = inject(ClienteService);

  confirmDelete = false;

  isCheckoutMode = false;
  isRecoveryMode = false;
  isFinalizing = false;
  isLoadingRecovery = false;

  formaPagamento: string = '';

  isSendingEmail = false;
  
  servicoPrincipal: any;
  produtosCatalogo: Produto[] = [];
  prodSelecionadoId = '';
  comandaProdutos: { produto: Produto, quantidade: number }[] = [];
  comandaToken = '';
  comandaFisica = '';
  emailCliente = '';
  recoveredCaixa: any = null;

  visitasFidelidade = 0;
  visitasMeta = 10;
  descontoPercentual = 0;
  aplicarFidelidade = false;
  isAniversariante = false;

  ngOnInit() {
    this.prodService.produtos$.subscribe(p => this.produtosCatalogo = p.filter(x => x.ativo && x.estoque > 0));
    
    if (this.evento?.cliente_id) {
      const clientes = this.clienteService.getClientes();
      const cli = clientes.find((c: any) => c.id === this.evento!.cliente_id);
      if (cli?.nascimento) {
        const [ano, mes] = cli.nascimento.split('-');
        const currentMes = new Date().getMonth() + 1;
        if (parseInt(mes, 10) === currentMes) {
          this.isAniversariante = true;
        }
      }
    }
  }

  getEmoji(): string {
    return this.evento?.title?.match(/\p{Emoji}/u)?.[0] ?? '📅';
  }

  formatTime(dt?: string): string {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  statusLabel(s?: string): string {
    const map: Record<string, string> = { 
      confirmado: 'Agendado', 
      pendente: 'Pendente', 
      cancelado: 'Cancelado', 
      concluido: 'Concluído',
      em_atendimento: 'Em Atendimento',
      noshow: 'Faltou (No-Show)'
    };
    return map[s || ''] || s || 'Agendado';
  }

  async mudarStatus(novoStatus: 'confirmado' | 'pendente' | 'cancelado' | 'concluido' | 'noshow' | 'em_atendimento') {
    if (!this.evento?.id) return;
    await this.agendaService.updateStatus(this.evento.id, novoStatus);
    this.fechar();
  }

  async confirmarDelete() {
    if (!this.evento?.id) return;
    if (!this.confirmDelete) { this.confirmDelete = true; return; }
    await this.agendaService.removeEvent(this.evento.id);
    this.fechar();
  }

  async concluirEFechar() {
    if (this.evento?.id) {
      await this.agendaService.updateStatus(this.evento.id, 'concluido');
    }
    this.fechar();
  }

  fechar() { this.fechado.emit(); }

  async iniciarCheckout() {
    this.isCheckoutMode = true;
    if (this.evento?.servico_id) {
      const servicos = this.estService.servicos$.value;
      this.servicoPrincipal = servicos.find((s: any) => s.id === this.evento!.servico_id);
    }
    const config = this.estService.estabelecimento$.value?.config_fidelidade;
    if (config?.ativo && this.evento?.cliente_id) {
      this.visitasMeta = config.visitas_meta || 10;
      this.descontoPercentual = config.desconto_percentual || 0;
      this.visitasFidelidade = await this.clienteService.getVisitasFidelidadePendentes(this.evento.cliente_id);
    }
  }

  async iniciarRecuperacao() {
    this.isLoadingRecovery = true;
    try {
      const { data, error } = await this.profService['supabase']
        .from('caixa_itens')
        .select('*')
        .eq('agenda_event_id', this.evento!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (error) throw error;
      
      this.recoveredCaixa = data;
      this.comandaToken = data.token_publico;
      this.emailCliente = data.email_cliente || '';
      this.isRecoveryMode = true;
    } catch (e: any) {
      console.error(e);
      alert('Não foi possível recuperar a comanda. Ela pode ter sido gerada antes da atualização.');
    } finally {
      this.isLoadingRecovery = false;
    }
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
    this.isFinalizing = true;
    try {
      const clienteNome = this.evento?.title?.replace(/ - .*/, '') || 'Cliente';
      const caixaItem = await this.profService.finalizarEEnviarCaixa({
        eventId: this.evento!.id!,
        clienteNome: clienteNome,
        servicoPrincipal: this.servicoPrincipal ? { titulo: this.servicoPrincipal.titulo, preco: this.servicoPrincipal.preco } as any : { titulo: 'Serviço', preco: 0 } as any,
        servicosExtras: [],
        produtos: this.comandaProdutos.map(cp => ({ id: cp.produto.id!, nome: cp.produto.nome, preco: cp.produto.preco, quantidade: cp.quantidade })),
        profissional: this.evento?.profissional_nome || 'Profissional',
        comandaFisica: this.comandaFisica,
        emailCliente: this.emailCliente,
        formaPagamento: this.formaPagamento,
        fidelidadeDesconto: this.getDescontoFidelidade(),
        clienteId: this.evento?.cliente_id,
        profissionalId: this.evento?.profissional_id,
        servicoId: this.evento?.servico_id,
        estabelecimentoId: this.estService.estabelecimento$.value?.id
      });
      this.comandaToken = caixaItem.token_publico || '';

      if (this.emailCliente && this.comandaToken) {
        await this.enviarComandaEmailApi(this.emailCliente, this.comandaToken, caixaItem.valor_total);
      }
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      this.isFinalizing = false;
    }
  }

  async enviarComandaEmailApi(email: string, token: string, valorTotal: number) {
    const estNome = this.estService.estabelecimento$.value?.nome || 'Estabelecimento';
    try {
      const res = await fetch('/api/send-comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, estabelecimento: estNome, valorTotal })
      });
      if (!res.ok) {
        console.error('Falha ao enviar e-mail', await res.text());
      }
    } catch (e) {
      console.error('Erro de rede ao enviar e-mail', e);
    }
  }

  async enviarComandaEmail() {
    if (!this.emailCliente) { alert('Digite um e-mail válido.'); return; }
    this.isSendingEmail = true;
    try {
      await this.enviarComandaEmailApi(this.emailCliente, this.comandaToken, this.recoveredCaixa?.valor_total || 0);
      alert('E-mail enviado com sucesso!');
    } catch (e: any) {
      alert('Erro ao enviar e-mail: ' + e.message);
    } finally {
      this.isSendingEmail = false;
    }
  }

  getComandaUrl(): string {
    return window.location.origin + '/comanda/' + this.comandaToken;
  }

  copiarLink() {
    navigator.clipboard.writeText(this.getComandaUrl());
    alert('Link copiado para a área de transferência!');
  }
}
