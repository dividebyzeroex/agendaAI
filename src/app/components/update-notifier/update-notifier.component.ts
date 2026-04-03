import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

interface UpdateNotice {
  version: string;
  message: string;
  url?: string;
}

@Component({
  selector: 'app-update-notifier',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="update-toast" *ngIf="notice" [@fadeSlide]>
      <div class="update-icon">🚀</div>
      <div class="update-body">
        <strong>Nova versão disponível!</strong>
        <span>{{ notice.message }}</span>
      </div>
      <a *ngIf="notice.url" [href]="notice.url" target="_blank" class="update-link">Ver novidades</a>
      <button class="update-close" (click)="dismiss()">✕</button>
    </div>
  `,
  styles: [`
    .update-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      background: white;
      border: 1px solid rgba(0,0,0,0.08);
      border-left: 4px solid #1a73e8;
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      font-family: 'Space Grotesk', sans-serif;
      animation: slideInRight 0.4s cubic-bezier(0.2,0.8,0.2,1);
      max-width: 360px;
    }
    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(40px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .update-icon { font-size: 1.5rem; flex-shrink: 0; }
    .update-body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .update-body strong { font-size: 0.9rem; color: #202124; }
    .update-body span   { font-size: 0.8rem; color: #5f6368; }
    .update-link {
      font-size: 0.8rem; font-weight: 600; color: #1a73e8;
      text-decoration: none; white-space: nowrap;
    }
    .update-link:hover { text-decoration: underline; }
    .update-close {
      background: none; border: none; cursor: pointer;
      color: #9aa0a6; font-size: 0.9rem; flex-shrink: 0;
      width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
      border-radius: 6px; transition: all 0.2s;
    }
    .update-close:hover { background: #f1f3f4; color: #202124; }
  `],
})
export class UpdateNotifierComponent implements OnInit {
  notice: UpdateNotice | null = null;

  private readonly CURRENT_VERSION = '1.0.0';
  private readonly CHECK_URL = '/api/version-check'; // Serverless function
  private readonly DISMISS_KEY = 'agendaai_dismissed_version';

  ngOnInit() {
    // Verifica em background — não bloqueia UI
    setTimeout(() => this.checkForUpdates(), 3000);
  }

  private async checkForUpdates() {
    try {
      const dismissedVersion = localStorage.getItem(this.DISMISS_KEY);

      const resp = await fetch(this.CHECK_URL);
      if (!resp.ok) return;

      const data = await resp.json() as UpdateNotice;
      if (!data?.version) return;

      // Não mostra se usuário já dispensou esta versão
      if (data.version === dismissedVersion) return;
      if (data.version === this.CURRENT_VERSION) return;

      this.notice = data;
    } catch {
      // Silencioso — update check nunca deve quebrar a UI
    }
  }

  dismiss() {
    if (this.notice) {
      localStorage.setItem(this.DISMISS_KEY, this.notice.version);
    }
    this.notice = null;
  }
}
