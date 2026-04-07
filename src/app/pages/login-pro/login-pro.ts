import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-pro',
  standalone: true,
  imports: [CommonModule, FormsModule, Button, InputText],
  templateUrl: './login-pro.html',
  styleUrls: ['./login-pro.css']
})
export class LoginPro implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  phone = '';
  otp = '';
  isOtpSent = false;
  isLoading = false;
  errorMessage = '';
  
  async ngOnInit() {
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

  async sendOtp() {
    if (!this.phone) {
      this.errorMessage = 'Por favor, insira seu telefone profissional.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      await this.authService.signInWithPhone(this.phone);
      this.isOtpSent = true;
      this.isLoading = false;
      this.cdr.detectChanges();
    } catch (err: any) {
      this.errorMessage = err.message || 'Erro ao enviar código. Verifique o número.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async verifyOtp() {
    if (!this.otp || this.otp.length < 6) {
      this.errorMessage = 'Insira o código de 6 dígitos enviado ao seu celular.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.authService.verifyOtp(this.phone, this.otp);
      await this.authService.redirectAfterLogin();
    } catch (err: any) {
      this.errorMessage = 'Código inválido ou expirado.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  backToPhone() {
    this.isOtpSent = false;
    this.otp = '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }
}
