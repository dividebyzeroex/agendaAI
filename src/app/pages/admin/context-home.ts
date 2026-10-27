import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest, interval, map, Subscription } from 'rxjs';
import { ActivationSummaryComponent } from '../../components/activation-summary/activation-summary';
import { PortalProfissionalComponent } from '../../components/portal-profissional/portal-profissional';
import { buildHomeContext, ContextReply, HomeContext, replyToHomeQuery } from '../../core/contextual-home';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';
import { AuthService } from '../../services/auth.service';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

interface ConversationTurn { question: string; answer: ContextReply; }

@Component({
  selector: 'app-context-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ActivationSummaryComponent, PortalProfissionalComponent],
  templateUrl: './context-home.html',
  styleUrls: ['./context-home.css'],
})
export class ContextHome implements OnInit, OnDestroy {
  readonly agenda = inject(AgendaEventService);
  private readonly auth = inject(AuthService);
  private readonly clients = inject(ClienteService);
  private readonly unit = inject(EstabelecimentoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly subscriptions = new Subscription();
  readonly isManager$ = this.auth.profile$.pipe(map((p) => p?.role === 'dono' || p?.role === 'financeiro'));
  readonly isOwner$ = this.auth.profile$.pipe(map((p) => p?.role === 'dono'));

  private events: AgendaEvent[] = [];
  private customerRecords: Cliente[] = [];
  private activeUnitId: string | null = null;
  role = '';
  firstName = '';
  loading = true;
  question = '';
  conversation: ConversationTurn[] = [];
  birthdays: Cliente[] = [];
  context: HomeContext = buildHomeContext([], [], new Date());
  readonly suggestions = ['Como está minha agenda hoje?', 'Quanto tenho previsto para o mês?', 'Quero criar um agendamento', 'Ver comissões'];

  ngOnInit(): void {
    this.subscriptions.add(this.auth.profile$.subscribe((p) => {
      this.firstName = (p?.nome || '').trim().split(/\s+/)[0] || '';
      this.role = p?.role || '';
      this.cdr.markForCheck();
    }));
    this.subscriptions.add(this.unit.activeId$.subscribe((id) => {
      if (id === this.activeUnitId) return;
      this.activeUnitId = id;
      this.conversation = [];
      this.birthdays = [];
      this.events = [];
      this.customerRecords = [];
      this.recompute();
      if (id) void this.loadBirthdays(id);
    }));
    this.subscriptions.add(combineLatest([this.agenda.events$, this.clients.clientes$, this.agenda.isLoading$])
      .subscribe(([events, clients, loading]) => {
        this.events = events;
        this.customerRecords = clients;
        this.loading = loading;
        this.recompute();
      }));
    this.subscriptions.add(interval(60_000).subscribe(() => this.recompute()));
  }

  private async loadBirthdays(unitId: string): Promise<void> {
    try {
      const records = await this.clients.getAniversariantesDoMes();
      if (this.activeUnitId === unitId) this.birthdays = records;
    } catch {
      if (this.activeUnitId === unitId) this.birthdays = [];
    }
    this.cdr.markForCheck();
  }
  private recompute(): void {
    this.context = buildHomeContext(this.events, this.customerRecords, new Date());
    this.cdr.markForCheck();
  }
  get greeting(): string {
    const hour = new Date().getHours();
    const salutation = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${salutation}${this.firstName ? ', ' + this.firstName : ''}.`;
  }
  get primaryInsight() { return this.context.insights[0]; }
  get otherInsights() { return this.context.insights.slice(1, 3); }
  get upcomingAppointments() {
    return this.context.appointments.filter((event) => event.status === 'em_atendimento' ||
      (event.status !== 'noshow' && event.status !== 'concluido' && new Date(event.start).getTime() >= this.context.date.getTime()))
      .slice(0, 5);
  }
  statusLabel(status?: string): string {
    return ({ confirmado: 'Confirmado', pendente: 'Pendente', em_atendimento: 'Em atendimento',
      concluido: 'Concluído', noshow: 'Não compareceu' } as Record<string, string>)[status || ''] || 'Agendado';
  }
  ask(prompt = this.question): void {
    const input = prompt.trim();
    if (!input) return;
    const answer = this.agenda.error$.value
      ? { title: 'Agenda indisponível', message: 'Não foi possível consultar os dados agora. Tente atualizar a agenda antes de confiar em um resumo.' }
      : this.clients.error$.value && /cliente|reten|anivers/i.test(input)
        ? { title: 'Clientes indisponíveis', message: 'Não foi possível carregar a base de clientes desta unidade. Tente novamente mais tarde.' }
        : replyToHomeQuery(input, this.context, this.role);
    this.conversation = [...this.conversation.slice(-3), { question: input, answer }];
    this.question = '';
    this.cdr.markForCheck();
  }
  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }
}
