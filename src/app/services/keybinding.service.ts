import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class KeybindingService {
  private router = inject(Router);
  private isEnabled = true;

  constructor() {
    this.initGlobalListeners();
  }

  toggle(state: boolean) {
    this.isEnabled = state;
  }

  private initGlobalListeners() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isEnabled) return;
      
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      // Vim-like j/k scroll
      if (e.key === 'j') {
        window.scrollBy({ top: 100, behavior: 'smooth' });
      } else if (e.key === 'k') {
        window.scrollBy({ top: -100, behavior: 'smooth' });
      }

      // Quick actions
      if (e.key === 'g' && e.shiftKey) { // 'G' = go to bottom
         window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
      if (e.key === 'g' && !e.shiftKey) { 
         // 'g' twice = go to top. But for simplicity, we'll map 't' to top
      }
      if (e.key === 't') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // `:` command
      if (e.key === ':') {
        e.preventDefault();
        // Since the CommandPalette component is listening globally for ctrl+k, 
        // we can just dispatch a mock event to trigger it.
        const ctrlKEvent = new KeyboardEvent('keydown', {
           key: 'k', ctrlKey: true, bubbles: true
        });
        window.dispatchEvent(ctrlKEvent);
        
        // Let's populate the input with `:` if possible
        setTimeout(() => {
          const input = document.querySelector('.palette-container input') as HTMLInputElement;
          if (input && !input.value.startsWith(':')) {
            input.value = ':';
            input.dispatchEvent(new Event('input'));
          }
        }, 100);
      }
    });
  }
}
