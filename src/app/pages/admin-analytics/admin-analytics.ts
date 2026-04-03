import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QueryEngineService, QueryResult } from '../../services/query-engine.service';
import { SupabaseService } from '../../services/supabase.service';

interface Stats {
  faturamentoMes: number;
  agendamentosHoje: number;
  ticketMedio: number;
  clientesNovos: number;
}

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-analytics.html',
  styleUrls: ['./admin-analytics.css']
})
export class AdminAnalytics implements OnInit {
  queryEngine = inject(QueryEngineService);
  supabase    = inject(SupabaseService).client;

  userInput = '';
  lastResult: QueryResult | null = null;
  isQuerying = false;

  stats: Stats = {
    faturamentoMes: 0,
    agendamentosHoje: 0,
    ticketMedio: 0,
    clientesNovos: 0
  };
  isLoadingStats = true;

  async ngOnInit() {
    await this.fetchStats();
  }

  async fetchStats() {
    this.isLoadingStats = true;
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const mesInicio = new Date();
      mesInicio.setDate(1);
      const mesInicioStr = mesInicio.toISOString().split('T')[0];

      // 1. Agendamentos Hoje
      const { count: hCount } = await this.supabase
        .from('agenda_events')
        .select('*', { count: 'exact', head: true })
        .gte('start', `${hoje}T00:00:00`)
        .lte('start', `${hoje}T23:59:59`);

      // 2. Faturamento Mês (Pagos)
      const { data: faturamento } = await this.supabase
        .from('caixa_itens')
        .select('valor_total')
        .eq('status_caixa', 'pago')
        .gte('created_at', mesInicioStr);

      const total = (faturamento || []).reduce((acc: number, item: any) => acc + (item.valor_total || 0), 0);
      const ticket = faturamento && faturamento.length > 0 ? total / faturamento.length : 0;

      // 3. Clientes Novos (30 dias)
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
      const { count: cCount } = await this.supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', trintaDiasAtras.toISOString());

      this.stats = {
        agendamentosHoje: hCount || 0,
        faturamentoMes: total,
        ticketMedio: ticket,
        clientesNovos: cCount || 0
      };
    } catch (err) {
      console.error('[Analytics] Erro ao buscar stats:', err);
    } finally {
      this.isLoadingStats = false;
    }
  }

  async ask() {
    if (!this.userInput.trim()) return;
    this.isQuerying = true;
    this.lastResult = null;
    // Small timeout to feel responsive
    await new Promise(r => setTimeout(r, 400));
    this.lastResult = this.queryEngine.processQuery(this.userInput);
    this.isQuerying = false;
  }
}
