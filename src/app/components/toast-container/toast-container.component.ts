import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, ToastMessage } from '../../services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of (notifService.toasts$ | async); trackBy: trackById" 
           class="toast-card" 
           [class]="toast.type.toLowerCase()">
        <div class="toast-icon">
          <i [class]="getIcon(toast)"></i>
        </div>
        <div class="toast-content">
          <div class="toast-title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>
        <button class="toast-close" (click)="notifService.removeToast(toast.id)">
          <i class="pi pi-times"></i>
        </button>
        <div class="toast-progress"></div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column-reverse;
      gap: 12px;
      pointer-events: none;
    }

    .toast-card {
      pointer-events: auto;
      width: 320px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.05);
      position: relative;
      overflow: hidden;
      
      /* Slide In Animation */
      animation: slideIn 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards,
                 slideOut 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) 6.5s forwards;
    }

    @keyframes slideIn {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }

    .toast-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    /* Colors */
    .success .toast-icon { background: #e6f4ea; color: #34a853; }
    .warning .toast-icon { background: #fef9e7; color: #f9ab00; }
    .info .toast-icon    { background: #e8f0fe; color: #1a73e8; }
    .ai_insight .toast-icon { background: #f3e8ff; color: #9333ea; }

    .toast-content { flex: 1; }
    .toast-title { font-weight: 700; font-size: 0.9rem; color: #1e293b; margin-bottom: 2px; }
    .toast-message { font-size: 0.8rem; color: #64748b; line-height: 1.4; }

    .toast-close {
      background: none; border: none; color: #94a3b8; cursor: pointer;
      padding: 4px; border-radius: 6px; transition: all 0.2s;
    }
    .toast-close:hover { background: #f1f5f9; color: #1e293b; }

    .toast-progress {
      position: absolute; bottom: 0; left: 0; height: 3px;
      background: rgba(0, 0, 0, 0.05); width: 100%;
    }
    .toast-card.success .toast-progress { background: #34a853; }
    .toast-card.info .toast-progress    { background: #1a73e8; }
    
    .toast-progress {
      animation: progress 7s linear forwards;
    }

    @keyframes progress {
      from { width: 100%; }
      to { width: 0%; }
    }
  `]
})
export class ToastContainerComponent {
  notifService = inject(NotificationService);

  trackById(index: number, item: ToastMessage) {
    return item.id;
  }

  getIcon(toast: ToastMessage): string {
    if (toast.icon) return toast.icon;
    switch (toast.type) {
      case 'SUCCESS': return 'pi pi-check';
      case 'WARNING': return 'pi pi-exclamation-triangle';
      case 'AI_INSIGHT': return 'pi pi-sparkles';
      default: return 'pi pi-info-circle';
    }
  }
}
