import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';
import { ParticleCanvasComponent } from './components/particle-canvas/particle-canvas.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, ParticleCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('agenda-app');
}
