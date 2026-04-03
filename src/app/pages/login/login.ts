import { Component, inject } from '@angular/core';
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
  password = '';
  isLoading = false;
  errorMessage = '';

  private router = inject(Router);
  private authService = inject(AuthService);

  async submitForm() {
    this.errorMessage = '';
    this.isLoading = true;

    if (!this.email || !this.password) {
      this.errorMessage = 'Preencha email e senha.';
      this.isLoading = false;
      return;
    }

    try {
      if (this.isSignupMode) {
        await this.authService.signUpWithPassword(this.email, this.password);
        this.router.navigate(['/onboarding']);
      } else {
        await this.authService.signIn(this.email, this.password);
        this.router.navigate(['/admin']);
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Erro ao processar login.';
    } finally {
      this.isLoading = false;
    }
  }

  toggleMode() {
    this.isSignupMode = !this.isSignupMode;
    this.errorMessage = '';
  }
}
