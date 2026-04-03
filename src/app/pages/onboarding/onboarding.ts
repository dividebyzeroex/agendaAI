import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EstabelecimentoService, Estabelecimento } from '../../services/estabelecimento.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';

type Step = 'identidade' | 'marca' | 'contato' | 'conclusao';

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
  private router       = inject(Router);

  // Estado do wizard
  step: Step = 'identidade';
  isSaving = false;

  // Dados do form
  form: Partial<Estabelecimento> = {
    nome: '',
    slug: '',
    descricao: '',
    cor_primaria: '#1a73e8',
    telefone: '',
    endereco: '',
    cidade: ''
  };

  // Cores sugeridas
  suggestedColors = ['#1a73e8', '#a142f4', '#34a853', '#ea4335', '#202124', '#fbbc04'];

  ngOnInit() {
    this.estabService.estabelecimento$.subscribe(e => {
      if (e) {
        // Se já está completo, pula pro admin? 
        // Não, permite o dono ver se quiser, ou redireciona se já marcaram completado.
        if (e.onboarding_completo) {
          // this.router.navigate(['/admin']);
        }
      }
    });

    // Auto-generate slug from name
  }

  onNameChange() {
    if (this.form.nome) {
      this.form.slug = EstabelecimentoPublicoService.slugify(this.form.nome);
    }
  }

  // Navegação
  next() {
    const steps: Step[] = ['identidade', 'marca', 'contato', 'conclusao'];
    const idx = steps.indexOf(this.step);
    if (idx < steps.length - 1) {
      if (this.step === 'contato') {
        this.finalizar();
      } else {
        this.step = steps[idx + 1];
      }
    }
  }

  back() {
    const steps: Step[] = ['identidade', 'marca', 'contato'];
    const idx = steps.indexOf(this.step);
    if (idx > 0) this.step = steps[idx - 1];
  }

  async finalizar() {
    this.isSaving = true;
    this.step = 'conclusao';

    try {
      await this.estabService.updateEstabelecimento({
        ...this.form,
        onboarding_completo: true
      });

      // Simula uma pequena carga "WOW"
      await new Promise(r => setTimeout(r, 2000));
      
      this.router.navigate(['/admin']);
    } catch (e) {
      console.error('[Onboarding] Erro ao finalizar:', e);
      this.isSaving = false;
      this.step = 'contato';
      alert('Ocorreu um erro ao salvar suas configurações. Tente novamente.');
    }
  }
}
