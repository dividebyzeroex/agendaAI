import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';

type OnboardingStep = 'overview' | 'conclusao';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, Button, InputText, Card],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login implements OnInit {
  isSignupMode = false;
  termsAccepted = false;
  marketingConsent = false;
  private route = inject(ActivatedRoute);
  email = '';
  isLoading = false;
  errorMessage = '';
  isOtpSent = false;
  successMessage = '';
  isEmailValid = false;

  private router = inject(Router);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  // Estados Camaleão
  step: 'email' | 'auth' = 'email';
  authType: 'email' | 'phone' | 'password' = 'password';
  password = '';

  // Estados Onboarding Integrado (Elite Gatekeeper)
  isDoingOnboarding = false;
  onStep: OnboardingStep = 'overview';
  isSaving = false;

  form: any = {
    nome: '',
    email: '',
    slug: ''
  };

  async ngOnInit() {
    this.isSignupMode = this.route.snapshot.queryParamMap.get('trial') === '30';
    this.isLoading = true;
    try {
      const hasSession = await this.authService.checkSession();
      if (hasSession) {
        await this.authService.redirectAfterLogin();
      }
    } catch (e) {
      console.error('Session check failed', e);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async submitEmail() {
    if (this.isLoading) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;

    this.email = this.email.trim().toLowerCase();
    this.validateEmail();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.errorMessage = 'Informe um e-mail válido.';
      this.isLoading = false;
      return;
    }

    try {
      if (this.isSignupMode) {
         if (!this.termsAccepted) throw new Error('Leia e aceite as condições do teste para continuar.');
         localStorage.setItem('ag_terms_accepted', 'true');
         localStorage.setItem('ag_marketing_consent', String(this.marketingConsent));
         if (this.authType === 'password' && (!this.password || this.password.length < 8)) {
           this.errorMessage = 'Sua senha deve ter no mínimo 8 caracteres.';
           this.isLoading = false;
           this.cdr.detectChanges();
           return;
         }
         this.isDoingOnboarding = true;
         this.onStep = 'overview';
         this.form.email = this.email;
         this.isLoading = false;
         this.cdr.detectChanges();
         return;
      }

      // LOGIN CAMALEÃO: Passo 1 - Identificar Preferência
      if (this.step === 'email') {
        this.authType = 'password';
        this.step = 'auth';
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      // LOGIN CAMALEÃO: Passo 2 - Autenticar de fato
      if (this.authType === 'password') {
        if (!this.password) {
          throw new Error('Por favor, insira a sua senha.');
        }
        await this.authService.signInWithEmail(this.email, this.password);
        await this.authService.redirectAfterLogin();
      } else if (this.authType === 'phone') {
        this.errorMessage = 'A autenticação por Telefone (OTP) é exclusiva para o portal de profissionais.';
      } else {
        await this.authService.signInWithOtp(this.email);
        this.isOtpSent = true;
        this.successMessage = 'Pronto! Verifique sua caixa de entrada e clique no link mágico para acessar o painel.';
      }

    } catch (error: any) {
      this.errorMessage = error.message || 'Houve um erro na autenticação.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this.isEmailValid = emailRegex.test(this.email);
  }

  // --- Lógica do Wizard Interno ao Card ---

  getStepIndex(): number {
    const steps: OnboardingStep[] = ['overview', 'conclusao'];
    return steps.indexOf(this.onStep);
  }

  onNameChange() {
    if (this.form.nome) {
      this.form.slug = EstabelecimentoPublicoService.slugify(this.form.nome);
    }
  }

  nextStep() {
    if (this.onStep === 'overview') {
      this.finalizarOnboarding();
    }
  }

  backStep() {
    this.isDoingOnboarding = false;
    this.errorMessage = '';
  }

  async finalizarOnboarding() {
    if (this.isLoading) return;
    this.form.nome = this.form.nome.trim();
    this.form.slug = EstabelecimentoPublicoService.slugify(this.form.slug);
    if (!this.form.nome || !this.form.slug) {
      this.errorMessage = 'Informe o nome e o link do estabelecimento.';
      return;
    }
    this.errorMessage = '';
    this.isLoading = true;
    this.onStep = 'conclusao';
    this.cdr.detectChanges();

    try {
      if (!this.form.email) {
        this.form.email = this.email;
      }
      localStorage.setItem('ag_temp_onboarding_data', JSON.stringify(this.form));

      if (this.authType === 'password') {
        const signup = await this.authService.signUpWithPassword(this.form.email, this.password);
        if (signup.session) await this.authService.redirectAfterLogin();
        else this.successMessage = 'Abra o link de confirmação para continuar. Se já possui cadastro, volte ao início e entre com sua senha.';
      } else {
        await this.authService.signInWithOtp(this.form.email);
        this.successMessage = 'Abra o link de acesso para continuar o cadastro e ativar seu teste.';
      }

      this.isLoading = false;
      this.cdr.detectChanges();
    } catch (err: any) {
      this.errorMessage = err.message || 'Houve um problema ao processar seu cadastro.';
      this.isLoading = false;
      this.onStep = 'overview';
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

  returnToLogin() {
    this.isDoingOnboarding = false;
    this.isSignupMode = false;
    this.isOtpSent = false;
    this.step = 'email';
    this.onStep = 'overview';
    this.errorMessage = '';
    this.successMessage = '';
  }

  toggleMode() {
    this.isSignupMode = !this.isSignupMode;
    this.step = 'email';
    this.isOtpSent = false;
    this.authType = 'password';
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  resetSteps() {
    this.step = 'email';
    this.authType = 'password';
    this.password = '';
    this.cdr.detectChanges();
  }
}
