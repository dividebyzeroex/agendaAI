import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EstabelecimentoService, Servico, Horario, Estabelecimento } from '../../services/estabelecimento.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';

@Component({
  selector: 'app-admin-configuracoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-configuracoes.html',
  styleUrls: ['./admin-configuracoes.css']
})
export class AdminConfiguracoes implements OnInit {
  public isLoadingService = inject(EstabelecimentoService);
  private estabelecimentoService = inject(EstabelecimentoService);

  estabelecimento: Estabelecimento = { nome: '' };
  servicos: Servico[] = [];
  horarios: Horario[] = [];

  activeTab: 'negocio' | 'servicos' | 'horarios' = 'negocio';
  isSaving = false;
  savedMsg = '';

  // New service form
  novoServico: Omit<Servico, 'id' | 'ativo'> = { titulo: '', descricao: '', preco: 0, duracao_min: 30, emoji: '✂️' };
  showNovoServico = false;

  ngOnInit() {
    this.estabelecimentoService.estabelecimento$.subscribe(e => { if (e) this.estabelecimento = { ...e }; });
    this.estabelecimentoService.servicos$.subscribe(s => (this.servicos = [...s]));
    this.estabelecimentoService.horarios$.subscribe(h => (this.horarios = [...h]));
  }

  setTab(t: typeof this.activeTab) { this.activeTab = t; }

  /** URL pública do portal de agendamento deste estabelecimento */
  get publicLink(): string {
    if (!this.estabelecimento?.nome) return '';
    const slug = EstabelecimentoPublicoService.slugify(this.estabelecimento.nome);
    return `${window.location.origin}/agendar/${slug}`;
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
    const slug = EstabelecimentoPublicoService.slugify(this.estabelecimento.nome);
    return `${window.location.origin}/pro/${slug}`;
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
    }
  }

  async adicionarServico() {
    if (!this.novoServico.titulo || this.novoServico.preco <= 0) return;
    try {
      await this.estabelecimentoService.addServico({ ...this.novoServico, ativo: true });
      this.novoServico = { titulo: '', descricao: '', preco: 0, duracao_min: 30, emoji: '✂️' };
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
