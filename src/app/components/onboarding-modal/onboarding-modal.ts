import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OnboardingService } from '../../services/onboarding.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';
import { SegmentoConfigService, SEGMENTO_OPTIONS } from '../../services/segmento-config.service';

type OnboardingStep = 'boas_vindas' | 'negocio' | 'servicos' | 'horarios' | 'conclusao';

interface ServicoInput {
  emoji: string;
  titulo: string;
  descricao: string;
  preco: number;
  duracao_min: number;
}

interface HorarioInput {
  dia_semana: number;
  dia_nome: string;
  abre: string;
  fecha: string;
  ativo: boolean;
}

@Component({
  selector: 'app-onboarding-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding-modal.html',
  styleUrls: ['./onboarding-modal.css']
})
export class OnboardingModalComponent implements OnInit {
  private cdr=inject(ChangeDetectorRef);
  errorMessage='';
  private onboardingService = inject(OnboardingService);
  private estabService = inject(EstabelecimentoService);
  private supabase = inject(SupabaseService).client;

  step: OnboardingStep = 'boas_vindas';
  isSaving = false;
  userEmail = '';

  // Negócio
  nomeNegocio = '';
  cidadeNegocio = '';
  telefoneNegocio = '';
  tipoNegocio = '';

  tiposNegocio = SEGMENTO_OPTIONS.map(s => ({ label: `${s.icon} ${s.label}`, value: s.value }));

  // Serviços
  servicos: ServicoInput[] = [
    { emoji: '📋', titulo: '', descricao: '', preco: 0, duracao_min: 30 }
  ];

  /** Quando o usuário seleciona um tipo de negócio, pré-popula serviços sugeridos */
  onTipoNegocioChange() {
    if (this.tipoNegocio) {
      const config = SegmentoConfigService.forSegmento(this.tipoNegocio);
      if (config.servicosSugeridos.length > 0) {
        this.servicos = config.servicosSugeridos.map(s => ({ ...s }));
      }
    }
  }

  // Horários
  horarios: HorarioInput[] = [
    { dia_semana: 0, dia_nome: 'Domingo', abre: '', fecha: '', ativo: false },
    { dia_semana: 1, dia_nome: 'Segunda-feira', abre: '09:00', fecha: '18:00', ativo: true },
    { dia_semana: 2, dia_nome: 'Terça-feira', abre: '09:00', fecha: '18:00', ativo: true },
    { dia_semana: 3, dia_nome: 'Quarta-feira', abre: '09:00', fecha: '18:00', ativo: true },
    { dia_semana: 4, dia_nome: 'Quinta-feira', abre: '09:00', fecha: '18:00', ativo: true },
    { dia_semana: 5, dia_nome: 'Sexta-feira', abre: '09:00', fecha: '19:00', ativo: true },
    { dia_semana: 6, dia_nome: 'Sábado', abre: '09:00', fecha: '16:00', ativo: true }
  ];

  readonly steps: OnboardingStep[] = ['boas_vindas', 'negocio', 'servicos', 'horarios', 'conclusao'];

  get stepIndex(): number { return this.steps.indexOf(this.step); }
  get progress(): number { return (this.stepIndex / (this.steps.length - 1)) * 100; }

  async ngOnInit() {
    const { data: { user } } = await this.supabase.auth.getUser();
    this.userEmail = user?.email || '';
  }

  nextStep() {
    const idx = this.stepIndex;
    if (idx < this.steps.length - 1) this.step = this.steps[idx + 1];
  }

  prevStep() {
    const idx = this.stepIndex;
    if (idx > 0) this.step = this.steps[idx - 1];
  }

  addServico() {
    this.servicos.push({ emoji: '⭐', titulo: '', descricao: '', preco: 0, duracao_min: 30 });
  }

  removeServico(i: number) {
    if (this.servicos.length > 1) this.servicos.splice(i, 1);
  }

  get canNextNegocio(): boolean {
    return !!this.nomeNegocio.trim() && !!this.tipoNegocio;
  }

  get canNextServicos(): boolean {
    return this.servicos.some(s => s.titulo.trim() && s.preco > 0);
  }

  get horariosAtivos(): HorarioInput[] {
    return this.horarios.filter(h => h.ativo);
  }

  async finalizarOnboarding() {
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMessage='';
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Usuário não encontrado');

      await this.estabService.fetchEstabelecimento();
      const id=this.estabService.estabelecimento$.value?.id;
      if(!id)throw new Error('Estabelecimento não encontrado. Atualize a página.');
      const services=this.servicos.filter(s=>s.titulo.trim()&&s.preco>0);
      const {error}=await this.supabase.rpc('configure_client_setup',{p_id:id,p_changes:{nome:this.nomeNegocio,cidade:this.cidadeNegocio,telefone:this.telefoneNegocio,segmento:this.tipoNegocio},p_services:services,p_hours:this.horarios});
      if(error)throw error;
      await this.estabService.refreshCurrent();
      await this.onboardingService.completeOnboarding();
      this.step = 'conclusao';
    } catch (e) {
      this.errorMessage=e instanceof Error?e.message:'Não foi possível salvar. Confira os dados e tente novamente.';
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  dismiss() {
    this.onboardingService.showOnboarding$.next(false);
  }
}
