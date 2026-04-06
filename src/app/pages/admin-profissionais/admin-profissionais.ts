import { Component, inject, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfissionaisService, Profissional, ProfissionalCompleto, ProfissionalDisponibilidade } from '../../services/profissionais.service';
import { EstabelecimentoService, Servico } from '../../services/estabelecimento.service';
import { AuthService } from '../../services/auth.service';

type PanelTab = 'dados' | 'disponibilidade' | 'servicos' | 'financeiro';

const CORES_AGENDA = [
  '#1a73e8', '#a142f4', '#34a853', '#ea4335', '#f9ab00',
  '#00bcd4', '#ff6d00', '#e91e63', '#607d8b', '#795548',
];

@Component({
  selector: 'app-admin-profissionais',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-profissionais.html',
  styleUrls: ['./admin-profissionais.css'],
})
export class AdminProfissionais implements OnInit {
  private svc      = inject(ProfissionaisService);
  private estabSvc = inject(EstabelecimentoService);
  private authSvc  = inject(AuthService); // Novo injetor de autoridade
  private ngZone   = inject(NgZone);
  private cdr      = inject(ChangeDetectorRef);

  profissionais: ProfissionalCompleto[] = [];
  catalogoServicos: Servico[] = [];
  isLoading     = true;
  tabelasAusentes = false;

  // Estado do painel lateral
  panelAberto  = false;
  panelTab: PanelTab = 'dados';
  isSaving     = false;
  savedMsg     = '';
  erro         = '';
  isNovo       = true;

  // Profissional em edição
  profAtual!: ProfissionalCompleto;
  disponibilidades: ProfissionalDisponibilidade[] = [];

  // Serviço a adicionar
  servicoIdSelecionado = '';
  valorProprio: number | null = null;

  // Filtro
  filtro = '';
  coresAgenda = CORES_AGENDA;

