import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { ParticleCanvasComponent } from './components/particle-canvas/particle-canvas.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, ParticleCanvasComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('agenda-app');
  public router = inject(Router);
  constructor() {
    // The referral is captured before signup; attribution is verified later
    // against the authenticated establishment's owner and first payment.
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ref)) localStorage.setItem('agendaai_referral_code', ref);
  }
}
