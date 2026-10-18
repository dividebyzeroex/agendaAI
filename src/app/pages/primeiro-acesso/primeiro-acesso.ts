import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ProfissionaisService } from '../../services/profissionais.service';
@Component({
  selector: 'app-primeiro-acesso',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './primeiro-acesso.html',
  styleUrls: ['./primeiro-acesso.css'],
})
export class PrimeiroAcesso implements OnInit {
  private auth = inject(AuthService);
  private profSvc = inject(ProfissionaisService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy = inject(DestroyRef);
  private redirecting = false;
  fase: 'senha' | 'tour' = 'senha';
  pass1 = '';
  pass2 = '';
  nomeCorreto = '';
  isSaving = false;
  erro = '';
  ngOnInit() {
    this.auth.userProfile$.pipe(takeUntilDestroyed(this.destroy)).subscribe((profile) => {
      if (!profile || this.isSaving || this.redirecting) return;
      if (!['dono', 'financeiro'].includes(profile.role)) {
        this.redirecting = true;
        void this.profSvc
          .atualizarProfissional(profile.id, { primeiro_acesso: false, onboarding_concluido: true })
          .then(() => {this.auth.updateUserProfileLocal({primeiro_acesso:false,onboarding_concluido:true});return this.router.navigate(['/admin']);})
          .catch(() => {
            this.redirecting = false;
            this.erro = 'Não foi possível preparar seu acesso. Entre novamente.';
            this.cdr.markForCheck();
          });
        return;
      }
      if (!this.nomeCorreto && profile.nome && !profile.nome.includes('=='))
        this.nomeCorreto = profile.nome;
      if (!profile.primeiro_acesso && profile.onboarding_concluido) {
        void this.router.navigate(['/admin']);
        return;
      }
      this.fase = profile.primeiro_acesso ? 'senha' : 'tour';
      this.cdr.markForCheck();
    });
  }
  async confirmarSenha() {
    if (this.isSaving) return;
    this.erro = '';
    if (this.nomeCorreto.trim().length < 3) {
      this.erro = 'Informe seu nome.';
      return;
    }
    if (this.pass1.length < 6) {
      this.erro = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    if (this.pass1 !== this.pass2) {
      this.erro = 'As senhas não coincidem.';
      return;
    }
    this.isSaving = true;
    try {
      const profile = this.auth.userProfileValue;
      if (!profile) throw new Error('Sua sessão expirou. Entre novamente.');
      await this.profSvc.atualizarSenha(this.pass1);
      await this.profSvc.atualizarProfissional(profile.id, {
        primeiro_acesso: false,
        nome: this.nomeCorreto.trim(),
      });
      this.auth.updateUserProfileLocal({nome:this.nomeCorreto.trim()});
      this.fase = 'tour';
      this.pass1 = '';
      this.pass2 = '';
      this.isSaving = false;
      await this.finalizarTour();
    } catch (e) {
      this.erro =
        e instanceof Error ? e.message : 'Não foi possível salvar sua senha. Tente novamente.';
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }
  async finalizarTour() {
    if (this.isSaving) return;
    this.isSaving = true;
    this.erro = '';
    try {
      await this.profSvc.finalizarOnboarding();
      const success = await this.router.navigateByUrl('/admin');
      if (!success) this.erro = 'Seu acesso está pronto. Abra a página inicial novamente.';
    } catch (e) {
      this.erro =
        e instanceof Error ? e.message : 'Não foi possível concluir o acesso. Tente novamente.';
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }
}