  get profFiltrados() {
    if (!this.filtro.trim()) return this.profissionais;
    const q = this.filtro.toLowerCase();
    return this.profissionais.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      p.especialidade?.toLowerCase().includes(q)
    );
  }

  get currentUserRole(): string {
    return this.authSvc.userProfileValue?.role || 'barbeiro';
  }

  isDono(): boolean {
    return this.currentUserRole === 'dono';
  }

  countDonosAtivos(): number {
    return this.profissionais.filter(p => p.role === 'dono' && p.ativo).length;
  }

  ngOnInit() {
    this.svc.profissionais$.subscribe(data => {
      this.profissionais = data;
      this.isLoading = false;
      this.cdr.detectChanges();
    });
    this.svc.tabelasAusentes$.subscribe(v => {
      this.tabelasAusentes = v;
      this.cdr.detectChanges();
    });
    this.estabSvc.servicos$.subscribe(s => {
      this.catalogoServicos = s;
      this.cdr.detectChanges();
    });
  }


  // ─── Painel ────────────────────────────────────────────────

  abrirNovo() {
    this.isNovo   = true;
    this.panelTab = 'dados';
    this.erro     = '';
    this.profAtual = {
      nome: '', cargo: '', especialidade: '', bio: '', telefone: '', email: '',
      comissao_padrao: 0, instagram: '', linkedin: '',
      cor_agenda: '#1a73e8', valor_hora: 0, ativo: true,
      role: 'barbeiro',
      disponibilidades: [], servicos: [],
    };
    this.disponibilidades = this.svc.getDisponibilidadesPadrao();
    this.panelAberto = true;
  }

  abrirEditar(p: ProfissionalCompleto) {
    this.isNovo   = false;
    this.panelTab = 'dados';
    this.erro     = '';
    this.profAtual = { ...p };
    // Clona disponibilidades, preenche dias ausentes
    const diasExistentes = p.disponibilidades.map(d => d.dia_semana);
    const padrao = this.svc.getDisponibilidadesPadrao();
    this.disponibilidades = padrao.map(pad => {
      const existente = p.disponibilidades.find(d => d.dia_semana === pad.dia_semana);
      return existente ? { ...existente } : { ...pad };
    });
    this.panelAberto = true;
  }

  fecharPainel() { this.panelAberto = false; }

  setTab(t: PanelTab) { this.panelTab = t; }

  // ─── Salvar dados básicos ──────────────────────────────────

  async salvarDados() {
    if (!this.profAtual.nome.trim()) { this.erro = 'O nome é obrigatório.'; return; }
    this.isSaving = true; this.erro = '';
    try {
      if (this.isNovo) {
        const criado = await this.svc.criarProfissional(this.profAtual);
        this.ngZone.run(() => {
          this.profAtual = criado;
          this.isNovo = false;
          this.disponibilidades = this.svc.getDisponibilidadesPadrao();
          this.panelTab = 'disponibilidade';
          this.cdr.detectChanges();
        });
          this.showSuccess('Profissional criado! Configure a disponibilidade.');
      } else {
        // Regra: Apenas Dono altera outros Donos
        if (this.profAtual.role === 'dono' && !this.isDono()) {
          this.erro = 'Apenas administradores podem atribuir o cargo de Dono.';
          return;
        }

        // Regra: Impedir desativação do ÚLTIMO Dono
        const original = this.profissionais.find(p => p.id === this.profAtual.id);
        if (original?.role === 'dono' && this.profAtual.role !== 'dono' && this.countDonosAtivos() <= 1) {
          this.erro = 'Operação negada: A empresa deve ter ao menos 1 Dono ativo.';
          return;
        }

        await this.svc.atualizarProfissional(this.profAtual.id!, this.profAtual);
        this.showSuccess('Dados atualizados!');
      }
    } catch (e: any) { this.erro = e.message; }
    finally { this.isSaving = false; }
  }

  // ─── Salvar disponibilidade ────────────────────────────────

  async salvarDisponibilidade() {
    if (!this.profAtual.id) return;
    this.isSaving = true; this.erro = '';
    try {
      await this.svc.salvarDisponibilidades(this.profAtual.id, this.disponibilidades);
      this.ngZone.run(() => {
        this.panelTab = 'servicos';
        this.cdr.detectChanges();
      });
      this.showSuccess('Disponibilidade salva!');
    } catch (e: any) { this.erro = e.message; }
    finally { this.isSaving = false; }
  }

  // ─── Serviços ──────────────────────────────────────────────

  servicosVinculados(): any[] { return this.profAtual?.servicos || []; }

  servicosDisponiveis(): Servico[] {
    const vinculados = this.servicosVinculados().map((s: any) => s.servico_id);
    return this.catalogoServicos.filter(s => !vinculados.includes(s.id));
  }

  async adicionarServico() {
    if (!this.servicoIdSelecionado || !this.profAtual.id) return;
    this.isSaving = true;
    try {
      await this.svc.adicionarServico(
        this.profAtual.id,
        this.servicoIdSelecionado,
        this.valorProprio || undefined
      );
      // Recarrega o profissional atual
      const atualizado = this.svc.profissionais$.value.find(p => p.id === this.profAtual.id);
      if (atualizado) this.profAtual = { ...atualizado };
      this.servicoIdSelecionado = '';
      this.valorProprio = null;
      this.showSuccess('Serviço adicionado!');
    } catch (e: any) { this.erro = e.message; }
    finally { this.isSaving = false; }
  }

  async removerServico(id: string) {
    await this.svc.removerServico(id);
    const atualizado = this.svc.profissionais$.value.find(p => p.id === this.profAtual.id);
    if (atualizado) this.profAtual = { ...atualizado };
  }

  // ─── Ações da lista ────────────────────────────────────────

  async toggleAtivo(p: ProfissionalCompleto) {
    // Regra: Impedir desativação do ÚLTIMO Dono
    if (p.role === 'dono' && p.ativo && this.countDonosAtivos() <= 1) {
      alert('Operação bloqueada: Você é o único Dono ativo. A empresa não pode ficar sem administração.');
      return;
    }
    await this.svc.toggleAtivo(p.id!, !p.ativo);
  }

  confirmarDelete: string | null = null;
  async deletarProfissional(id: string) {
    if (this.confirmarDelete !== id) { this.confirmarDelete = id; return; }
    await this.svc.deletarProfissional(id);
    if (this.profAtual?.id === id) this.panelAberto = false;
    this.confirmarDelete = null;
  }

  cancelarDelete() { this.confirmarDelete = null; }

  // ─── UI helpers ────────────────────────────────────────────

  initiais(nome: string): string {
    return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  }

  diasAtivos(p: ProfissionalCompleto): string {
    return p.disponibilidades
      .filter(d => d.ativo)
      .map(d => d.dia_nome.slice(0, 3))
      .join(', ') || 'Sem disponibilidade';
  }

  private showSuccess(msg: string) {
    this.savedMsg = msg;
    setTimeout(() => (this.savedMsg = ''), 3000);
  }

  async salvarAtual() {
    this.erro = '';
    try {
      if (this.panelTab === 'dados') {
        await this.salvarDados();
      } else if (this.panelTab === 'disponibilidade') {
        await this.salvarDisponibilidade();
      } else if (this.panelTab === 'financeiro') {
        await this.svc.atualizarProfissional(this.profAtual.id!, this.profAtual);
        this.showSuccess('Dados financeiros salvos!');
        setTimeout(() => this.fecharPainel(), 1000);
      }
    } catch (e: any) {
      this.erro = 'Erro ao salvar: ' + e.message;
    }
  }
}
