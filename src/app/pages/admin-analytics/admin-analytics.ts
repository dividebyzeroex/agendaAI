import { Component, ChangeDetectorRef, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SecurityService } from '../../services/security.service';
import { activitySummary, receivedSummary, csvCell } from '../../core/helpers/business-analytics';
@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-analytics.html',
  styleUrls: ['./admin-analytics.css'],
})
export class AdminAnalytics implements OnInit {
  private db = inject(SupabaseService).client;
  private est = inject(EstabelecimentoService);
  private security = inject(SecurityService);
  private cdr = inject(ChangeDetectorRef);
  private destroy = inject(DestroyRef);
  private generation = 0;
  private controller?: AbortController;
  days = 30;
  loading = false;
  error = '';
  tenantId = '';
  summary: ReturnType<typeof activitySummary> | null = null;
  financial: ReturnType<typeof receivedSummary> | null = null;
  clients: number | null = null;
  periodStart = '';
  periodEnd = '';
  dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  constructor() {
    this.destroy.onDestroy(() => {
      ++this.generation;
      this.controller?.abort();
    });
  }
  ngOnInit() {
    this.est.activeId$.pipe(takeUntilDestroyed(this.destroy)).subscribe((id) => {
      this.tenantId = id || '';
      this.summary = null;
      this.financial = null;
      this.clients = null;
      void this.load();
    });
  }
  private async pages(
    table: string,
    columns: string,
    field: string,
    since: string,
    until: string,
    signal: AbortSignal,
    tenant: string,
    paid = false,
  ) {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      let q = this.db
        .from(table)
        .select(columns)
        .eq('estabelecimento_id', tenant)
        .gte(field, since)
        .lte(field, until)
        .order('id')
        .range(offset, offset + 499);
      if (paid) q = q.eq('status_caixa', 'pago');
      const { data, error } = await q.abortSignal(signal);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data?.length || 0) < 500) return rows;
      if (offset >= 49500) throw new Error('Período muito extenso. Escolha um intervalo menor.');
    }
  }
  async load() {
    const g = ++this.generation;
    this.controller?.abort();
    this.controller = new AbortController();
    this.summary = null;
    this.financial = null;
    this.clients = null;
    this.error = '';
    this.loading = false;
    if (!this.tenantId) return;
    const signal = this.controller.signal,
      tenant = this.tenantId;
    const timer = setTimeout(
      () => this.controller?.signal === signal && this.controller.abort(),
      20000,
    );
    this.loading = true;
    this.cdr.markForCheck();
    const until = new Date();
    const date = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(until);
    const since = new Date(date + 'T00:00:00-03:00');
    since.setUTCDate(since.getUTCDate() - this.days + 1);
    try {
      const results = await Promise.allSettled([
        this.pages(
          'agenda_events',
          'id,start,status,cliente_id,profissional_id,profissional_nome',
          'start',
          since.toISOString(),
          until.toISOString(),
          signal,
          tenant,
        ),
        this.pages(
          'caixa_itens',
          'id,valor_total,connect_orders(refunded_cents)',
          'pago_em',
          since.toISOString(),
          until.toISOString(),
          signal,
          tenant,
          true,
        ),
        this.db
          .from('clientes')
          .select('id', { head: true, count: 'exact' })
          .eq('estabelecimento_id', tenant)
          .abortSignal(signal),
      ]);
      if (g !== this.generation) return;
      if (
        results[0].status === 'rejected' ||
        results[1].status === 'rejected' ||
        results[2].status === 'rejected'
      )
        throw new Error('Consulta indisponível');
      if (results[2].value.error) throw results[2].value.error;
      const events = await Promise.all(
        results[0].value.map((e) => this.security.decryptObject(e, ['profissional_nome'])),
      );
      if (g !== this.generation) return;
      this.summary = activitySummary(events);
      this.financial = receivedSummary(results[1].value);
      this.clients = results[2].value.count;
      this.periodStart = since.toISOString();
      this.periodEnd = until.toISOString();
    } catch {
      if (g === this.generation)
        this.error =
          'Não foi possível carregar o relatório completo. Tente atualizar ou escolha um período menor.';
    } finally {
      clearTimeout(timer);
      if (g === this.generation) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }
  level(value: number) {
    return !value ? 0 : Math.max(1, Math.ceil((value / (this.summary?.max || 1)) * 4));
  }
  export() {
    if (!this.summary || !this.financial) return;
    const rows: unknown[][] = [
      ['Relatório AgendaAI', this.periodStart, this.periodEnd],
      ['Indicador', 'Valor'],
      ['Recebido (R$)', this.financial.total],
      ['Ticket por venda paga (R$)', this.financial.ticket],
      ['Clientes na base', this.clients],
      ['Concluídos', this.summary.completed],
      ['Faltas', this.summary.noShows],
      ['Cancelamentos', this.summary.cancelled],
      ['Clientes atendidos', this.summary.clientsServed],
      ['Clientes com 2+ visitas', this.summary.returning],
      [],
      ['Profissional', 'Agendamentos sem cancelados', 'Concluídos', 'Faltas', 'Cancelamentos'],
      ...this.summary.professionals.map((p) => [
        p.name,
        p.scheduled,
        p.completed,
        p.noShows,
        p.cancelled,
      ]),
      [],
      ['Horário (São Paulo)', ...this.dayLabels],
      ...this.summary.heat.map((r) => [r.hour + ':00', ...r.counts]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agendaai-relatorio-' + this.days + '-dias.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
