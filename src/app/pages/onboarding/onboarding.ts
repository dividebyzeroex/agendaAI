import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EstabelecimentoService, Estabelecimento } from '../../services/estabelecimento.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';
import { AuthService } from '../../services/auth.service';

type Step = 'overview' | 'operacao' | 'identidade' | 'link' | 'conclusao';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css']
})
export class Onboarding implements OnInit {
  private estabService = inject(EstabelecimentoService);
  private pubService   = inject(EstabelecimentoPublicoService);
  private authService  = inject(AuthService);
  private router       = inject(Router);

  // Estado do wizard
  step: Step = 'overview';
  isSaving = false;
  flipAngle = 0; // Efeito 3D acumulativo

  // O registro invisível de dados (UX Seamless)
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

  ngOnInit() {
    // Recupera o email vindo da tela de cadastro de login
    const savedEmail = localStorage.getItem('ag_onboarding_email');
    if (savedEmail) {
      this.form.email = savedEmail;
    }

    this.estabService.estabelecimento$.subscribe(e => {
      // Monitor completion logic here if needed
    });
  }

  onNameChange() {
    if (this.form.nome) {
      this.form.slug = EstabelecimentoPublicoService.slugify(this.form.nome);
    }
  }

  getStepIndex(): number {
    const steps: Step[] = ['overview', 'operacao', 'identidade', 'link', 'conclusao'];
    return steps.indexOf(this.step);
  }

  // Máquina de Estado da Rotação
  next() {
    const steps: Step[] = ['overview', 'operacao', 'identidade', 'link', 'conclusao'];
    const idx = this.getStepIndex();
    
    if (idx < steps.length - 1) {
      if (this.step === 'link') {
        this.finalizar();
      } else {
        this.step = steps[idx + 1];
        this.flipAngle -= 180; // Gira o cartão fisicamente (X graus negativos ou positivos)
      }
    }
  }

  back() {
    const steps: Step[] = ['overview', 'operacao', 'identidade', 'link'];
    const idx = this.getStepIndex();
    
    if (idx > 0) {
      this.step = steps[idx - 1];
      this.flipAngle += 180;
    }
  }

  async finalizar() {
    this.isSaving = true;
    this.step = 'conclusao';

    try {
      // SALVAMENTO DIFERIDO: Salvamos tudo no localstorage.
      // Quando o usuário clicar no Magic Link e o app inicializar na /admin, 
      // detectamos este objeto e criamos a empresa vinculando ao novo ID do usuário.
      localStorage.setItem('ag_temp_onboarding_data', JSON.stringify(this.form));

      // Agora enviamos o Magic Link (Isso atua como o Signup final)
      await this.authService.signInWithOtp(this.form.email);

      // Simulamos o carregamento "WOW" antes de mostrar a mensagem de sucesso do email
      await new Promise(r => setTimeout(r, 2500));
      
      // A página de conclusão lidará com a mensagem de "Verifique seu E-mail"
    } catch (error: any) {
      console.error('[Onboarding] Erro ao disparar cadastro:', error);
      this.isSaving = false;
      this.step = 'link';
      this.flipAngle += 180;
      alert('Houve um problema ao processar seu cadastro. Verifique seu e-mail e tente novamente.');
    }
  }
}
