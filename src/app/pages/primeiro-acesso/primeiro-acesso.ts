import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./primeiro-acesso.css']
})
export class PrimeiroAcesso implements OnInit {
  private auth = inject(AuthService);
  private profSvc = inject(ProfissionaisService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  fase: 'senha' | 'tour' = 'senha';
  pass1 = '';
  pass2 = '';
  nomeCorreto = '';
  isSaving = false;
  erro = '';
  animateName = true;

  tourStep = 1;
  userRole = '';
  userName = '';
  displayName = '...';
  private nameInterval: any;
  private randomNames = ['Ricardo', 'Aline', 'Júlia', 'Marcos', 'Fernanda', 'Gabriel', 'Beatriz', 'Tiago', 'Rafael', 'Sofia'];
  private tourImages = [
    'onboarding_step_1_vision_1775438457636.png',
    'onboarding_step_2_strategy_1775438483587.png',
    'onboarding_step_3_team_1775438497223.png',
    'onboarding_step_4_success_1775438510413.png'
  ];

  ngOnInit() {
    this.auth.userProfile$.subscribe(profile => {
      if (profile) {
        this.userRole = profile.role;
        
        // Se o nome vier criptografado (base64 ou hash longo), limpamos para o usuário preencher
        if (profile.nome && (profile.nome.length > 30 || profile.nome.includes('==') || profile.nome.includes('+'))) {
          this.userName = '';
          this.nomeCorreto = '';
        } else {
          this.nomeCorreto = profile.nome;
          this.displayName = profile.nome;
        }

        // Se não houver nome (vazio ou criptografado), inicia o carrossel de nomes
        if (!this.nomeCorreto && !this.nameInterval) {
          this.startNameCarousel();
        }
        
        // Se já concluiu e não é primeiro acesso, manda pro admin
        if (!profile.primeiro_acesso && profile.onboarding_concluido) {
          this.router.navigate(['/admin']);
        }
        
        // Se já definiu senha mas não viu o tour
        if (!profile.primeiro_acesso && !profile.onboarding_concluido) {
          this.fase = 'tour';
        }
      }
    });
  }

  async confirmarSenha() {
    if (!this.pass1 || this.pass1.length < 6) {
      this.erro = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    if (this.pass1 !== this.pass2) {
      this.erro = 'As senhas não coincidem.';
      return;
    }
    if (!this.nomeCorreto || this.nomeCorreto.trim().length < 3) {
      this.erro = 'Por favor, informe seu nome real.';
      return;
    }

    this.isSaving = true;
    this.erro = '';
    this.cdr.detectChanges(); // Garante o feedback visual imediato

    try {
      // 1. Tentar atualizar a senha primeiro (o ponto mais sensível)
      await this.profSvc.atualizarSenha(this.pass1);
      
      const profile = this.auth.userProfileValue;
      if (profile) {
        // 2. Se a senha passou, atualizamos os dados do perfil
        const updateData: any = { primeiro_acesso: false };
        if (this.nomeCorreto && this.nomeCorreto !== profile.nome) {
          updateData.nome = this.nomeCorreto;
        }
        
        await this.profSvc.atualizarProfissional(profile.id, updateData);
        
        // 3. Força a mudança de fase e atualiza a UI
        this.fase = 'tour';
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    } catch (e: any) {
      console.error('[PrimeiroAcesso] Falha na ativação:', e);
      this.erro = e.message || 'Erro inesperado ao definir senha. Tente uma senha mais forte.';
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  async finalizarTour() {
    try {
      await this.profSvc.finalizarOnboarding();
      this.router.navigate(['/admin']);
    } catch (e: any) {
      this.erro = 'Erro ao finalizar: ' + e.message;
    }
  }

  getStepContent() {
    const contents: any = {
      dono: [
        { t: 'Visão Enterprise', d: 'Bem-vindo ao comando estratégico da sua unidade de luxo.' },
        { t: 'Gestão 360°', d: 'Monitore KPIs, faturamento e performance da equipe em tempo real.' },
        { t: 'Expansão', d: 'Configure serviços, unidades e sub-contas administrativas agora mesmo.' },
        { t: 'Decolagem', d: 'Sua plataforma está pronta para escalar sua rentabilidade. Vamos lá!' }
      ],
      barbeiro: [
        { t: 'Sua Agenda de Elite', d: 'Bem-vindo. Aqui sua produtividade encontra a organização.' },
        { t: 'Foco no Cliente', d: 'Acesse seus agendamentos, preferências e histórico de serviços.' },
        { t: 'Meus Ganhos', d: 'Veja suas comissões e metas acumuladas de forma clara e justa.' },
        { t: 'Pronto para o Corte', d: 'Sua cadeira está virtualmente pronta. Comece agora!' }
      ],
      financeiro: [
        { t: 'Controle de Fluxo', d: 'Bem-vindo ao centro de inteligência financeira da empresa.' },
        { t: 'Auditoria Ágil', d: 'Gerencie entradas, saídas e fechamentos de dia com precisão.' },
        { t: 'Comissões', d: 'Calcule e valide repasses de forma automatizada e segura.' },
        { t: 'Estabilidade', d: 'Os números estão em suas mãos. Inicie seu controle!' }
      ]
    };

    const role = (this.userRole === 'dono' || this.userRole === 'financeiro') ? this.userRole : 'barbeiro';
    return (contents[role] || contents['barbeiro'])[this.tourStep - 1];
  }

  getStepImage() {
    return this.tourImages[this.tourStep - 1] || this.tourImages[0];
  }

  proximo() { if (this.tourStep < 4) this.tourStep++; else this.finalizarTour(); }
  voltar() { if (this.tourStep > 1) this.tourStep--; }

  private startNameCarousel() {
    if (this.nameInterval) clearInterval(this.nameInterval);
    let idx = 0;
    this.nameInterval = setInterval(() => {
      if (this.nomeCorreto) {
        this.displayName = this.nomeCorreto;
        this.cdr.detectChanges();
        clearInterval(this.nameInterval);
      } else {
        this.animateName = false;
        this.cdr.detectChanges();
        
        setTimeout(() => {
          this.displayName = this.randomNames[idx];
          idx = (idx + 1) % this.randomNames.length;
          this.animateName = true;
          this.cdr.detectChanges();
        }, 10);
      }
    }, 1500);
  }

  onNameChange() {
    if (this.nomeCorreto) {
      this.displayName = this.nomeCorreto;
      if (this.nameInterval) clearInterval(this.nameInterval);
    }
  }
}
