import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SecurityService } from '../../services/security.service';

interface Comissao {
  id: string;
  evento_id: string;
  profissional_id: string;
  profissional_nome: string;
  servico_nome: string;
  valor_servico: number;
  taxa_aplicada: number;
  tipo_comissao: 'percentual' | 'fixo';
  valor_comissao: number;
  data_evento: string;
  status: 'pendente' | 'pago' | 'estornado';
}

@Component({
  selector: 'app-admin-comissoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-comissoes.html',
  styleUrl: './admin-comissoes.css'
})
export class AdminComissoes implements OnInit {
  private supabase = inject(SupabaseService).client;
  private estabService = inject(EstabelecimentoService);
  private security = inject(SecurityService);

  comissoes: Comissao[] = [];
  isLoading = true;
  filtroProfissional: string = '';
  filtroStatus: string = 'todos';
  
  // Dashboard Metrics
  totalAberto = 0;
  totalPago = 0;

  async ngOnInit() {
    this.estabService.activeId$.subscribe(id => {
      if (id) {
        this.fetchComissoes(id);
      }
    });
  }

  async fetchComissoes(estabId: string) {
    this.isLoading = true;
    try {
      const { data, error } = await this.supabase
        .from('comissoes')
        .select(`
          id, evento_id, valor_servico, taxa_aplicada, tipo_comissao, valor_comissao, status, created_at,
          agenda_events!inner(start, title),
          profissionais!inner(id, nome),
          servicos(titulo)
        `)
        .eq('estabelecimento_id', estabId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comissoes', error);
        return;
      }

      const raw = data || [];
      this.comissoes = await Promise.all(raw.map(async (c: any) => ({
        id: c.id,
        evento_id: c.evento_id,
        profissional_id: c.profissionais.id,
        profissional_nome: c.profissionais.nome,
        servico_nome: c.servicos?.titulo || 'Serviço',
        valor_servico: c.valor_servico,
        taxa_aplicada: c.taxa_aplicada,
        tipo_comissao: c.tipo_comissao,
        valor_comissao: c.valor_comissao,
        status: c.status,
        data_evento: c.agenda_events?.start
      })));

      this.calcularTotais();
    } catch (err) {
      console.error(err);
    } finally {
      this.isLoading = false;
    }
  }

  calcularTotais() {
    this.totalAberto = this.comissoes
      .filter(c => c.status === 'pendente')
      .reduce((acc, c) => acc + c.valor_comissao, 0);
      
    this.totalPago = this.comissoes
      .filter(c => c.status === 'pago')
      .reduce((acc, c) => acc + c.valor_comissao, 0);
  }

  get comissoesFiltradas() {
    return this.comissoes.filter(c => {
      const matchStatus = this.filtroStatus === 'todos' || c.status === this.filtroStatus;
      const matchProf = !this.filtroProfissional || c.profissional_nome.toLowerCase().includes(this.filtroProfissional.toLowerCase());
      return matchStatus && matchProf;
    });
  }

  async pagarComissao(comissao: Comissao) {
    if (comissao.status === 'pago') return;
    
    comissao.status = 'pago'; // Optimistic update
    this.calcularTotais();

    await this.supabase
      .from('comissoes')
      .update({ status: 'pago' })
      .eq('id', comissao.id);
  }

  async estornarComissao(comissao: Comissao) {
    if (comissao.status === 'estornado') return;
    
    comissao.status = 'estornado';
    this.calcularTotais();

    await this.supabase
      .from('comissoes')
      .update({ status: 'estornado' })
      .eq('id', comissao.id);
  }
}
