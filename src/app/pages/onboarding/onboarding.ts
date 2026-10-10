import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EstabelecimentoService, Estabelecimento } from '../../services/estabelecimento.service';
import { SEGMENTO_OPTIONS } from '../../services/segmento-config.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';
import { SupabaseService } from '../../services/supabase.service';
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
  private cdr=inject(ChangeDetectorRef);
  public bookingOrigin=window.location.origin+'/agendar/';
  private router = inject(Router);
  private supabase = inject(SupabaseService).client;
  termsAccepted = localStorage.getItem('ag_terms_accepted') === 'true';
  marketingConsent = localStorage.getItem('ag_marketing_consent') === 'true';
  errorMessage = '';
  completed = false;

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

  segmentOptions = SEGMENTO_OPTIONS;

  volumeOptions = [
    { label: 'Começando', value: 'iniciante', desc: 'Até 50 / mês' },
    { label: 'Crescendo', value: 'intermediario', desc: '51 a 200 / mês' },
    { label: 'Alto Volume', value: 'avanzado', desc: '200+ / mês' }
  ];

  suggestedColors = ['#6366f1', '#a142f4', '#10b981', '#f43f5e', '#facc15', '#0f172a'];

  async ngOnInit() {
    const {data:{user}} = await this.supabase.auth.getUser();
    if (user?.email) this.form.email=user.email;
    try { const draft=JSON.parse(localStorage.getItem('ag_temp_onboarding_data')||'{}'); this.form={...this.form,...draft,email:user?.email||''}; } catch {}
    // Recupera o email vindo da tela de cadastro de login
    const savedEmail = '';
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
    if (!this.termsAccepted) { this.errorMessage='Aceite as condições para iniciar o teste.'; return; }
    this.isSaving=true; this.errorMessage='';
    try {
      const {data:{session}}=await this.supabase.auth.getSession();
      if(!session)throw new Error('Sua sessão expirou. Entre novamente.');
      // Save acceptance before creating a tenant; retrying never starts a second trial.
      const response=await fetch('/api/commercial?action=enroll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({termsAccepted:true,marketingConsent:this.marketingConsent})});
      if(!response.ok)throw new Error('Não foi possível registrar o aceite. Tente novamente.');
      const {data:existing,error}=await this.supabase.rpc('get_estabelecimento_by_user',{p_user_id:session.user.id});
      if(error)throw error;
      if(!existing?.length) await this.estabService.createEstabelecimento({...this.form,onboarding_completo:true});
      // Connect the newly created tenant to its explicitly consented commercial journey.
      const enrolled=await fetch('/api/commercial?action=enroll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({termsAccepted:true,marketingConsent:this.marketingConsent})});
      if(!enrolled.ok)throw new Error('Empresa criada; não foi possível concluir o cadastro comercial. Tente novamente.');
      localStorage.removeItem('ag_temp_onboarding_data');
      this.completed=true;
      await this.authService.redirectAfterLogin();
    } catch(error) { this.errorMessage=error instanceof Error?error.message:'Não foi possível concluir o cadastro.'; }
    finally { this.isSaving=false; this.cdr.markForCheck(); }
  }
}
