import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';
import { passwordRequirements, isValidSignupPassword, PASSWORD_HELP,
  classifySignupError, signupErrorMessage } from '../../core/signup-guardrails';

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
  passwordTouched = false;
  get passwordChecks() { return passwordRequirements(this.password); }
  get passwordIsValid() { return isValidSignupPassword(this.password); }
  get showSignupRecovery() { return this.isSignupMode && !this.isLoading && !!this.errorMessage; }
  accountCreated = false;
  accountNeedsConfirmation = false;
  private persistSignupDraft():void {
    try { localStorage.setItem('ag_temp_onboarding_data',JSON.stringify(this.form)); }
    catch { /* Private browsing or storage disabled must never block signup. */ }
  }

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
         if (this.authType === 'password' && !this.passwordIsValid) {
           this.passwordTouched = true;
           this.errorMessage = PASSWORD_HELP;
           return;
         }
         try {
           localStorage.setItem('ag_terms_accepted', 'true');
           localStorage.setItem('ag_marketing_consent', String(this.marketingConsent));
         } catch { /* Consent is also sent through auth metadata when storage works. */ }
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

    } catch (error: unknown) {
      const code=(error as {code?:string})?.code;
      this.errorMessage = code==='invalid_credentials' ||
        /invalid login credentials/i.test((error as Error)?.message||'')
        ? 'E-mail ou senha incorretos. Confira os dados ou entre pelo link de acesso.'
        : signupErrorMessage(error);
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
    // Company name and reserved URL remain in memory while editing the password.
  }

  /** Password-free recovery is available before and after company details are entered. */
  async solicitarLinkDeAcesso() {
    if (this.isLoading) return;
    if (!this.termsAccepted) {
      this.errorMessage = 'Aceite as condições do teste para continuar.';
      return;
    }
    const email=String(this.form.email||this.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage='Informe um e-mail válido para receber seu link de acesso.';
      return;
    }
    this.form.email=email;
    this.isLoading=true;
    this.errorMessage='';
    this.persistSignupDraft();
    this.cdr.detectChanges();
    try {
      await this.authService.signInWithOtp(email,{
        termsAccepted:this.termsAccepted,marketingConsent:this.marketingConsent
      });
      this.authType='email';
      this.accountNeedsConfirmation=true;
      this.successMessage='Enviamos um link seguro para seu e-mail. Abra-o para continuar criando seu espaço, sem perder os dados.';
      this.isDoingOnboarding=true;
      this.onStep='conclusao';
    } catch (error:unknown) {
      this.errorMessage=signupErrorMessage(error);
      this.isDoingOnboarding=false;
    } finally {
      this.isLoading=false;
      this.cdr.detectChanges();
    }
  }

  /** Navigating after successful registration must never call Auth.signUp twice. */
  async continuarCadastroCriado() {
    if (!this.accountCreated || this.isLoading) return;
    this.isLoading=true;
    this.errorMessage='';
    this.cdr.detectChanges();
    try { await this.authService.redirectAfterLogin(); }
    catch {
      this.errorMessage='Sua conta já foi criada. Se o painel não abrir, entre com o mesmo e-mail para continuar.';
    } finally {
      this.isLoading=false;
      this.cdr.detectChanges();
    }
  }

  async finalizarOnboarding() {
    if (this.isLoading) return;
    this.form.nome = this.form.nome.trim();
    this.form.slug = EstabelecimentoPublicoService.slugify(this.form.slug);
    if (!this.form.nome || !this.form.slug) {
      this.errorMessage = 'Informe o nome e o link do estabelecimento.';
      return;
    }
    if (this.authType==='password' && !this.accountCreated && !this.passwordIsValid) {
      this.passwordTouched=true;
      this.errorMessage=PASSWORD_HELP;
      this.isDoingOnboarding=false; // Return to the actual editable password field.
      this.cdr.detectChanges();
      return;
    }
    if (this.accountCreated) {
      await this.continuarCadastroCriado();
      return;
    }
    this.errorMessage = '';
    this.isLoading = true;
    this.onStep = 'conclusao';
    this.cdr.detectChanges();
    try {
      this.form.email = String(this.form.email||this.email).trim().toLowerCase();
      this.persistSignupDraft();
      if (this.authType === 'password') {
        const signup = await this.authService.signUpWithPassword(this.form.email, this.password,{
          termsAccepted:this.termsAccepted,marketingConsent:this.marketingConsent
        });
        this.accountCreated=!!signup?.user;
        this.accountNeedsConfirmation=!signup?.session;
        if (signup?.session) {
          this.successMessage='Sua conta foi criada! Vamos abrir sua agenda.';
          await this.continueToAccountAfterSignup();
        } else {
          this.successMessage='Abra o link de confirmação para continuar. Se já possui cadastro, volte ao início e entre com sua senha.';
        }
      } else {
        await this.authService.signInWithOtp(this.form.email,{
          termsAccepted:this.termsAccepted,marketingConsent:this.marketingConsent
        });
        this.accountNeedsConfirmation=true;
        this.successMessage='Abra o link de acesso para continuar o cadastro e ativar seu teste.';
      }
    } catch (err:unknown) {
      const issue=classifySignupError(err);
      if(this.accountCreated) {
        this.onStep='conclusao';
        this.errorMessage='Sua conta foi criada, mas não conseguimos abrir o painel. Tente acessar novamente; não precisa se cadastrar outra vez.';
      } else {
        this.onStep='overview';
        this.errorMessage=signupErrorMessage(err);
        if(issue==='password' || issue==='invalid-email') {
          this.isDoingOnboarding=false; // Editable password/email and same company draft.
          this.passwordTouched=issue==='password';
        }
      }
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async continueToAccountAfterSignup():Promise<void> {
    // Account already created. A navigation failure is not a signup failure.
    await this.authService.redirectAfterLogin();
  }

  async loginComGoogle() {
    this.isLoading = true;
    try {
      await this.authService.signInWithGoogle();
    } catch(err: any) {
      this.errorMessage = signupErrorMessage(err);
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
    this.accountCreated=false;
    this.accountNeedsConfirmation=false;
  }

  toggleMode() {
    this.isSignupMode = !this.isSignupMode;
    this.step = 'email';
    this.isOtpSent = false;
    this.authType = 'password';
    this.successMessage = '';
    this.errorMessage = '';
    this.accountCreated=false;
    this.accountNeedsConfirmation=false;
    this.passwordTouched=false;
    this.cdr.detectChanges();
  }

  resetSteps() {
    this.step = 'email';
    this.authType = 'password';
    this.password = '';
    this.cdr.detectChanges();
  }
}
