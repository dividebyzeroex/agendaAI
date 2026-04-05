import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, AppNotification } from '../../services/notification.service';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('250ms cubic-bezier(0.7, 0, 0.84, 0)', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ],
  template: `
    <div class="notif-overlay" *ngIf="isOpen" (click)="close.emit()"></div>

    <div class="notif-panel" *ngIf="isOpen" @slideInOut>
      <div class="notif-header">
        <div class="header-left">
          <h3>Notificações</h3>
          <span class="unread-badge" *ngIf="service.unreadCount > 0">{{ service.unreadCount }} novas</span>
        </div>
        <button class="close-btn" (click)="close.emit()"><i class="pi pi-times"></i></button>
      </div>

      <div class="notif-actions-bar" *ngIf="service.notifications.length > 0">
        <button (click)="service.markAllAsRead()">Marcar todas como lidas</button>
      </div>

      <div class="notif-list custom-scroll">
        <div *ngIf="service.notifications.length === 0" class="empty-state">
           <i class="pi pi-bell-slash"></i>
           <p>Nenhuma notificação por aqui.</p>
        </div>

        <div class="notif-item" *ngFor="let n of service.notifications" 
             [class.unread]="!n.read" [class.ai-insight]="n.type === 'AI_INSIGHT'">
          
          <div class="notif-icon" [ngSwitch]="n.type">
            <i *ngSwitchCase="'AI_INSIGHT'" class="pi pi-sparkles"></i>
            <i *ngSwitchCase="'WARNING'" class="pi pi-exclamation-triangle"></i>
            <i *ngSwitchCase="'SUCCESS'" class="pi pi-check-circle"></i>
            <i *ngSwitchDefault class="pi pi-info-circle"></i>
          </div>

          <div class="notif-content">
            <div class="notif-title">{{ n.title }}</div>
            <div class="notif-message">{{ n.message }}</div>
            <div class="notif-time">{{ n.timestamp | date:'shortTime' }}</div>

            <div class="notif-footer" *ngIf="n.action">
              <button class="action-btn" (click)="executeAction(n)">
                {{ n.action.label }}
              </button>
            </div>
          </div>

          <button class="dot-btn" (click)="service.markAsRead(n.id)" *ngIf="!n.read" title="Marcar como lida">
            <span></span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .notif-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.1); z-index: 1000; }
    .notif-panel {
      position: fixed; top: 0; right: 0; bottom: 0; width: 400px;
      background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px);
      box-shadow: -10px 0 40px rgba(0,0,0,0.1); z-index: 1001;
      display: flex; flex-direction: column; overflow: hidden;
      border-left: 1px solid rgba(255,255,255,0.5);
    }

    .notif-header {
      padding: 1.5rem; display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #f1f5f9; background: white;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .header-left h3 { margin: 0; font-size: 1.2rem; font-weight: 800; color: #1e293b; }
    .unread-badge {
      background: #ef4444; color: white; padding: 2px 8px; border-radius: 20px;
      font-size: 0.7rem; font-weight: 700;
    }
    .close-btn { background: none; border: none; font-size: 1.2rem; color: #94a3b8; cursor: pointer; }

    .notif-actions-bar { padding: 0.75rem 1.5rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: flex-end; }
    .notif-actions-bar button {
      background: none; border: none; font-size: 0.75rem; font-weight: 700; color: #6366f1; cursor: pointer;
    }

    .notif-list { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; background: #f8fafc; }
    
    .notif-item {
      position: relative; display: flex; gap: 12px; padding: 1.25rem;
      background: white; border-radius: 16px; border: 1px solid #f1f5f9;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .notif-item:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
    .notif-item.unread { border-left: 4px solid #6366f1; background: #fdfdff; }
    
    .notif-item.ai-insight {
      background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
      border: 1px solid #ddd6fe;
    }
    .notif-item.ai-insight .notif-icon { background: #6366f1; color: white; }

    .notif-icon {
      width: 40px; height: 40px; border-radius: 12px; background: #f1f5f9; color: #64748b;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.1rem;
    }

    .notif-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .notif-title { font-size: 0.95rem; font-weight: 800; color: #1e293b; }
    .notif-message { font-size: 0.85rem; color: #64748b; line-height: 1.4; }
    .notif-time { font-size: 0.7rem; color: #94a3b8; margin-top: 4px; }

    .notif-footer { margin-top: 10px; }
    .action-btn {
      padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0;
      background: white; font-size: 0.8rem; font-weight: 700; color: #475569;
      cursor: pointer; transition: all 0.2s;
    }
    .action-btn:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

    .dot-btn { position: absolute; top: 1.25rem; right: 1.25rem; background: none; border: none; cursor: pointer; padding: 4px; }
    .dot-btn span { display: block; width: 8px; height: 8px; background: #6366f1; border-radius: 50%; }

    .empty-state { text-align: center; padding: 3rem 1rem; color: #94a3b8; }
    .empty-state i { font-size: 2.5rem; margin-bottom: 10px; }

    @media (max-width: 500px) { .notif-panel { width: 100%; } }
  `]
})
export class NotificationCenterComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  service = inject(NotificationService);
  router  = inject(Router);

  executeAction(n: AppNotification) {
    if (n.action?.command) {
      n.action.command();
    }
    
    if (n.action?.link) {
      this.router.navigate([n.action.link]);
    }

    this.service.markAsRead(n.id);
    this.close.emit();
  }
}
