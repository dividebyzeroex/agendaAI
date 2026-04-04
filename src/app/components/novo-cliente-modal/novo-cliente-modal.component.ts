import { Component, Output, EventEmitter, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, Cliente } from '../../services/cliente.service';

@Component({
  selector: 'app-novo-cliente-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="modal-backdrop" (click)="cancelar()">
    <div class="modal-box" (click)="$event.stopPropagation()">
 
      <!-- Header -->
      <div class="nc-header">
        <div class="nc-header-left">
          <div class="nc-avatar-ring">
             <div class="nc-avatar">{{ form.nome ? form.nome.charAt(0).toUpperCase() : '👤' }}</div>
          </div>
          <div>
            <strong>{{ isEdit ? 'Editar Cadastro' : 'Novo Cliente' }}</strong>
            <span>{{ isEdit ? 'Atualização de Informações' : 'Cadastro Inteligente' }}</span>
          </div>
        </div>
        <button class="close-btn" (click)="cancelar()"><i class="pi pi-times"></i></button>
      </div>
 
      <!-- Body -->
      <div class="nc-body custom-scroll">
        <div class="nc-section-title">Dados Pessoais</div>
        
        <div class="fields-grid">
          <!-- Nome -->
          <div class="field-group full">
            <label>Nome Completo <span class="req">*</span></label>
            <div class="input-wrap">
               <i class="pi pi-user"></i>
               <input type="text" [(ngModel)]="form.nome" placeholder="Ex: João Silva"
                 class="field-input" autofocus />
            </div>
          </div>
  
          <!-- Telefone -->
          <div class="field-group">
            <label>WhatsApp</label>
            <div class="input-wrap">
              <i class="pi pi-whatsapp"></i>
              <input type="tel" [(ngModel)]="form.telefone"
                placeholder="(11) 99999-8888" class="field-input" />
            </div>
          </div>

          <!-- Nascimento -->
          <div class="field-group">
            <label>Nascimento</label>
            <div class="input-wrap">
              <i class="pi pi-calendar"></i>
              <input type="date" [(ngModel)]="form.nascimento" class="field-input" />
            </div>
          </div>
        </div>

        <div class="field-group">
          <label>E-mail</label>
          <div class="input-wrap">
            <i class="pi pi-envelope"></i>
            <input type="email" [(ngModel)]="form.email"
              placeholder="cliente@email.com" class="field-input" />
          </div>
        </div>

        <div class="nc-separator"></div>
        <div class="nc-section-title">Informações Adicionais</div>

        <div class="field-group">
          <label>Observações / Notas</label>
          <textarea [(ngModel)]="form.observacoes" 
            placeholder="Ex: Alérgico a produtos X, prefere atendimento em local silencioso..."
            class="field-area" rows="4"></textarea>
        </div>
 
        <!-- Info box -->
        <div class="info-box-premium" *ngIf="!isEdit">
          <i class="pi pi-sparkles"></i>
          <span>O histórico será vinculado ao telefone e você poderá ver estatísticas no Analytics.</span>
        </div>
 
        <!-- Erro -->
        <div class="error-box" *ngIf="erro">{{ erro }}</div>
      </div>
 
      <!-- Footer -->
      <div class="nc-footer">
        <button class="btn-cancel-glass" (click)="cancelar()">Cancelar</button>
        <button class="btn-save-premium" [disabled]="saving || !form.nome.trim()" (click)="confirmar()">
          <i class="pi" [class.pi-user-plus]="!saving && !isEdit" [class.pi-check]="!saving && isEdit" [class.pi-spin]="saving" [class.pi-spinner]="saving"></i>
          {{ saving ? (isEdit ? 'Salvando...' : 'Cadastrando...') : (isEdit ? 'Salvar Alterações' : 'Criar Cliente') }}
        </button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(12px); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 1.5rem;
    }
 
    .modal-box {
      background: rgba(255, 255, 255, 0.95); border-radius: 24px; width: 100%; max-width: 520px;
      box-shadow: 0 50px 100px -20px rgba(0,0,0,0.25);
      overflow: hidden; border: 1px solid rgba(255,255,255,0.4);
      display: flex; flex-direction: column; max-height: 90vh;
    }
 
    /* Header */
    .nc-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.5rem 2rem; border-bottom: 1px solid rgba(0,0,0,0.05); background: #ffffff;
    }
    .nc-header-left { display: flex; align-items: center; gap: 16px; }
    .nc-avatar-ring { 
      padding: 3px; border: 2px solid #1a73e8; border-radius: 50%;
    }
    .nc-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #1a73e8, #a142f4);
      color: white; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 1.2rem;
    }
    .nc-header-left strong { display: block; font-size: 1.1rem; color: #1e293b; font-weight: 800; letter-spacing: -0.3px; }
    .nc-header-left span   { font-size: .85rem; color: #64748b; font-weight: 500; }
    
    .close-btn { background: #f1f5f9; border: none; cursor: pointer; color: #64748b; width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; transition: all .2s; }
    .close-btn:hover { background: #e2e8f0; color: #1e293b; transform: rotate(90deg); }
 
    /* Body */
    .nc-body { padding: 2rem; display: flex; flex-direction: column; gap: 1.2rem; overflow-y: auto; }
    .nc-section-title { font-size: 0.75rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: -5px; }
    .nc-separator { height: 1px; background: #f1f5f9; margin: 0.5rem 0; }
 
    .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .fields-grid .full { grid-column: span 2; }
 
    .field-group { display: flex; flex-direction: column; gap: 7px; }
    label { font-size: .8rem; font-weight: 700; color: #475569; }
    .req { color: #f43f5e; }
 
    .input-wrap { position: relative; display: flex; align-items: center; }
    .input-wrap .pi { position: absolute; left: 14px; color: #94a3b8; font-size: 0.9rem; }
 
    .field-input, .field-area {
      width: 100%; padding: 12px 14px 12px 40px; border: 2px solid #f1f5f9; border-radius: 12px;
      font-family: inherit; font-size: 0.95rem; outline: none; transition: all .2s;
      color: #1e293b; background: #f8fafc;
    }
    .field-area { padding-left: 14px; resize: none; font-family: inherit; }
    .field-input:focus, .field-area:focus { border-color: #1a73e8; background: white; box-shadow: 0 0 0 4px rgba(26,115,232,0.1); }
 
    .info-box-premium {
      display: flex; align-items: center; gap: 10px;
      background: #f0f7ff; border: 1px solid rgba(26,115,232,.1); border-radius: 12px;
      padding: 12px 16px; color: #1a73e8; font-size: .85rem; font-weight: 500;
    }
    .info-box-premium .pi { color: #1a73e8; font-size: 1rem; }
 
    .error-box { padding: 12px 16px; border-radius: 12px; background: #fff1f2; color: #e11d48; font-size: .9rem; font-weight: 600; }
 
    /* Footer */
    .nc-footer { display: flex; gap: 12px; justify-content: flex-end; padding: 1.5rem 2rem; background: #ffffff; border-top: 1px solid #f1f5f9; }
    .btn-cancel-glass { background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all .2s; }
    .btn-cancel-glass:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .btn-save-premium {
      display: flex; align-items: center; gap: 8px;
      background: #1e293b; color: white; border: none;
      padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: .95rem;
      cursor: pointer; transition: all .3s;
    }
    .btn-save-premium:hover:not(:disabled) { background: #0f172a; box-shadow: 0 10px 25px rgba(0,0,0,0.15); transform: translateY(-1px); }
    .btn-save-premium:disabled { opacity: .4; cursor: not-allowed; }
 
    .custom-scroll::-webkit-scrollbar { width: 5px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
  `]
})
export class NovoClienteModalComponent implements OnInit {
  @Input() cliente?: Cliente;
  @Output() salvo    = new EventEmitter<Cliente>();
  @Output() cancelado = new EventEmitter<void>();

  private clienteService = inject(ClienteService);

  form = { nome: '', telefone: '', email: '', nascimento: '', observacoes: '' };
  saving = false;
  erro   = '';
  isEdit = false;

  ngOnInit() {
    if (this.cliente) {
      this.isEdit = true;
      this.form = {
        nome:       this.cliente.nome || '',
        telefone:   this.cliente.telefone || '',
        email:      this.cliente.email || '',
        nascimento: (this.cliente as any).nascimento || '',
        observacoes: (this.cliente as any).observacoes || ''
      };
    }
  }

  async confirmar() {
    if (!this.form.nome.trim()) return;
    this.saving = true;
    this.erro   = '';

    try {
      if (this.isEdit && this.cliente?.id) {
        // Modo Edição
        const atualizado = await this.clienteService.updateCliente(this.cliente.id, {
          nome:       this.form.nome.trim(),
          telefone:   this.form.telefone.trim() || undefined,
          email:      this.form.email.trim()    || undefined,
          nascimento: this.form.nascimento || undefined,
          observacoes: this.form.observacoes.trim() || undefined
        } as any);
        this.salvo.emit(atualizado);
      } else {
        // Modo Novo
        const novo = await this.clienteService.addCliente({
          nome:       this.form.nome.trim(),
          telefone:   this.form.telefone.trim() || undefined,
          email:      this.form.email.trim()    || undefined,
          nascimento: this.form.nascimento || undefined,
          observacoes: this.form.observacoes.trim() || undefined,
          ultima_visita: new Date().toISOString().split('T')[0],
        });
        this.salvo.emit(novo);
      }
    } catch (e: any) {
      this.erro = e.message || 'Erro ao processar cadastro.';
    } finally {
      this.saving = false;
    }
  }

  cancelar() { this.cancelado.emit(); }
}
