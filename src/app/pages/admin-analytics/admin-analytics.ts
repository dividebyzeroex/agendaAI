import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
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
  private estService = inject(EstabelecimentoService);
  financialError = false;
  supabase    = inject(SupabaseService).client;
  clienteSvc  = inject(ClienteService);
  agendaSvc   = inject(AgendaEventService);

  userInput = '';
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

    this.stats = {
      ...this.stats,
      agendamentosHoje: hCount,
      clientesTotal: clientes.length,
      clientesNovos: clientes.filter(c => c.created_at && new Date(c.created_at) >= trintaDiasAtras).length
    };
    this.isLoadingStats = false;
  }

  async fetchFaturamento() {
    try {
      await this.estService.fetchEstabelecimento();
      const tenantId = this.estService.estabelecimento$.value?.id;
      if (!tenantId) throw new Error('Estabelecimento indisponível.');
      const mesInicio = new Date();
      mesInicio.setDate(1); mesInicio.setHours(0,0,0,0);
      const mesInicioStr = mesInicio.toISOString();

      const { data: faturamento, error } = await this.supabase
        .from('caixa_itens')
        .select('valor_total')
        .eq('estabelecimento_id', tenantId)
        .eq('status_caixa', 'pago')
        .gte('created_at', mesInicioStr);

      if (error) throw error;
      this.financialError = false;
      const total = (faturamento || []).reduce((acc: number, item: any) => acc + (item.valor_total || 0), 0);
      const ticket = faturamento && faturamento.length > 0 ? total / faturamento.length : 0;

      this.stats = {
        ...this.stats,
        faturamentoMes: total,
        ticketMedio: ticket
      };
    } catch (err) {
      this.financialError = true;
    }
  }

}
