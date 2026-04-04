import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Card } from 'primeng/card';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

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
         // Create stub logic - magic link acts as sign up if not user yet automatically!
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
