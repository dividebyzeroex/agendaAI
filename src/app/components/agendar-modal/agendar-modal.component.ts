import { Component, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClienteService, Cliente } from '../../services/cliente.service';
import { EstabelecimentoService, Servico } from '../../services/estabelecimento.service';
import { AgendaEventService } from '../../services/agenda-event.service';
import { ProfissionalService } from '../../services/profissional.service';
import { SecurityService } from '../../services/security.service';
import { agendaDay } from '../../utils/agenda-day';
import { appointmentTime, appointmentWindow } from '../../utils/appointment-window';
@Component({
  selector: 'app-agendar-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './appointment-form.html',
  styleUrls: ['./appointment-form.css'],
})
export class AgendarModalComponent implements OnInit {
  private clients = inject(ClienteService);
  private est = inject(EstabelecimentoService);
  private agenda = inject(AgendaEventService);
  private pros = inject(ProfissionalService);
  private security = inject(SecurityService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy = inject(DestroyRef);
  form = {
    clienteId: null as string | null,
    clienteNome: '',
    clienteTelefone: '',
    servicoId: '',
    profissionalId: '' as string,
    observacoes: '',
    status: 'confirmado' as 'confirmado' | 'pendente',
  };
  repeatCount=1;repeatDays=14;private requestKey=crypto.randomUUID();private repeatApplied=false;
  day = agendaDay(new Date());
  time = '09:00';
  clienteQuery = '';
  isNovoCliente = false;
  showMatches = false;
  servicos: Servico[] = [];
  profissionais: Array<{ id: string; nome: string; cor_agenda?: string }> = [];
  loadingCatalog = false;
  catalogError = '';
  saving = false;
  erro = '';
  saved = false;
  get service() {
    return this.servicos.find((s) => s.id === this.form.servicoId);
  }
  get window() {
    return appointmentWindow(this.day, this.time, Number(this.service?.duracao_min || 30));
  }
  get endTime() {
    return this.window ? appointmentTime(this.window.end) : '';
  }
  get matches() {
    const q = this.clienteQuery.trim().toLowerCase();
    return this.clients
      .getClientes()
      .filter(
        (c) =>
          !q ||
          c.nome.toLowerCase().includes(q) ||
          c.telefone?.replace(/\D/g, '').includes(q.replace(/\D/g, '') || 'invalid'),
      )
      .slice(0, 6);
  }
  ngOnInit() {
    const start = this.route.snapshot.queryParamMap.get('start');
    if (start && !Number.isNaN(Date.parse(start))) {
      this.day = agendaDay(start);
      this.time = appointmentTime(start);
    }
    const clientId = this.route.snapshot.queryParamMap.get('cliente');
    this.clients.clientes$.pipe(takeUntilDestroyed(this.destroy)).subscribe((list) => {
      if ((clientId||this.form.clienteId) && !this.form.clienteNome) {
        const c = list.find((item) => item.id === (clientId||this.form.clienteId));
        if (c) this.selectCliente(c);
      }
      this.cdr.markForCheck();
    });
    const repeatId=this.route.snapshot.queryParamMap.get('repetir');
    this.agenda.events$.pipe(takeUntilDestroyed(this.destroy)).subscribe(events=>{const e=events.find(e=>e.id===repeatId);if(e&&!this.repeatApplied){this.repeatApplied=true;this.form.clienteId=e.cliente_id||null;this.form.servicoId=e.servico_id||'';this.form.profissionalId=e.profissional_id||'';const c=this.clients.getClientes().find(c=>c.id===e.cliente_id);if(c)this.selectCliente(c);const proposed=this.route.snapshot.queryParamMap.get('start');if(!proposed){const d=new Date(e.start);d.setUTCDate(d.getUTCDate()+14);this.day=agendaDay(d);this.time=appointmentTime(e.start);}this.cdr.markForCheck();}});
    void this.loadCatalog();
  }
  async loadCatalog() {
    if (this.loadingCatalog) return;
    this.loadingCatalog = true;
    this.catalogError = '';
    try {
      const id = this.est.estabelecimento$.value?.id;
      if (!id) throw new Error();
      const [, pros] = await Promise.all([
        this.est.fetchServicos(),
        this.pros.fetchProfissionais(id),
      ]);
      this.servicos = this.est.servicos$.value.filter((s) => s.ativo !== false);
      const unique = Array.from(new Map(pros.map((p) => [p.id, p])).values());
      this.profissionais = await Promise.all(
        unique.map(async (p) => ({
          ...p,
          nome: (await this.security.decryptData(p.nome)) || p.nome,
        })),
      );
      if (this.servicos.length === 1) this.form.servicoId = this.servicos[0].id!;
      if (this.profissionais.length === 1) this.form.profissionalId = this.profissionais[0].id;
    } catch {
      this.catalogError = 'Não foi possível carregar serviços e equipe. Tente novamente.';
    } finally {
      this.loadingCatalog = false;
      if (!this.destroy.destroyed) this.cdr.markForCheck();
    }
  }
  selectCliente(c: Cliente) {
    this.form.clienteId = c.id!;
    this.form.clienteNome = c.nome;
    this.form.clienteTelefone = c.telefone || '';
    this.clienteQuery = '';
    this.isNovoCliente = false;
    this.showMatches = false;
  }
  usarNovoCliente() {
    const name = this.clienteQuery.trim();
    if (!name) return;
    this.form.clienteId = null;
    this.form.clienteNome = name;
    this.form.clienteTelefone = '';
    this.isNovoCliente = true;
    this.showMatches = false;
  }
  clearCliente() {
    this.form.clienteId = null;
    this.form.clienteNome = '';
    this.form.clienteTelefone = '';
    this.clienteQuery = '';
    this.isNovoCliente = false;
    this.showMatches = true;
  }
  isFormValido() {
    return Number.isInteger(Number(this.repeatCount)) && Number(this.repeatCount)>=1 && Number(this.repeatCount)<=12 && !!(
      this.form.clienteNome.trim() &&
      this.service &&
      this.profissionais.some((p) => p.id === this.form.profissionalId) &&
      this.window
    );
  }
  async confirmar() {
    if (this.saving || this.saved || this.loadingCatalog || this.catalogError) return;
    if (!this.isFormValido()) {
      this.erro = 'Escolha cliente, serviço, profissional e um horário válido.';
      return;
    }
    this.saving = true;
    this.erro = '';
    try {
      const window = this.window!;
      const conflict = this.agenda.currentEvents.some(
        (e) =>
          e.profissional_id === this.form.profissionalId &&
          !['cancelado', 'noshow'].includes(e.status || '') &&
          Date.parse(e.start) < Date.parse(window.end) &&
          Date.parse(e.end) > Date.parse(window.start),
      );
      if (conflict)
        throw new Error(
          'Este profissional já tem um atendimento nesse horário. Escolha outro horário.',
        );
      if (!this.form.clienteId) {
        const c = await this.clients.addCliente({
          nome: this.form.clienteNome.trim(),
          telefone: this.form.clienteTelefone.trim() || undefined,
        });
        this.form.clienteId = c.id!;
        this.isNovoCliente = false;
      }
      const pro = this.profissionais.find((p) => p.id === this.form.profissionalId);
      await this.agenda.addSeries({
        title: `${this.service?.emoji || '📅'} ${this.form.clienteNome.trim()} — ${this.service?.titulo}`,
        start: window.start,
        end: window.end,
        allDay: false,
        cliente_id: this.form.clienteId!,
        servico_id: this.form.servicoId,
        profissional_id: this.form.profissionalId,
        profissional_nome: pro?.nome,
        status: this.form.status,
        status_confirmacao: 'pendente',
        observacoes: this.form.observacoes.trim() || undefined,
        backgroundColor: pro?.cor_agenda || '#5d6ed9',
      },Number(this.repeatCount),Number(this.repeatDays),this.requestKey);
      this.saved = true;
      await this.router.navigate(['/admin/agenda'], { queryParams: { dia: this.day } });
    } catch (e) {
      this.erro =
        e instanceof Error ? e.message : 'Não foi possível agendar. Seus dados foram mantidos.';
    } finally {
      this.saving = false;
      if (!this.destroy.destroyed) this.cdr.markForCheck();
    }
  }
}
