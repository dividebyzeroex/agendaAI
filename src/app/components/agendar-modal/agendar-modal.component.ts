import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { EstabelecimentoService, Servico } from '../../services/estabelecimento.service';
import { AgendaEventService } from '../../services/agenda-event.service';

export interface AgendamentoForm {
  clienteId: string | null;
  clienteNome: string;
  clienteTelefone: string;
  servicoId: string;
  observacoes: string;
  status: 'confirmado' | 'pendente';
}

@Component({
  selector: 'app-agendar-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="modal-backdrop" (click)="cancelar()">
    <div class="modal-box" (click)="$event.stopPropagation()">

      <!-- Header -->
      <div class="modal-header">
        <div class="modal-header-info">
          <div class="modal-icon">📅</div>
          <div>
            <strong>Novo Agendamento</strong>
            <span class="modal-date">{{ startLabel }}</span>
          </div>
        </div>
        <button class="close-btn" (click)="cancelar()"><i class="pi pi-times"></i></button>
      </div>

      <!-- Body -->
      <div class="modal-body">

        <!-- Cliente -->
        <div class="field-group">
          <label>Cliente <span class="req">*</span></label>
          <div class="client-search-wrap">
            <div class="search-input-wrap">
              <i class="pi pi-search"></i>
              <input
                type="text"
                [(ngModel)]="clienteQuery"
                (ngModelChange)="filterClientes()"
                (focus)="showDropdown = true"
                placeholder="Buscar ou digitar nome..."
                class="field-input"
                autocomplete="off" />
              <button *ngIf="clienteQuery" class="clear-btn" (click)="clearCliente()">
                <i class="pi pi-times"></i>
              </button>
            </div>

            <!-- Dropdown de clientes -->
            <div class="client-dropdown" *ngIf="showDropdown && clientesFiltrados.length > 0">
              <div class="client-option"
                *ngFor="let c of clientesFiltrados"
                (mousedown)="selectCliente(c)">
                <div class="client-avatar-sm">{{ c.nome.charAt(0) }}</div>
                <div>
                  <span class="c-nome">{{ c.nome }}</span>
                  <span class="c-tel">{{ c.telefone }}</span>
                </div>
              </div>
              <div class="client-option new-client" (mousedown)="usarNovoCliente()">
                <i class="pi pi-plus"></i>
                <span>Criar cliente "{{ clienteQuery }}"</span>
              </div>
            </div>

            <!-- Dropdown vazio + criar -->
            <div class="client-dropdown" *ngIf="showDropdown && clientesFiltrados.length === 0 && clienteQuery.length > 1">
              <div class="client-option new-client" (mousedown)="usarNovoCliente()">
                <i class="pi pi-user-plus"></i>
                <span>Criar novo cliente "{{ clienteQuery }}"</span>
              </div>
            </div>
          </div>

          <!-- Telefone (para cliente novo) -->
          <div class="inline-phone" *ngIf="isNovoCliente && clienteQuery">
            <i class="pi pi-phone"></i>
            <input type="tel" [(ngModel)]="form.clienteTelefone"
              placeholder="Telefone (opcional)" class="field-input" />
          </div>

          <!-- Tag cliente selecionado -->
          <div class="selected-tag" *ngIf="form.clienteId && !isNovoCliente">
            <div class="client-avatar-sm">{{ form.clienteNome.charAt(0) }}</div>
            {{ form.clienteNome }}
            <button (click)="clearCliente()"><i class="pi pi-times"></i></button>
          </div>
        </div>

        <!-- Serviço -->
        <div class="field-group">
          <label>Serviço <span class="req">*</span></label>
          <div class="servico-grid">
            <button
              *ngFor="let s of servicos"
              class="servico-chip"
              [class.active]="form.servicoId === s.id"
              (click)="form.servicoId = s.id!; form.clienteNome = form.clienteNome || ''">
              <span class="s-emoji">{{ s.emoji || '✂️' }}</span>
              <span class="s-titulo">{{ s.titulo }}</span>
              <span class="s-preco">R$ {{ s.preco }}</span>
              <span class="s-dur">{{ s.duracao_min }}min</span>
            </button>
          </div>
        </div>

        <!-- Status -->
        <div class="field-group">
          <label>Status</label>
          <div class="status-wrap">
            <button class="status-btn" [class.active]="form.status === 'confirmado'"
              (click)="form.status = 'confirmado'">
              <i class="pi pi-check-circle"></i> Confirmado
            </button>
            <button class="status-btn pending" [class.active]="form.status === 'pendente'"
              (click)="form.status = 'pendente'">
              <i class="pi pi-clock"></i> Pendente
            </button>
          </div>
        </div>

        <!-- Observações -->
        <div class="field-group">
          <label>Observações</label>
          <textarea [(ngModel)]="form.observacoes" rows="2"
            placeholder="Preferências, alergias, informações especiais..."
            class="field-textarea"></textarea>
        </div>

        <!-- Erro -->
        <div class="error-box" *ngIf="erro">{{ erro }}</div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-cancel" (click)="cancelar()">Cancelar</button>
        <button class="btn-confirm" [disabled]="saving || !isFormValido()" (click)="confirmar()">
          <i class="pi" [class.pi-check]="!saving" [class.pi-spin]="saving" [class.pi-spinner]="saving"></i>
          {{ saving ? 'Salvando...' : 'Confirmar Agendamento' }}
        </button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      backdrop-filter: blur(4px); z-index: 300;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
      animation: fadeIn .2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:none; } }

    .modal-box {
      background: white; border-radius: 20px; width: 100%; max-width: 520px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.22);
      display: flex; flex-direction: column;
      animation: slideUp .3s cubic-bezier(0.2,0.8,0.2,1);
      max-height: 90vh; overflow: hidden;
    }

    /* Header */
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.5rem; border-bottom: 1px solid rgba(0,0,0,0.07);
      background: #fafafa; flex-shrink: 0;
    }
    .modal-header-info { display: flex; align-items: center; gap: 12px; }
    .modal-icon { font-size: 1.8rem; }
    .modal-header-info strong { display: block; font-size: 1rem; color: #202124; font-weight: 700; }
    .modal-date { font-size: 0.82rem; color: #9aa0a6; font-family: 'Space Mono', monospace; }
    .close-btn {
      background: none; border: none; cursor: pointer; color: #9aa0a6;
      width: 32px; height: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center; transition: all .2s;
    }
    .close-btn:hover { background: #f1f3f4; color: #202124; }

    /* Body */
    .modal-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.25rem; }

    /* Fields */
    .field-group { display: flex; flex-direction: column; gap: 8px; }
    label { font-size: 0.8rem; font-weight: 700; color: #5f6368; text-transform: uppercase; letter-spacing: .4px; }
    .req { color: #ea4335; }
    .field-input {
      width: 100%; padding: 10px 12px; border: 1.5px solid #e8eaed; border-radius: 10px;
      font-family: inherit; font-size: .92rem; outline: none; transition: border .2s;
      color: #202124; background: #fafafa; box-sizing: border-box;
    }
    .field-input:focus { border-color: #1a73e8; background: white; }
    .field-textarea {
      width: 100%; padding: 10px 12px; border: 1.5px solid #e8eaed; border-radius: 10px;
      font-family: inherit; font-size: .9rem; resize: vertical; outline: none;
      transition: border .2s; box-sizing: border-box; color: #202124;
    }
    .field-textarea:focus { border-color: #1a73e8; }

    /* Client search */
    .client-search-wrap { position: relative; }
    .search-input-wrap { position: relative; display: flex; align-items: center; }
    .search-input-wrap .pi-search { position: absolute; left: 12px; color: #9aa0a6; font-size: .85rem; }
    .search-input-wrap .field-input { padding-left: 34px; padding-right: 32px; }
    .clear-btn { position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #9aa0a6; padding: 4px; border-radius: 6px; }
    .clear-btn:hover { color: #202124; }

    .client-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
      background: white; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12); overflow: hidden;
    }
    .client-option {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      cursor: pointer; transition: background .15s; font-size: .9rem;
    }
    .client-option:hover { background: #f8f9fa; }
    .client-option.new-client { color: #1a73e8; font-weight: 600; border-top: 1px solid rgba(0,0,0,0.06); }
    .client-option.new-client .pi { font-size: .85rem; }

    .client-avatar-sm {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #1a73e8, #a142f4);
      color: white; display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .8rem;
    }
    .c-nome { display: block; font-weight: 600; font-size: .88rem; color: #202124; }
    .c-tel  { display: block; font-size: .78rem; color: #9aa0a6; }

    .selected-tag {
      display: inline-flex; align-items: center; gap: 8px;
      background: #e8f0fe; color: #1a73e8; border-radius: 8px;
      padding: 6px 10px; font-weight: 600; font-size: .88rem;
    }
    .selected-tag button { background: none; border: none; cursor: pointer; color: #1a73e8; padding: 0; line-height: 1; }

    .inline-phone { display: flex; align-items: center; gap: 8px; }
    .inline-phone .pi { color: #9aa0a6; font-size: .85rem; }

    /* Serviços grid */
    .servico-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
    .servico-chip {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      padding: 10px 12px; border: 1.5px solid #e8eaed; border-radius: 10px;
      background: white; cursor: pointer; transition: all .2s; text-align: left;
    }
    .servico-chip:hover { border-color: #1a73e8; background: #f8f9ff; }
    .servico-chip.active { border-color: #1a73e8; background: #e8f0fe; }
    .s-emoji { font-size: 1.2rem; }
    .s-titulo { font-size: .85rem; font-weight: 600; color: #202124; }
    .s-preco { font-size: .8rem; color: #34a853; font-weight: 600; }
    .s-dur   { font-size: .75rem; color: #9aa0a6; }

    /* Status */
    .status-wrap { display: flex; gap: 8px; }
    .status-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px; border: 1.5px solid #e8eaed; border-radius: 10px;
      background: white; cursor: pointer; font-family: inherit; font-size: .88rem;
      font-weight: 600; transition: all .2s; color: #5f6368;
    }
    .status-btn.active { border-color: #34a853; background: #e6f4ea; color: #34a853; }
    .status-btn.pending.active { border-color: #f9ab00; background: #fef9e7; color: #b06000; }
    .status-btn:hover { background: #f8f9fa; }

    /* Error */
    .error-box { padding: 10px 14px; border-radius: 8px; background: #fce8e8; color: #ea4335; font-size: .88rem; font-weight: 500; }

    /* Footer */
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 1rem 1.5rem; border-top: 1px solid rgba(0,0,0,0.07); flex-shrink: 0;
    }
    .btn-cancel {
      background: none; border: 1px solid #e8eaed; color: #5f6368;
      padding: 10px 18px; border-radius: 10px; font-family: inherit; font-size: .9rem;
      cursor: pointer; transition: all .2s;
    }
    .btn-cancel:hover { background: #f1f3f4; }
    .btn-confirm {
      display: flex; align-items: center; gap: 7px;
      background: #202124; color: white; border: none;
      padding: 10px 22px; border-radius: 10px; font-family: inherit;
      font-weight: 700; font-size: .9rem; cursor: pointer; transition: all .3s;
    }
    .btn-confirm:hover:not(:disabled) { background: #1a73e8; box-shadow: 0 6px 20px rgba(26,115,232,.3); }
    .btn-confirm:disabled { opacity: .5; cursor: not-allowed; }
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

  // Data exibida no header
  get startLabel(): string {
    if (!this.startStr) return '';
    const d = new Date(this.startStr);
    return d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Estado
  form: AgendamentoForm = { clienteId: null, clienteNome: '', clienteTelefone: '', servicoId: '', observacoes: '', status: 'confirmado' };
  clienteQuery   = '';
  clientesFiltrados: Cliente[] = [];
  showDropdown   = false;
  isNovoCliente  = false;
  servicos: Servico[] = [];
  saving = false;
  erro   = '';

  ngOnInit() {
    this.estabelecimento.servicos$.subscribe(s => this.servicos = s);
    // Fecha dropdown ao clicar fora
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
    this.clienteQuery     = c.nome;
    this.showDropdown     = false;
    this.isNovoCliente    = false;
  }

  usarNovoCliente() {
    this.form.clienteId   = null;
    this.form.clienteNome = this.clienteQuery;
    this.isNovoCliente    = true;
    this.showDropdown     = false;
  }

  clearCliente() {
    this.form.clienteId   = null;
    this.form.clienteNome = '';
    this.clienteQuery     = '';
    this.isNovoCliente    = false;
    this.clientesFiltrados = [];
  }

  isFormValido(): boolean {
    return this.form.clienteNome.trim().length > 0 && this.form.servicoId.length > 0;
  }

  async confirmar() {
    if (!this.isFormValido()) return;
    this.saving = true;
    this.erro   = '';

    try {
      let clienteId = this.form.clienteId;

      // Cria cliente novo se necessário
      if (!clienteId && this.form.clienteNome.trim()) {
        const novoCliente = await this.clienteService.addCliente({
          nome: this.form.clienteNome.trim(),
          telefone: this.form.clienteTelefone || undefined,
          ultima_visita: new Date().toISOString().split('T')[0],
        });
        clienteId = novoCliente.id!;
      }

      const servico = this.servicos.find(s => s.id === this.form.servicoId);
      const title   = `${servico?.emoji || '✂️'} ${this.form.clienteNome} — ${servico?.titulo || ''}`;

      await this.agendaService.addEvent({
        title,
        start: this.startStr,
        end:   this.endStr,
        allDay: this.allDay,
        cliente_id: clienteId || undefined,
        servico_id: this.form.servicoId,
        status:     this.form.status,
        observacoes: this.form.observacoes || undefined,
        backgroundColor: this.form.status === 'confirmado' ? '#1a73e8' : '#f9ab00',
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
