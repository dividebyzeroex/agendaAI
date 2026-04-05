import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

export type AppTheme = 'claro' | 'escuro' | 'translucido';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private themeSubject = new BehaviorSubject<AppTheme>('translucido');
  theme$ = this.themeSubject.asObservable();

  constructor() {
    this.initTheme();
  }

  private initTheme() {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('agendaai-theme') as AppTheme;
      if (saved) {
        this.setTheme(saved);
      } else {
        this.setTheme('translucido');
      }
    }
  }

  setTheme(theme: AppTheme) {
    this.themeSubject.next(theme);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('agendaai-theme', theme);
      this.applyThemeToBody(theme);
    }
  }

  private applyThemeToBody(theme: AppTheme) {
    const body = document.body;
    body.classList.remove('theme-claro', 'theme-escuro', 'theme-translucido');
    body.classList.add(`theme-${theme}`);
  }

  get currentTheme(): AppTheme {
    return this.themeSubject.value;
  }
}
