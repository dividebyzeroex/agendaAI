import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';

@Component({
  selector: 'app-evento-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="modal-backdrop" (click)="fechar()">
    <div class="evento-modal-box" (click)="$event.stopPropagation()">
      <div class="evento-header" [style.border-left-color]="evento?.backgroundColor || '#1a73e8'">
        <div class="evento-icon">{{ getEmoji() }}</div>
        <div class="evento-info">
          <strong>{{ evento?.title }}</strong>
          <span class="evento-time">{{ formatTime(evento?.start) }} → {{ formatTime(evento?.end) }}</span>
        </div>
        <button class="close-btn" (click)="fechar()"><i class="pi pi-times"></i></button>
      </div>

      <div class="evento-body">
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

      <div class="evento-footer-ent">
        
        <!-- Casos onde o atendimento ainda não começou -->
        <ng-container *ngIf="evento?.status === 'confirmado' || !evento?.status">
          <button class="btn-ent-action primary" (click)="mudarStatus('em_atendimento')">
            <i class="pi pi-play"></i> Iniciar Atendimento
          </button>
          <button class="btn-ent-action warning" (click)="mudarStatus('noshow')">
            <i class="pi pi-user-minus"></i> No-Show
          </button>
        </ng-container>

        <!-- Caso onde o atendimento está em curso -->
        <ng-container *ngIf="evento?.status === 'em_atendimento'">
          <button class="btn-ent-action success" (click)="mudarStatus('concluido')">
            <i class="pi pi-check-circle"></i> Finalizar Atendimento
          </button>
        </ng-container>

        <!-- Ações secundárias -->
        <div class="footer-secondary">
          <button class="btn-ent-ghost danger" (click)="confirmarDelete()">
            <i class="pi" [class.pi-trash]="!confirmDelete" [class.pi-exclamation-triangle]="confirmDelete"></i>
            {{ confirmDelete ? 'Confirmar' : 'Excluir' }}
          </button>
          <button class="btn-ent-ghost" (click)="fechar()">Fechar</button>
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

    .evento-modal-box {
      background: white; border-radius: 28px; width: 100%; max-width: 440px;
      box-shadow: 0 40px 100px rgba(0,0,0,0.25);
      animation: slideUp .4s cubic-bezier(.2,.8,.2,1); overflow: hidden;
    }

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
    .btn-ent-action {
      width: 100%; padding: 16px; border-radius: 16px; border: none;
      font-weight: 800; font-size: 1rem; cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .btn-ent-action.primary { background: #3b82f6; color: white; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3); }
    .btn-ent-action.warning { background: #fef9c3; color: #854d0e; border: 1.5px solid #fde047; }
    .btn-ent-action.success { background: #10b981; color: white; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3); }
    .btn-ent-action:hover { transform: translateY(-2px); opacity: 0.9; }

    .footer-secondary { display: flex; gap: 10px; margin-top: 8px; }
    .btn-ent-ghost {
      flex: 1; padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
      color: #64748b; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
    }
    .btn-ent-ghost.danger { color: #ef4444; border-color: #fecaca; background: #fff1f2; }
    .btn-ent-ghost:hover { background: #f1f5f9; }

    .close-btn { background: none; border: none; cursor: pointer; color: #94a3b8; width: 32px; height: 32px; border-radius: 50%; transition: all .2s; }
    .close-btn:hover { background: #f1f5f9; color: #1e293b; }
  `]
})
export class EventoModalComponent {
  @Input() evento: AgendaEvent | null = null;
  @Output() fechado = new EventEmitter<void>();

  private agendaService = inject(AgendaEventService);
  confirmDelete = false;

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

  fechar() { this.fechado.emit(); }
}
