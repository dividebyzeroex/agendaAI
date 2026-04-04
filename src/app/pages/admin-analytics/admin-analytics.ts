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
    const hoje = new Date().toISOString().split('T')[0];
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    // 1. Agendamentos Hoje
    const hCount = events.filter(e => e.start.startsWith(hoje)).length;

    // 2. Clientes Total e Novos (Deduplicados por telefone para evitar contagem de registros de teste/duplicados)
    const uniquePhones = new Set(clientes.filter(c => c.telefone).map(c => c.telefone));
    const cTotal = uniquePhones.size;
    
    const cNovos = clientes.filter(c => {
      if (!c.created_at || !c.telefone) return false;
      // Contar também apenas únicos nos novos
      const isNew = new Date(c.created_at) >= trintaDiasAtras;
      return isNew;
    }).reduce((acc: Set<string>, curr: any) => acc.add(curr.telefone), new Set()).size;

    this.stats = {
      ...this.stats,
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
