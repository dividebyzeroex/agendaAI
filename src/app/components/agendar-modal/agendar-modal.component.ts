import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { EstabelecimentoService, Servico } from '../../services/estabelecimento.service';
import { AgendaEventService } from '../../services/agenda-event.service';
import { ProfissionalService } from '../../services/profissional.service';
import { SecurityService } from '../../services/security.service';

export interface AgendamentoForm {
  clienteId: string | null;
  clienteNome: string;
  clienteTelefone: string;
  servicoId: string;
  profissionalId: string | null;
  observacoes: string;
  status: 'confirmado' | 'pendente';
}

@Component({
  selector: 'app-agendar-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="modal-backdrop" (click)="cancelar()">
    <div class="modal-box glass-animate" (click)="$event.stopPropagation()">
 
      <!-- Header Superior de Luxo -->
      <div class="modal-header">
        <div class="modal-header-info">
          <div class="glass-icon-circle"><i class="pi pi-calendar-plus"></i></div>
          <div class="header-texts">
            <span class="header-subtitle">AgendaAi Management</span>
            <h2 class="header-title">Novo Agendamento</h2>
            <span class="modal-date-tag"><i class="pi pi-clock"></i> {{ startLabel }}</span>
          </div>
        </div>
        <button class="close-luxury" (click)="cancelar()"><i class="pi pi-times"></i></button>
      </div>
 
      <!-- Body Scrollable com Blur -->
      <div class="modal-body custom-scroll">
 
        <!-- Seção: Cliente Inteligente -->
        <div class="elite-section">
          <div class="section-header">
            <label><i class="pi pi-user"></i> Identificação do Cliente</label>
            <span class="badge" *ngIf="isNovoCliente">Novo Cliente</span>
          </div>
          
          <div class="search-container">
            <div class="premium-search-box">
              <i class="pi pi-search search-icon"></i>
              <input
                type="text"
                [(ngModel)]="clienteQuery"
                (ngModelChange)="filterClientes()"
                (focus)="showDropdown = true"
                placeholder="Nome ou Telefone do cliente..."
                class="elite-search-input"
                autocomplete="off" />
              <button *ngIf="clienteQuery" class="clear-icon" (click)="clearCliente()">
                <i class="pi pi-times"></i>
              </button>
            </div>
 
            <!-- Dropdown Reativo de Clientes -->
            <div class="glass-dropdown" *ngIf="showDropdown && (clientesFiltrados.length > 0 || clienteQuery)">
              <div class="dropdown-scroll custom-scroll">
                <div class="client-row"
                  *ngFor="let c of clientesFiltrados"
                  (mousedown)="selectCliente(c)">
                  <div class="mini-avatar">{{ c.nome.charAt(0) }}</div>
                  <div class="c-info">
                    <span class="c-name">{{ c.nome }}</span>
                    <span class="c-sub">{{ c.telefone || 'Sem telefone' }}</span>
                  </div>
                </div>
                
                <div class="client-row create-row" *ngIf="clienteQuery.length > 1" (mousedown)="usarNovoCliente()">
                  <div class="mini-avatar plus"><i class="pi pi-plus"></i></div>
                  <div class="c-info">
                    <span class="c-name">Criar novo: "{{ clienteQuery }}"</span>
                    <span class="c-sub">O cadastro será feito ao confirmar</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
 
          <!-- Campo Telefone Expansível Premium -->
          <div class="expand-phone" *ngIf="isNovoCliente">
            <div class="premium-search-box">
              <i class="pi pi-phone search-icon"></i>
              <input type="tel" [(ngModel)]="form.clienteTelefone"
                placeholder="Digite o telefone para o novo cadastro..." class="elite-search-input" />
            </div>
          </div>
 
          <!-- Badge Cliente Selecionado -->
          <div class="active-client-chip" *ngIf="form.clienteId && !isNovoCliente">
            <i class="pi pi-verified"></i>
            <span>{{ form.clienteNome }}</span>
            <button class="remove-chip" (click)="clearCliente()"><i class="pi pi-times"></i></button>
          </div>
        </div>
 
        <div class="h-divider"></div>
 
        <!-- Seção: Seleção de Serviço -->
        <div class="elite-section">
          <label><i class="pi pi-briefcase"></i> Escolha o Serviço</label>
          <div class="service-horizontal custom-scroll-h">
            <div
              *ngFor="let s of servicos"
              class="service-card"
              [class.active]="form.servicoId === s.id"
              (click)="form.servicoId = s.id!">
              <div class="s-icon-bg">{{ s.emoji || '✂️' }}</div>
              <div class="s-details">
                <span class="s-name">{{ s.titulo }}</span>
                <div class="s-meta">
                  <span class="s-price">R$ {{ s.preco }}</span>
                  <span class="s-dot">•</span>
                  <span class="s-time">{{ s.duracao_min }}m</span>
                </div>
              </div>
              <div class="check-mark" *ngIf="form.servicoId === s.id">
                <i class="pi pi-check"></i>
              </div>
            </div>
            
            <div class="empty-state-mini" *ngIf="servicos.length === 0">
              <i class="pi pi-spin pi-spinner"></i> Sincronizando catálogo...
            </div>
          </div>
        </div>
 
        <div class="h-divider"></div>
 
        <!-- Seção: Profissional -->
        <div class="elite-section">
          <label><i class="pi pi-id-card"></i> Colaborador Designado</label>
          <div class="professional-grid custom-scroll-h">
            <div
                *ngFor="let p of profissionais"
                class="prof-card-glass"
                [class.active]="form.profissionalId === p.id"
                (click)="form.profissionalId = p.id">
              <div class="p-avatar-wrap">
                <img *ngIf="p.foto_url" [src]="p.foto_url">
                <div class="p-initials" *ngIf="!p.foto_url" [style.background]="p.cor_agenda || '#1a73e8'">
                  {{ p.nome.charAt(0) }}
                </div>
                <div class="online-indicator" *ngIf="p.is_online"></div>
              </div>
              <span class="p-name">{{ p.nome }}</span>
              <div class="p-active-border" *ngIf="form.profissionalId === p.id"></div>
            </div>
          </div>
        </div>
 
        <div class="h-divider"></div>
 
        <!-- Seção: Status e Notas -->
        <div class="dual-section">
          <div class="section-part">
            <label>Prioridade/Status</label>
            <div class="status-toggle">
              <button class="t-btn conf" [class.active]="form.status === 'confirmado'" (click)="form.status = 'confirmado'">
                <i class="pi pi-check"></i>
              </button>
              <button class="t-btn pend" [class.active]="form.status === 'pendente'" (click)="form.status = 'pendente'">
                <i class="pi pi-clock"></i>
              </button>
              <span class="status-label">{{ form.status === 'confirmado' ? 'Confirmado' : 'Pendente' }}</span>
            </div>
          </div>
          <div class="section-part">
            <label>Observações Privadas</label>
            <textarea [(ngModel)]="form.observacoes" placeholder="Notas sobre o agendamento..."></textarea>
          </div>
        </div>
 
        <div class="error-toast" *ngIf="erro">
          <i class="pi pi-exclamation-triangle"></i> {{ erro }}
        </div>
      </div>
 
      <!-- Footer de Ações -->
      <div class="modal-footer-glass">
        <button class="glass-btn-secondary" (click)="cancelar()">Cancelar Operação</button>
        <button class="glass-btn-primary" [disabled]="saving || !isFormValido()" (click)="confirmar()">
          <span *ngIf="!saving">Confirmar Agendamento</span>
          <span *ngIf="saving"><i class="pi pi-spin pi-spinner"></i> Processando...</span>
        </button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      backdrop-filter: blur(10px); z-index: 3500;
      display: flex; align-items: center; justify-content: center; padding: 1.5rem;
    }
 
    .modal-box {
      background: var(--glass-bg); border-radius: 28px; width: 100%; max-width: 580px;
      box-shadow: 0 30px 60px rgba(0,0,0,0.4), var(--elite-shadow);
      display: flex; flex-direction: column; max-height: 92vh; overflow: hidden;
      border: 1px solid var(--glass-border); position: relative;
    }
 
    .glass-animate { animation: slideInUp .4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes slideInUp { from { opacity: 0; transform: translateY(30px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
 
    /* Header Superior */
    .modal-header {
      padding: 1.75rem 2rem; border-bottom: 1px solid var(--glass-border);
      background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: flex-start;
    }
    .modal-header-info { display: flex; gap: 16px; }
    .glass-icon-circle {
      width: 50px; height: 50px; border-radius: 16px; background: var(--primary-color);
      display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: white;
      box-shadow: 0 8px 16px rgba(37,99,235,0.3);
    }
    .header-texts { display: flex; flex-direction: column; gap: 2px; }
    .header-subtitle { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 700; }
    .header-title { font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin: 0; }
    .modal-date-tag { font-size: 0.8rem; color: var(--primary-color); font-weight: 600; display: flex; align-items: center; gap: 6px; margin-top: 4px; }
    
    .close-luxury { background: var(--active-bg); border: 1px solid var(--glass-border); color: var(--text-muted); width: 34px; height: 34px; border-radius: 10px; cursor: pointer; transition: all .3s; }
    .close-luxury:hover { background: rgba(255,100,100,0.1); color: #ff5555; border-color: rgba(255,100,100,0.2); }
 
    /* Body */
    .modal-body { padding: 2rem; overflow-y: auto; display: flex; flex-direction: column; gap: 2rem; }
    .custom-scroll::-webkit-scrollbar { width: 4px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
    .custom-scroll-h::-webkit-scrollbar { height: 4px; }
    .custom-scroll-h::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
 
    .elite-section { display: flex; flex-direction: column; gap: 12px; }
    label { font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
    label i { font-size: 0.9rem; color: var(--primary-color); }
    .h-divider { height: 1px; background: var(--glass-border); width: 100%; opacity: 0.5; }
 
    /* Busca de Clientes */
    .search-container { position: relative; }
    .premium-search-box {
      background: var(--active-bg); border: 2px solid var(--glass-border); border-radius: 14px;
      padding: 2px 6px; display: flex; align-items: center; gap: 10px; transition: all .3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .premium-search-box:focus-within { border-color: var(--primary-color); box-shadow: 0 0 0 4px rgba(37,99,235,0.1); background: var(--glass-bg); }
    .search-icon { color: var(--text-muted); margin-left: 10px; }
    .elite-search-input {
      border: none; background: transparent; padding: 12px 2px; color: var(--text-main);
      font-size: 0.95rem; font-weight: 500; width: 100%; outline: none;
    }
    .clear-icon { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 10px; font-size: 0.8rem; }
 
    .glass-dropdown {
      position: absolute; top: calc(100% + 12px); left: 0; right: 0; z-index: 1000;
      background: rgba(17, 17, 17, 0.9); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 18px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden;
    }
    .dropdown-scroll { max-height: 250px; overflow-y: auto; padding: 8px; }
    .active-client-chip {
      display: inline-flex; align-items: center; gap: 10px;
      background: rgba(37, 99, 235, 0.1); color: var(--primary-color);
      border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 14px;
      padding: 10px 16px; font-weight: 700; font-size: 0.95rem;
      margin-top: 12px; backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
      animation: fadeIn .3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    
    .remove-chip {
      background: rgba(255, 255, 255, 0.1); border: none; cursor: pointer;
      color: var(--primary-color); width: 22px; height: 22px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s; font-size: 0.7rem;
    }
    .remove-chip:hover { background: #ef4444; color: white; }
    .client-row {
      display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; cursor: pointer;
      transition: background .2s; margin-bottom: 4px;
    }
    .client-row:hover { background: rgba(255,255,255,0.05); }
    .mini-avatar {
      width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem;
    }
    .mini-avatar.plus { background: rgba(37,99,235,0.1); color: var(--primary-color); border: 1px dashed var(--primary-color); }
    .c-info { display: flex; flex-direction: column; }
    .c-name { font-weight: 700; color: #ffffff; font-size: 0.92rem; }
    .c-sub { font-size: 0.78rem; color: rgba(255,255,255,0.6); font-family: 'Space Mono', monospace; }
 
    /* Serviços e Profissionais */
    .service-horizontal { display: flex; gap: 12px; padding-bottom: 12px; overflow-x: auto; scroll-snap-type: x mandatory; }
    .service-card {
      min-width: 170px; padding: 16px; border-radius: 18px; background: rgba(255,255,255,0.02);
      border: 1.5px solid var(--glass-border); cursor: pointer; position: relative;
      transition: all .3s; display: flex; align-items: center; gap: 12px;
      scroll-snap-align: start;
    }
    .service-card:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-3px); }
    .service-card.active { border-color: var(--primary-color); background: rgba(37,99,235,0.08); }
    .s-icon-bg { font-size: 1.4rem; }
    .s-details { display: flex; flex-direction: column; }
    .s-name { font-weight: 700; font-size: 0.9rem; color: var(--text-main); }
    .s-meta { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; font-weight: 600; }
    .s-price { color: #34a853; }
    .check-mark { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
 
    .professional-grid { display: flex; gap: 12px; padding-bottom: 12px; overflow-x: auto; scroll-snap-type: x mandatory; }
    .prof-card-glass {
      min-width: 130px;
      padding: 14px; border-radius: 18px; border: 1.5px solid var(--glass-border);
      background: rgba(255,255,255,0.02); cursor: pointer; text-align: center;
      transition: all .3s; position: relative; overflow: hidden;
      scroll-snap-align: start;
    }
    .prof-card-glass.active { background: rgba(255,255,255,0.05); }
    .p-avatar-wrap { width: 44px; height: 44px; margin: 0 auto 10px; border-radius: 12px; overflow: hidden; position: relative; }
    .p-avatar-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .p-initials { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 1rem; }
    .p-name { font-size: 0.85rem; font-weight: 700; color: var(--text-main); }
    .p-active-border { position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: var(--primary-color); box-shadow: 0 -4px 10px var(--primary-color); }
 
    /* Ações Finais */
    .dual-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    textarea {
      width: 100%; background: var(--active-bg); border: 2px solid var(--glass-border); border-radius: 14px;
      padding: 12px; color: var(--text-main); outline: none; font-size: 0.9rem; transition: border .2s;
      resize: none; min-height: 70px;
    }
    textarea:focus { border-color: var(--primary-color); background: var(--glass-bg); }
 
    .status-toggle {
      display: flex; align-items: center; gap: 12px; background: var(--active-bg);
      padding: 6px; border-radius: 14px; border: 1px solid var(--glass-border);
    }
    .t-btn { width: 36px; height: 36px; border-radius: 10px; border: none; cursor: pointer; transition: all .2s; color: var(--text-muted); display: flex; align-items: center; justify-content: center; }
    .t-btn.conf.active { background: #34a853; color: white; box-shadow: 0 4px 12px rgba(52, 168, 83, 0.3); }
    .t-btn.pend.active { background: #f9ab00; color: white; box-shadow: 0 4px 12px rgba(249, 171, 0, 0.3); }
    .status-label { font-size: 0.85rem; font-weight: 700; color: var(--text-main); }
 
    .modal-footer-glass {
      padding: 1.5rem 2rem; border-top: 1px solid var(--glass-border);
      background: rgba(255,255,255,0.01); display: flex; justify-content: flex-end; gap: 12px;
    }
    .glass-btn-secondary { background: none; border: 1px solid var(--glass-border); color: var(--text-muted); padding: 12px 20px; border-radius: 14px; cursor: pointer; font-weight: 600; }
    .glass-btn-primary {
      background: var(--primary-color); color: white; border: none; padding: 12px 28px;
      border-radius: 14px; font-weight: 800; cursor: pointer; transition: all .3s;
    }
    .glass-btn-primary:not(:disabled):hover { transform: scale(1.02); box-shadow: 0 10px 20px rgba(37,99,235,0.3); }
    .glass-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class AgendarModalComponent implements OnInit {
  @Input() startStr = '';
  @Input() endStr = '';
  @Input() allDay = false;
  @Output() confirmado = new EventEmitter<void>();
  @Output() cancelado  = new EventEmitter<void>();

  private clienteService  = inject(ClienteService);
  private estabelecimento = inject(EstabelecimentoService);
  private agendaService   = inject(AgendaEventService);
  private proService      = inject(ProfissionalService);
  private security        = inject(SecurityService);

  form: AgendamentoForm = {
    clienteId: null,
    clienteNome: '',
    clienteTelefone: '',
    servicoId: '',
    profissionalId: null,
    observacoes: '',
    status: 'confirmado'
  };

  clienteQuery   = '';
  clientesFiltrados: Cliente[] = [];
  showDropdown   = false;
  isNovoCliente  = false;
  
  servicos: Servico[] = [];
  profissionais: any[] = [];
  
  saving = false;
  erro   = '';

  get startLabel(): string {
    if (!this.startStr) return '';
    const d = new Date(this.startStr);
    return d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async ngOnInit() {
    // Forçar atualização do catálogo de serviços
    await this.estabelecimento.fetchServicos();
    this.estabelecimento.servicos$.subscribe(s => {
      this.servicos = s;
      console.log('[AgendarModal] Servicos sincronizados:', s.length);
    });

    const estId = this.estabelecimento.estabelecimento$.value?.id;
    const rawPros = await this.proService.fetchProfissionais(estId || undefined);
    
    // Filtro de Unicidade (Distinct por ID) para erradicar duplicatas
    const uniquePros = Array.from(new Map(rawPros.map(p => [p.id, p])).values());
    
    this.profissionais = await Promise.all(uniquePros.map(async p => ({
      ...p,
      nome: await this.security.decryptData(p.nome) || p.nome
    })));

    document.addEventListener('click', this._closeDropdown);
  }

  ngOnDestroy() {
    document.removeEventListener('click', this._closeDropdown);
  }

  private _closeDropdown = () => this.showDropdown = false;

  filterClientes() {
    const q = this.clienteQuery.toLowerCase();
    const todos = this.clienteService.getClientes();
    this.clientesFiltrados = q.length > 0
      ? todos.filter(c => c.nome.toLowerCase().includes(q) || c.telefone?.includes(q)).slice(0, 6)
      : todos.slice(0, 6);
    this.showDropdown = true;
    this.isNovoCliente = false;
    this.form.clienteId = null;
    this.form.clienteNome = this.clienteQuery;
  }

  selectCliente(c: Cliente) {
    this.form.clienteId   = c.id!;
    this.form.clienteNome = c.nome;
    this.clienteQuery     = ''; // Limpa para evitar duplicação visual
    this.showDropdown     = false;
    this.isNovoCliente    = false;
  }

  usarNovoCliente() {
    this.form.clienteId   = null;
    this.form.clienteNome = this.clienteQuery;
    this.clienteQuery     = ''; // Limpa mantendo o nome no chip/form
    this.isNovoCliente    = true;
    this.showDropdown     = false;
  }
 
  clearCliente() {
    this.form.clienteId   = null;
    this.form.clienteNome = '';
    this.clienteQuery     = '';
    this.isNovoCliente    = false;
  }

  isFormValido(): boolean {
    return this.form.clienteNome.trim().length > 0 && 
           this.form.servicoId.length > 0 && 
           this.form.profissionalId !== null;
  }

  async confirmar() {
    if (!this.isFormValido()) return;
    this.saving = true;
    this.erro   = '';

    try {
      let clienteId = this.form.clienteId;

      if (!clienteId && this.form.clienteNome.trim()) {
        const novoCliente = await this.clienteService.addCliente({
          nome: this.form.clienteNome.trim(),
          telefone: this.form.clienteTelefone || undefined,
          ultima_visita: new Date().toISOString().split('T')[0],
        });
        clienteId = novoCliente.id!;
      }

      const servico = this.servicos.find(s => s.id === this.form.servicoId);
      const prof    = this.profissionais.find(p => p.id === this.form.profissionalId);
      const title   = `${servico?.emoji || '✂️'} ${this.form.clienteNome} — ${servico?.titulo || ''}`;

      await this.agendaService.addEvent({
        title,
        start: this.startStr,
        end:   this.endStr,
        allDay: this.allDay,
        cliente_id: clienteId || undefined,
        servico_id: this.form.servicoId,
        profissional_id: this.form.profissionalId || undefined,
        profissional_nome: prof?.nome,
        status:     this.form.status,
        status_confirmacao: 'pendente',
        observacoes: this.form.observacoes || undefined,
        backgroundColor: prof?.cor_agenda || '#1a73e8',
      });

      this.confirmado.emit();
    } catch (e: any) {
      this.erro = e.message || 'Erro ao salvar agendamento.';
    } finally {
      this.saving = false;
    }
  }

  cancelar() { this.cancelado.emit(); }
}
