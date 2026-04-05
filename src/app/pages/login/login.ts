import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';

type OnboardingStep = 'overview' | 'operacao' | 'identidade' | 'link' | 'conclusao';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, Button, InputText, Card],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  isSignupMode = false;
  email = '';
  isLoading = false;
  errorMessage = '';
  isOtpSent = false;
  successMessage = '';

  private router = inject(Router);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  // Estados Onboarding Integrado (Elite Gatekeeper)
  isDoingOnboarding = false;
  onStep: OnboardingStep = 'overview';
  flipAngle = 0;
  isSaving = false;

  form: any = {
    nome: '',
    cnpj: '',
    segmento: '',
    volume_clientes: '',
    endereco_completo: '',
    cidade: '',
    telefone: '',
    email: '',
    cor_primaria: '#6366f1',
    slug: ''
  };

  segmentOptions = [
    { label: 'Barbearia', value: 'barbearia', icon: '✂️' },
    { label: 'Clínica / Saúde', value: 'clinica', icon: '⚕️' },
    { label: 'Estética / Spa', value: 'estetica', icon: '🧖' },
    { label: 'Outro', value: 'outro', icon: '🏢' }
  ];

  volumeOptions = [
    { label: 'Começando', value: 'iniciante', desc: 'Até 50 / mês' },
    { label: 'Crescendo', value: 'intermediario', desc: '51 a 200 / mês' },
    { label: 'Alto Volume', value: 'avanzado', desc: '200+ / mês' }
  ];

  suggestedColors = ['#6366f1', '#a142f4', '#10b981', '#f43f5e', '#facc15', '#0f172a'];

  async submitEmail() {
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;

    if (!this.email) {
      this.errorMessage = 'Por favor, insira o seu e-mail corporativo.';
      this.isLoading = false;
      return;
    }

    try {
      if (this.isSignupMode) {
         // Iniciamos a Fusão UI: O card de login vai virar para o onboarding
         this.isDoingOnboarding = true;
         this.onStep = 'overview';
         this.form.email = this.email;
         this.isLoading = false;
         this.cdr.detectChanges();
         return;
      }
      
      await this.authService.signInWithOtp(this.email);
      this.isOtpSent = true;
      this.successMessage = 'Pronto! Verifique sua caixa de entrada e clique no link mágico para acessar o painel.';
    } catch (error: any) {
      this.errorMessage = error.message || 'Houve um erro ao enviar o Magic Link.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // --- Lógica do Wizard Interno ao Card ---
  
  getStepIndex(): number {
    const steps: OnboardingStep[] = ['overview', 'operacao', 'identidade', 'link', 'conclusao'];
    return steps.indexOf(this.onStep);
  }

  onNameChange() {
    if (this.form.nome) {
      this.form.slug = EstabelecimentoPublicoService.slugify(this.form.nome);
    }
  }

  nextStep() {
    const steps: OnboardingStep[] = ['overview', 'operacao', 'identidade', 'link', 'conclusao'];
    const idx = this.getStepIndex();
    if (idx < steps.length - 1) {
      if (this.onStep === 'link') {
        this.finalizarOnboarding();
      } else {
        this.onStep = steps[idx + 1];
        this.flipAngle -= 180;
        this.cdr.detectChanges();
      }
    }
  }

  backStep() {
    const steps: OnboardingStep[] = ['overview', 'operacao', 'identidade', 'link'];
    const idx = this.getStepIndex();
    if (idx > 0) {
      this.onStep = steps[idx - 1];
      this.flipAngle += 180;
      this.cdr.detectChanges();
    }
  }

  async finalizarOnboarding() {
    this.isLoading = true;
    this.onStep = 'conclusao';
    this.cdr.detectChanges();

    try {
      // Sincronização robusta do e-mail (Segurança redundante)
      if (!this.form.email) {
        this.form.email = this.email;
      }
      
      console.log('[Gatekeeper] Finalizando onboarding. Disparando Magic Link para:', this.form.email);

      // SALVAMENTO DIFERIDO: Dados fiscais e operacionais.
      localStorage.setItem('ag_temp_onboarding_data', JSON.stringify(this.form));
      
      // DISPARO REAL DO MAGIC LINK
      await this.authService.signInWithOtp(this.form.email);
      
      console.log('[Gatekeeper] Magic Link disparado com sucesso.');

      // Delay tátil 'WOW' reduzido para agilidade
      await new Promise(r => setTimeout(r, 1500));
      this.isLoading = false;
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('[Onboarding Login] Erro Crítico no disparador:', err);
      this.errorMessage = err.message || 'Houve um problema ao processar seu cadastro.';
      this.isLoading = false;
      this.onStep = 'link';
      this.flipAngle += 180;
      this.cdr.detectChanges();
    }
  }

  async loginComGoogle() {
    this.isLoading = true;
    try {
      await this.authService.signInWithGoogle();
    } catch(err: any) {
      this.errorMessage = err.message || 'Erro ao autenticar com o Google.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  toggleMode() {
    this.isSignupMode = !this.isSignupMode;
    this.errorMessage = '';
    this.cdr.detectChanges();
  }
}
