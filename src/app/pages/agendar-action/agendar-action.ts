import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-agendar-action',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="action-container">
      <div class="action-card">
        <i class="pi" [class.pi-times-circle]="action === 'cancel'" [class.pi-calendar]="action === 'reschedule'"></i>
        <h2>{{ action === 'cancel' ? 'Cancelar Agendamento' : 'Reagendar Horário' }}</h2>
        
        <div *ngIf="isLoading" class="msg-box loading">Processando sua solicitação...</div>
        
        <div *ngIf="errorMsg" class="msg-box error">
          {{ errorMsg }}
        </div>
        
        <div *ngIf="successMsg" class="msg-box success">
          {{ successMsg }}
        </div>

        <button *ngIf="successMsg" class="btn-primary" (click)="voltar()">Voltar</button>
      </div>
    </div>
  `,
  styles: [`
    .action-container {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg-color, #f8fafc); padding: 1rem;
    }
    .action-card {
      background: var(--glass-bg, rgba(255,255,255,0.9));
      backdrop-filter: blur(20px);
      padding: 3rem 2rem; border-radius: 24px;
      text-align: center; max-width: 400px; width: 100%;
      border: 1px solid var(--glass-border);
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    }
    .pi { font-size: 3rem; color: var(--primary-color); margin-bottom: 1.5rem; }
    h2 { margin: 0 0 1rem 0; color: var(--text-main); font-weight: 800; font-size: 1.5rem; }
    .msg-box { padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; font-weight: 500; font-size: 0.95rem; }
    .msg-box.loading { background: #f1f5f9; color: #475569; }
    .msg-box.error { background: #fef2f2; color: #dc2626; }
    .msg-box.success { background: #ecfdf5; color: #059669; }
    .btn-primary {
      background: var(--primary-color, #3b82f6); color: white;
      border: none; padding: 1rem 2rem; border-radius: 12px;
      font-weight: 700; width: 100%; cursor: pointer;
    }
  `]
})
export class AgendarAction implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  action: 'cancel' | 'reschedule' = 'cancel';
  token = '';
  isLoading = true;
  errorMsg = '';
  successMsg = '';

  async ngOnInit() {
    this.action = this.route.snapshot.url[0].path as 'cancel' | 'reschedule';
    this.token = this.route.snapshot.queryParams['token'];

    if (!this.token) {
      this.errorMsg = 'Token inválido ou não fornecido.';
      this.isLoading = false;
      return;
    }

    try {
      if (this.action === 'cancel') {
        const { error } = await this.supabase.client
          .from('agenda_events')
          .update({ status: 'cancelado' })
          .eq('token_confirmacao', this.token);
        
        if (error) throw error;
        this.successMsg = 'Seu agendamento foi cancelado com sucesso!';
      } else {
        // Para reagendar, podemos apenas cancelar o atual e mandar ele agendar de novo
        // Em um sistema complexo, guardaríamos o estado. Aqui faremos o mais simples.
        const { data, error } = await this.supabase.client
          .from('agenda_events')
          .update({ status: 'cancelado' })
          .eq('token_confirmacao', this.token)
          .select('estabelecimento_id')
          .single();

        if (error) throw error;
        this.successMsg = 'Agendamento anterior cancelado. Redirecionando para você escolher um novo horário...';
        
        setTimeout(() => {
          this.router.navigate(['/agendar']); 
        }, 3000);
      }
    } catch (err: any) {
      this.errorMsg = 'Erro ao processar sua solicitação: ' + err.message;
    } finally {
      this.isLoading = false;
    }
  }

  voltar() {
    this.router.navigate(['/']);
  }
}
