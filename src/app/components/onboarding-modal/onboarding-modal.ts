import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OnboardingService } from '../../services/onboarding.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SupabaseService } from '../../services/supabase.service';

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

  tiposNegocio = [
    { label: '💈 Barbearia', value: 'barbearia' },
    { label: '💅 Salão de Beleza', value: 'salao' },
    { label: '🐾 Pet Shop', value: 'petshop' },
    { label: '🦷 Clínica Odontológica', value: 'clinica_odonto' },
    { label: '🏥 Clínica Médica', value: 'clinica_medica' },
    { label: '💆 Estética', value: 'estetica' },
    { label: '🔧 Assistência Técnica', value: 'assistencia' },
    { label: '📋 Outro', value: 'outro' }
  ];

  // Serviços
  servicos: ServicoInput[] = [
    { emoji: '✂️', titulo: '', descricao: '', preco: 0, duracao_min: 30 }
  ];

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
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Usuário não encontrado');

      // 1. Salvar dados do estabelecimento
      await this.supabase
        .from('estabelecimento')
        .update({
          nome: this.nomeNegocio,
          cidade: this.cidadeNegocio,
          telefone: this.telefoneNegocio
        })
        .eq('user_id', user.id);

      // 2. Salvar serviços (apenas os que têm título e preço)
      const servicosValidos = this.servicos
        .filter(s => s.titulo.trim() && s.preco > 0)
        .map(s => ({ ...s, ativo: true }));

      if (servicosValidos.length > 0) {
        await this.supabase.from('servicos').insert(servicosValidos);
      }

      // 3. Salvar horários de funcionamento
      const horariosParaSalvar = this.horarios.map(h => ({
        dia_semana: h.dia_semana,
        dia_nome: h.dia_nome,
        abre: h.ativo ? h.abre : null,
        fecha: h.ativo ? h.fecha : null,
        ativo: h.ativo
      }));

      // Delete existing and re-insert
      await this.supabase.from('horarios_funcionamento').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await this.supabase.from('horarios_funcionamento').insert(horariosParaSalvar);

      // 4. Marcar onboarding como completo (flag)
      await this.onboardingService.completeOnboarding();

      this.step = 'conclusao';
    } catch (e) {
      console.error('Onboarding error:', e);
    } finally {
      this.isSaving = false;
    }
  }

  dismiss() {
    this.onboardingService.showOnboarding$.next(false);
  }
}
