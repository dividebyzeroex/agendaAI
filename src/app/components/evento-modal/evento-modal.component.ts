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
        <!-- Status badge -->
        <div class="evento-row">
          <span class="ev-label">Status</span>
          <span class="status-pill" [class]="evento?.status">{{ statusLabel(evento?.status) }}</span>
        </div>

        <div class="evento-row" *ngIf="evento?.observacoes">
          <span class="ev-label">Observações</span>
          <span class="ev-val">{{ evento?.observacoes }}</span>
        </div>
      </div>

      <div class="evento-footer">
        <button class="btn-status-toggle"
          *ngIf="evento?.status !== 'concluido'"
          (click)="marcarConcluido()">
          <i class="pi pi-check"></i> Concluído
        </button>
        <button class="btn-delete" (click)="confirmarDelete()">
          <i class="pi" [class.pi-trash]="!confirmDelete" [class.pi-exclamation-triangle]="confirmDelete"></i>
          {{ confirmDelete ? 'Confirmar exclusão' : 'Excluir' }}
        </button>
        <button class="btn-close-footer" (click)="fechar()">Fechar</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      backdrop-filter: blur(4px); z-index: 300;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
      animation: fadeIn .2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }

    .evento-modal-box {
      background: white; border-radius: 16px; width: 100%; max-width: 400px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.2);
      animation: slideUp .3s cubic-bezier(.2,.8,.2,1); overflow: hidden;
    }
    .evento-header {
      display: flex; align-items: center; gap: 12px; padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(0,0,0,0.06); background: #fafafa;
      border-left: 4px solid #1a73e8;
    }
    .evento-icon { font-size: 1.6rem; flex-shrink: 0; }
    .evento-info { flex: 1; }
    .evento-info strong { display: block; font-size: .95rem; color: #202124; font-weight: 700; }
    .evento-time  { font-size: .8rem; color: #9aa0a6; font-family: 'Space Mono', monospace; }
    .close-btn { background: none; border: none; cursor: pointer; color: #9aa0a6; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all .2s; }
    .close-btn:hover { background: #f1f3f4; color: #202124; }

    .evento-body { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 10px; }
    .evento-row { display: flex; justify-content: space-between; align-items: center; }
    .ev-label { font-size: .78rem; font-weight: 700; color: #9aa0a6; text-transform: uppercase; }
    .ev-val { font-size: .88rem; color: #202124; }

    .status-pill { padding: 3px 10px; border-radius: 20px; font-size: .78rem; font-weight: 700; }
    .status-pill.confirmado { background: #e6f4ea; color: #34a853; }
    .status-pill.pendente   { background: #fef9e7; color: #b06000; }
    .status-pill.cancelado  { background: #fce8e8; color: #ea4335; }
    .status-pill.concluido  { background: #f1f3f4; color: #5f6368; }

    .evento-footer { display: flex; gap: 8px; padding: 1rem 1.5rem; border-top: 1px solid rgba(0,0,0,0.06); }
    .btn-status-toggle {
      flex: 1; background: #e6f4ea; color: #34a853; border: 1.5px solid #34a853;
      padding: 8px; border-radius: 8px; font-family: inherit; font-weight: 700;
      font-size: .85rem; cursor: pointer; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .btn-status-toggle:hover { background: #34a853; color: white; }
    .btn-delete {
      flex: 1; background: #fce8e8; color: #ea4335; border: 1.5px solid #ea4335;
      padding: 8px; border-radius: 8px; font-family: inherit; font-weight: 700;
      font-size: .85rem; cursor: pointer; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 6px;
    }
    .btn-delete:hover { background: #ea4335; color: white; }
    .btn-close-footer {
      background: none; border: 1px solid #e8eaed; color: #5f6368;
      padding: 8px 14px; border-radius: 8px; font-family: inherit; font-size: .85rem; cursor: pointer;
    }
    .btn-close-footer:hover { background: #f1f3f4; }
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
    const map: Record<string, string> = { confirmado: 'Confirmado', pendente: 'Pendente', cancelado: 'Cancelado', concluido: 'Concluído' };
    return map[s || ''] || s || '';
  }

  async marcarConcluido() {
    if (!this.evento?.id) return;
    await this.agendaService.updateStatus(this.evento.id, 'concluido');
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
