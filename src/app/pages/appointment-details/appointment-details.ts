import { BusinessService } from '../../services/business.service';
import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AgendaEvent, AgendaEventService } from '../../services/agenda-event.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { appointmentTime, appointmentWindow } from '../../utils/appointment-window';
import { agendaDay } from '../../utils/agenda-day';
@Component({
  selector: 'app-appointment-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './appointment-details.html',
  styleUrls: ['./appointment-details.css'],
})
export class AppointmentDetails implements OnInit {
  agenda = inject(AgendaEventService);
  private business = inject(BusinessService);
  availablePasses: any[] = [];
  passId = '';
  businessLoaded = false;
  customerLink = '';
  async loadPasses() {
    if (!this.event) return;
    this.busy = true;
    this.error = '';
    try {
      const { data, error } = await this.db
        .from('customer_passes')
        .select('id,title,remaining,expires_at')
        .eq('estabelecimento_id', this.est.estabelecimento$.value?.id)
        .eq('cliente_id', this.event.cliente_id)
        .eq('servico_id', this.event.servico_id)
        .eq('status', 'active')
        .gt('remaining', 0)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      this.availablePasses = data || [];
      const { data: held } = await this.db
        .from('pass_reservations')
        .select('pass_id')
        .eq('event_id', this.event.id)
        .maybeSingle();
      if (held?.pass_id) this.passId = held.pass_id;
      this.businessLoaded = true;
    } catch {
      this.error = 'Não foi possível consultar os pacotes.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async businessAction(action: string) {
    if (this.busy || !this.event) return;
    this.busy = true;
    this.error = '';
    try {
      const result = await this.business.command(action, {
        event_id: this.id,
        pass_id: this.passId,
      });
      if (action === 'feedback-link' || action === 'checkin-link') {
        this.customerLink =
          window.location.origin +
          (action === 'feedback-link' ? '/avaliar/' : '/checkin/') +
          result.token;
        this.notice = 'Link pronto para compartilhar com o cliente.';
      } else {
        this.notice =
          action === 'pass-redeem'
            ? 'Sessão utilizada. Não há nova cobrança por este serviço.'
            : 'Consumo de insumos registrado.';
        this.businessLoaded = false;
        await this.agenda.reload();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Não foi possível concluir.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private db = inject(SupabaseService).client;
  private auth = inject(AuthService);
  private est = inject(EstabelecimentoService);
  private cdr = inject(ChangeDetectorRef);
  private destroy = inject(DestroyRef);
  event: AgendaEvent | null = null;
  loading = true;
  busy = false;
  error = '';
  notice = '';
  confirmDelete = false;
  receipt: any = null;
  receiptLoading = false;
  email = '';
  day = '';
  time = '';
  duration = 30;
  readonly id = this.route.snapshot.paramMap.get('id') || '';
  get nextVisitStart() {
    if (!this.event) return '';
    const d = new Date(this.event.start);
    do {
      d.setUTCDate(d.getUTCDate() + 14);
    } while (d.getTime() <= Date.now());
    return d.toISOString();
  }
  get isOwner() {
    return this.auth.userProfileValue?.role === 'dono';
  }
  get canReceive() {
    return ['dono', 'financeiro', 'recepcionista'].includes(this.auth.userProfileValue?.role || '');
  }
  get isFinished() {
    return this.event?.status === 'concluido';
  }
  get isActive() {
    return !['concluido', 'cancelado', 'noshow'].includes(this.event?.status || '');
  }
  get pendingPayment() {
    return this.isFinished && !this.event?.cobranca_enviada;
  }
  get publicReceipt() {
    return this.receipt?.token_publico
      ? window.location.origin + '/comanda/' + encodeURIComponent(this.receipt.token_publico)
      : '';
  }
  get statusLabel() {
    return (
      {
        confirmado: 'Agendado',
        pendente: 'Pendente',
        em_atendimento: 'Em atendimento',
        concluido: 'Concluído',
        cancelado: 'Cancelado',
        noshow: 'Não compareceu',
      } as Record<string, string>
    )[this.event?.status || 'confirmado'];
  }
  ngOnInit() {
    this.agenda.isLoading$.pipe(takeUntilDestroyed(this.destroy)).subscribe((v) => {
      this.loading = v;
      this.cdr.markForCheck();
    });
    this.agenda.events$.pipe(takeUntilDestroyed(this.destroy)).subscribe((events) => {
      const e = events.find((item) => item.id === this.id);
      if (e) {
        const first = !this.event;
        this.event = e;
        if (first) {
          this.day = agendaDay(e.start);
          this.time = appointmentTime(e.start);
          this.duration = Math.max(
            1,
            Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000),
          );
        }
      } else this.event = null;
      this.cdr.markForCheck();
    });
  }
  async change(status: AgendaEvent['status']) {
    if (this.busy || !this.event) return;
    this.busy = true;
    this.error = '';
    try {
      await this.agenda.updateStatus(this.id, status);
      this.notice = 'Atendimento atualizado.';
    } catch {
      this.error = 'Não foi possível atualizar. Tente novamente.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async reschedule() {
    if (this.busy || !this.event) return;
    const window = appointmentWindow(this.day, this.time, Number(this.duration));
    if (!window) {
      this.error = 'Confira o dia, horário e duração.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const pro = this.event.profissional_id;
      if (
        pro &&
        this.agenda.currentEvents.some(
          (e) =>
            e.id !== this.id &&
            e.profissional_id === pro &&
            !['cancelado', 'noshow'].includes(e.status || '') &&
            Date.parse(e.start) < Date.parse(window.end) &&
            Date.parse(e.end) > Date.parse(window.start),
        )
      )
        throw new Error('Este profissional já tem um atendimento nesse horário.');
      await this.agenda.updateEvent(this.id, window);
      this.notice = 'Novo horário salvo.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Não foi possível remarcar.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async remove() {
    if (!this.confirmDelete || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.agenda.removeEvent(this.id);
      await this.router.navigate(['/admin/agenda'], { queryParams: { dia: this.day } });
    } catch {
      this.error = 'Não foi possível excluir o agendamento.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async loadReceipt() {
    if (this.receiptLoading) return;
    this.receiptLoading = true;
    this.error = '';
    try {
      const { data, error } = await this.db
        .from('caixa_itens')
        .select('*')
        .eq('agenda_event_id', this.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        this.notice = 'Nenhuma comanda registrada para este atendimento.';
        return;
      }
      this.receipt = data;
      this.email = data.email_cliente || '';
    } catch {
      this.error = 'Não foi possível consultar a comanda.';
    } finally {
      this.receiptLoading = false;
      this.cdr.markForCheck();
    }
  }
  async copyReceipt() {
    try {
      await navigator.clipboard.writeText(this.publicReceipt);
      this.notice = 'Link da comanda copiado.';
    } catch {
      this.error = 'Não foi possível copiar. Abra a comanda para compartilhar.';
    }
    this.cdr.markForCheck();
  }
  async sendReceipt() {
    if (this.busy || !this.publicReceipt) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.error = 'Informe um e-mail válido.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const {
        data: { session },
      } = await this.db.auth.getSession();
      if (!session) throw new Error('Entre novamente para enviar.');
      const response = await fetch('/api/send-comanda', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: this.email,
          token: this.receipt.token_publico,
          estabelecimento_id: this.est.estabelecimento$.value?.id,
        }),
      });
      if (!response.ok) throw new Error('Não foi possível enviar a comanda.');
      this.notice = 'Comanda enviada por e-mail.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Falha no envio.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
