import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-agendar-success',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="success-container">
      <div class="success-card">
        <i class="pi pi-check-circle check-icon"></i>
        <h2>Reserva Confirmada!</h2>
        <p>Seu pagamento foi processado com sucesso. Te enviaremos um lembrete via WhatsApp!</p>
        <button class="btn-primary" (click)="voltar()">Voltar ao Início</button>
      </div>
    </div>
  `,
  styles: [`
    .success-container {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg-color, #f8fafc); padding: 1rem;
    }
    .success-card {
      background: var(--glass-bg, rgba(255,255,255,0.9));
      backdrop-filter: blur(20px);
      padding: 3rem 2rem; border-radius: 24px;
      text-align: center; max-width: 400px; width: 100%;
      border: 1px solid var(--glass-border);
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    }
    .check-icon { font-size: 4rem; color: #10b981; margin-bottom: 1.5rem; }
    h2 { margin: 0 0 1rem 0; color: var(--text-main); font-weight: 800; font-size: 1.8rem; }
    p { color: var(--text-muted); font-size: 1rem; line-height: 1.5; margin-bottom: 2rem; }
    .btn-primary {
      background: var(--primary-color, #3b82f6); color: white;
      border: none; padding: 1rem 2rem; border-radius: 12px;
      font-weight: 700; width: 100%; cursor: pointer;
    }
  `]
})
export class AgendarSuccess implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    // We could capture session_id from URL if needed.
  }

  voltar() {
    this.router.navigate(['/']);
  }
}
