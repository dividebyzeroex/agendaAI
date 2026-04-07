import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QueryEngineService, QueryResult } from '../../services/query-engine.service';
import { SupabaseService } from '../../services/supabase.service';
import { ClienteService } from '../../services/cliente.service';
import { AgendaEventService } from '../../services/agenda-event.service';
import { Subscription, combineLatest } from 'rxjs';

interface Stats {
  faturamentoMes: number;
  agendamentosHoje: number;
  ticketMedio: number;
  clientesTotal: number;
  clientesNovos: number;
}

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-analytics.html',
  styleUrls: ['./admin-analytics.css']
})
export class AdminAnalytics implements OnInit, OnDestroy {
  queryEngine = inject(QueryEngineService);
  supabase    = inject(SupabaseService).client;
  clienteSvc  = inject(ClienteService);
  agendaSvc   = inject(AgendaEventService);

  userInput = '';
  lastResult: QueryResult | null = null;
  isQuerying = false;
  private sub = new Subscription();

  stats: Stats = {
    faturamentoMes: 0,
    agendamentosHoje: 0,
    ticketMedio: 0,
    clientesTotal: 0,
    clientesNovos: 0
  };
  isLoadingStats = true;

  ngOnInit() {
    // Escuta mudanças em agendamentos e clientes para atualizar métricas reativamente
    this.sub.add(
      combineLatest([
        this.agendaSvc.events$,
        this.clienteSvc.clientes$
      ]).subscribe(([events, clientes]) => {
        this.calculateStats(events, clientes);
      })
    );

    // Faturamento ainda requer consulta direta ao Caixa (ou um CaixaService no futuro)
    this.fetchFaturamento();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private calculateStats(events: any[], clientes: any[]) {
    const agora = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    // 🔗 Filtro de Autoridade (Hoje Local)
    const hCount = events.filter(e => {
        const start = new Date(e.start);
        return start.getFullYear() === agora.getFullYear() &&
               start.getMonth() === agora.getMonth() &&
               start.getDate() === agora.getDate();
    }).length;

    // Faturamento e Ticket Médio (Baseado nos Agendamentos - Real-time Fallback)
    // Isso garante que os 19 agendamentos resgatados apareçam no KPI agora mesmo
    const faturamentoReal = events.filter(e => {
        const start = new Date(e.start);
        return start.getMonth() === agora.getMonth() && 
               start.getFullYear() === agora.getFullYear() && 
               e.status !== 'cancelado';
    }).reduce((acc, curr) => acc + (curr.valor_total || 0), 0);

    const ticketReal = hCount > 0 ? faturamentoReal / hCount : 0;

    // Clientes (Deduplicados por telefone)
    const uniquePhones = new Set(clientes.filter(c => c.telefone).map(c => c.telefone));
    const cTotal = uniquePhones.size;
    
    const cNovos = clientes.filter(c => {
      if (!c.created_at || !c.telefone) return false;
      const isNew = new Date(c.created_at) >= trintaDiasAtras;
      return isNew;
    }).reduce((acc: Set<string>, curr: any) => acc.add(curr.telefone), new Set()).size;

    this.stats = {
      ...this.stats,
      faturamentoMes: faturamentoReal,
      ticketMedio: ticketReal,
      agendamentosHoje: hCount,
      clientesTotal: cTotal,
      clientesNovos: cNovos
    };
    this.isLoadingStats = false;
  }

  async fetchFaturamento() {
    try {
      const mesInicio = new Date();
      mesInicio.setDate(1);
      const mesInicioStr = mesInicio.toISOString().split('T')[0];

      const { data: faturamento } = await this.supabase
        .from('caixa_itens')
        .select('valor_total')
        .eq('status_caixa', 'pago')
        .gte('created_at', mesInicioStr);

      const total = (faturamento || []).reduce((acc: number, item: any) => acc + (item.valor_total || 0), 0);
      const ticket = faturamento && faturamento.length > 0 ? total / faturamento.length : 0;

      this.stats = {
        ...this.stats,
        faturamentoMes: total,
        ticketMedio: ticket
      };
    } catch (err) {
      console.error('[Analytics] Erro ao buscar faturamento:', err);
    }
  }

  async ask() {
    if (!this.userInput.trim()) return;
    this.isQuerying = true;
    this.lastResult = null;
    await new Promise(r => setTimeout(r, 400));
    this.lastResult = this.queryEngine.processQuery(this.userInput);
    this.isQuerying = false;
  }
}
