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
}
