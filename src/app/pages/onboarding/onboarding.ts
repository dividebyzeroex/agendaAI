import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EstabelecimentoService, Estabelecimento } from '../../services/estabelecimento.service';
import { SEGMENTO_OPTIONS } from '../../services/segmento-config.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';
import { SupabaseService } from '../../services/supabase.service';
import { AuthService } from '../../services/auth.service';
import { signupErrorMessage } from '../../core/signup-guardrails';


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
  private readFlag(key:string):boolean {
    try{return localStorage.getItem(key)==='true';}catch{return false;}
  }
  termsAccepted = this.readFlag('ag_terms_accepted');
  marketingConsent = this.readFlag('ag_marketing_consent');
  errorMessage = '';
  completed = false;

  // Estado do wizard
  slugEdited=false;
  isSaving = false;

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
    let chosenSegment:string|null=null;
    try{chosenSegment=localStorage.getItem('ag_signup_segment');}catch{}
    if(chosenSegment&&this.segmentOptions.some(s=>s.value===chosenSegment))this.form.segmento=chosenSegment;
    try { const draft=JSON.parse(localStorage.getItem('ag_temp_onboarding_data')||'{}'); if (draft.email === user?.email) this.form={...this.form,...draft,email:user?.email||''}; } catch {}
    this.cdr.markForCheck();
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
    if (this.form.nome&&!this.slugEdited) {
      this.form.slug = EstabelecimentoPublicoService.slugify(this.form.nome);
    }
  }

  /** Commercial enrolment/Hotmart enrichment is never a prerequisite for opening an account. */
  private async finishOptionalIntegrations(token: string): Promise<void> {
    const authHeaders={Authorization:`Bearer ${token}`};
    const signal=AbortSignal.timeout(3500);
    const tasks=[
      fetch('/api/commercial?action=enroll',{
        method:'POST',signal,
        headers:{...authHeaders,'Content-Type':'application/json'},
        body:JSON.stringify({termsAccepted:true,marketingConsent:this.marketingConsent})
      }).then(r=>{if(!r.ok)throw Error('commercial integration pending');}),
      fetch('/api/hotmart-activate',{
        method:'POST',signal,headers:authHeaders
      }).then(r=>{if(!r.ok && r.status!==503)throw Error('license integration pending');})
    ];
    const results=await Promise.allSettled(tasks);
    if(results.some(r=>r.status==='rejected'))
      console.warn('AgendaAI: integrações de cadastro pendentes; o espaço permanece criado.');
  }

  async continuarAcesso(): Promise<void> {
    if(!this.completed || this.isSaving)return;
    this.isSaving=true;
    try { await this.authService.redirectAfterLogin(); }
    catch {this.errorMessage='Seu espaço já foi criado. Entre novamente com o mesmo e-mail para continuar.';}
    finally {this.isSaving=false;this.cdr.markForCheck();}
  }

  async finalizar() {
    if (this.isSaving || this.completed) return;
    if(!this.form.nome.trim()||!this.form.segmento||!this.form.telefone.trim()||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(this.form.slug)){
      this.errorMessage='Confira nome, tipo de negócio, telefone e link de reservas.';return;
    }
    if (!this.termsAccepted) {
      this.errorMessage='Aceite as condições para iniciar o teste.';return;
    }
    this.isSaving=true;
    this.errorMessage='';
    let created=false;
    try {
      const {data:{session}}=await this.supabase.auth.getSession();
      if(!session) {
        this.errorMessage='Sua sessão expirou. Entre novamente para continuar com os dados já preenchidos.';
        return;
      }
      // Idempotent recovery: if a previous attempt created the tenant but
      // failed to navigate/enrol, do not insert a duplicate business.
      const {data:existing,error}=await this.supabase.rpc('get_estabelecimento_by_user',{
        p_user_id:session.user.id
      });
      if(error)throw error;
      if(!existing?.length) {
        try {
          await this.estabService.createEstabelecimento({...this.form,onboarding_completo:true});
        } catch(createError) {
          // If another tab/connection completed the tenant insert, a failed
          // response must not become a second signup attempt.
          const recovered=await this.supabase.rpc('get_estabelecimento_by_user',{
            p_user_id:session.user.id
          });
          if(recovered.error || !recovered.data?.length) throw createError;
        }
      }
      created=true;
      this.completed=true;
      try {localStorage.removeItem('ag_temp_onboarding_data');}catch{}
      // Terms were explicitly accepted, and consent was already saved in
      // Auth user metadata. Commercial sync and license checks are best effort.
      try {
        await this.finishOptionalIntegrations(session.access_token);
      } catch { console.warn('AgendaAI: sincronização opcional indisponível.'); }
      try {await this.authService.redirectAfterLogin();}
      catch {
        this.errorMessage='Seu espaço foi criado! Se o painel não abrir, toque em "Abrir minha agenda" ou entre novamente.';
      }
    } catch(error:unknown) {
      if(created) {
        this.completed=true;
        this.errorMessage='Seu espaço já está pronto. Entre com o mesmo e-mail para continuar.';
      } else {
        const code=(error as {code?:string})?.code;
        const message=(error as Error)?.message||'';
        this.errorMessage=code==='23505'||/duplicate|slug.*already|link.*uso|já existe/i.test(message)
          ? 'Este link de reservas já está em uso. Escolha outro nome para o seu link.'
          : signupErrorMessage(error);
      }
    } finally {
      this.isSaving=false;
      this.cdr.markForCheck();
    }
  }
}
