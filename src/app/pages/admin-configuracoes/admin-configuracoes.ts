import { Component, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute,RouterLink } from '@angular/router';
import { EstabelecimentoService, Servico, Horario, Estabelecimento } from '../../services/estabelecimento.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';

@Component({
  selector: 'app-admin-configuracoes',
  standalone: true,
  imports: [CommonModule, FormsModule,RouterLink],
  templateUrl: './admin-configuracoes.html',
  styleUrls: ['./admin-configuracoes.css']
})
export class AdminConfiguracoes implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  public isLoadingService = inject(EstabelecimentoService);
  private estabelecimentoService = inject(EstabelecimentoService);
  segmentoConfig = inject(SegmentoConfigService);

  estabelecimento: Estabelecimento = { nome: '' };
  servicos: Servico[] = [];
  horarios: Horario[] = [];

  activeTab: 'negocio' | 'servicos' | 'horarios' | 'fidelidade' = 'negocio';
  isSaving = false;
  savedMsg = '';

  // New service form
  novoServico: Omit<Servico, 'id' | 'ativo'> = { titulo: '', descricao: '', preco: 0, duracao_min: 30, emoji: '✂️' };
  showNovoServico = false;

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params=>{const tab=params.get('tab');if(tab==='servicos'||tab==='horarios'||tab==='negocio'||tab==='fidelidade')this.activeTab=tab;this.cdr.markForCheck();});
    this.estabelecimentoService.estabelecimento$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e) {
        this.estabelecimento = { ...e };
        if (!this.estabelecimento.config_fidelidade) {
          this.estabelecimento.config_fidelidade = { ativo: false, visitas_meta: 10, desconto_percentual: 15 };
        }
      }
      this.novoServico.emoji = this.segmentoConfig.current.emojiPadrao;
      this.cdr.markForCheck();
    });
    this.estabelecimentoService.servicos$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => { this.servicos = [...s]; this.cdr.markForCheck(); });
    this.estabelecimentoService.horarios$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(h => { this.horarios = [...h]; this.cdr.markForCheck(); });
  }

  setTab(t: typeof this.activeTab) { this.activeTab = t; }

  /** URL pública do portal de agendamento deste estabelecimento */
  get publicLink(): string {
    if (!this.estabelecimento?.nome) return '';
    const slug = this.estabelecimento.slug;
    return slug ? `${window.location.origin}/agendar/${encodeURIComponent(slug)}` : '';
  }

  linkCopiado = false;
  async copiarLink() {
    if (!this.publicLink) return;
    await navigator.clipboard.writeText(this.publicLink);
    this.linkCopiado = true;
    setTimeout(() => this.linkCopiado = false, 2500);
  }

  /** URL do portal do profissional (para compartilhar com a equipe) */
  get proLink(): string {
    if (!this.estabelecimento?.nome) return '';
    return `${window.location.origin}/login`;
  }

  proLinkCopiado = false;
  async copiarProLink() {
    if (!this.proLink) return;
    await navigator.clipboard.writeText(this.proLink);
    this.proLinkCopiado = true;
    setTimeout(() => this.proLinkCopiado = false, 2500);
  }

  async salvarEstabelecimento() {
    this.isSaving = true;
    try {
      await this.estabelecimentoService.updateEstabelecimento(this.estabelecimento);
      this.showSuccessMsg('Dados salvos com sucesso!');
    } catch (e: any) {
      this.showSuccessMsg('Erro ao salvar: ' + e.message);
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  async adicionarServico() {
    if (!this.novoServico.titulo || this.novoServico.preco <= 0) return;
    try {
      await this.estabelecimentoService.addServico({ ...this.novoServico, ativo: true });
      this.novoServico = { titulo: '', descricao: '', preco: 0, duracao_min: 30, emoji: this.segmentoConfig.current.emojiPadrao };
      this.showNovoServico = false;
      this.showSuccessMsg('Serviço adicionado!');
    } catch (e: any) {
      this.showSuccessMsg('Erro: ' + e.message);
    }
  }

  async removerServico(id: string) {
    await this.estabelecimentoService.deleteServico(id);
    this.showSuccessMsg('Serviço removido!');
  }

  async salvarHorario(horario: Horario) {
    if (!horario.id) return;
    await this.estabelecimentoService.updateHorario(horario.id, horario);
    this.showSuccessMsg('Horário atualizado!');
  }

  private showSuccessMsg(msg: string) {
    this.savedMsg = msg;
    setTimeout(() => (this.savedMsg = ''), 3000);
  }
}
