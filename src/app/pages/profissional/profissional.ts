import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProfissionalService, ServicoExtra, CaixaItem } from '../../services/profissional.service';
import { EstabelecimentoPublicoService } from '../../services/estabelecimento-publico.service';
import { Servico } from '../../services/estabelecimento.service';
import { Subscription } from 'rxjs';

type ProView = 'agenda' | 'atendimento' | 'sucesso';
type ProAuth = 'login' | 'otp' | 'ready';

@Component({
  selector: 'app-profissional',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profissional.html',
  styleUrls: ['./profissional.css'],
})
export class Profissional implements OnInit, OnDestroy {
  private route      = inject(ActivatedRoute);
  private proService = inject(ProfissionalService);
  private pubService = inject(EstabelecimentoPublicoService);

  // -- Auth State --
  authState: ProAuth = 'login';
  identificador = ''; // ID or Phone
  otpCode = '';
  tempProId = '';
  maskedPhone = '';
  profile: any = null;

  // -- UI State --
  view: ProView = 'agenda';
  isLoading = true;
  isSaving = false;
  errorMsg = '';
  
  // -- Data --
  estabName = '';
  services: Servico[] = [];
  agenda: any[] = [];
  
  // -- Active Atendimento --
  activeEvent: any = null;
  extras: ServicoExtra[] = [];
  showAddExtras = false;
  finishedItem: CaixaItem | null = null;

  private subs = new Subscription();

  async ngOnInit() {
    console.log('[ProPortal] Rebuilding from scratch...');
    
    // Safety exit
    setTimeout(() => { if (this.isLoading) this.isLoading = false; }, 4000);

    const slug = this.route.snapshot.paramMap.get('slug') || '';
    if (slug) {
      const data = await this.pubService.getBySlug(slug);
      if (data.estabelecimento) this.estabName = data.estabelecimento.nome!;
      this.services = data.servicos || [];
    }

    // Restore session
    const saved = localStorage.getItem('pro_session_rebuild');
    if (saved) {
      try {
        this.profile = JSON.parse(saved);
        this.authState = 'ready';
        await this.startSession();
      } catch (e) {
        localStorage.removeItem('pro_session_rebuild');
        this.isLoading = false;
      }
    } else {
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  // -- Auth Logic --
  async requestAcesso() {
    if (!this.identificador.trim()) return;
    this.isSaving = true; this.errorMsg = '';
    try {
      const { proId, telefone } = await this.proService.solicitarCodigo(this.identificador.trim());
      this.tempProId = proId;
      this.maskedPhone = telefone;
      this.authState = 'otp';
    } catch (e: any) {
      this.errorMsg = e.message || 'Dados inválidos.';
    } finally {
      this.isSaving = false;
    }
  }

  async verifyOtp() {
    if (this.otpCode.length < 6) return;
    this.isSaving = true; this.errorMsg = '';
    try {
      const pro = await this.proService.verificarCodigo(this.tempProId, this.otpCode);
      this.profile = pro;
      localStorage.setItem('pro_session_rebuild', JSON.stringify(pro));
      this.authState = 'ready';
      await this.startSession();
    } catch (e: any) {
      this.errorMsg = e.message || 'Código incorreto.';
    } finally {
      this.isSaving = false;
    }
  }

  private async startSession() {
    this.isLoading = true;
    try {
      // 1. Subscribe to real-time updates
      this.proService.subscribeRealtime(this.profile.id);
      
      // 2. Consume agenda stream
      this.subs.add(
        this.proService.agendaHoje$.subscribe(data => {
          this.agenda = data || [];
          this.isLoading = false;
          console.log('[ProPortal] Agenda synced:', this.agenda.length);
        })
      );

      // 3. Initial fetch
      await this.proService.fetchAgendaHoje(this.profile.id);
    } catch (err) {
      console.error('[ProPortal] Session start failed:', err);
      this.isLoading = false;
    }
  }

  logout() {
    localStorage.removeItem('pro_session_rebuild');
    window.location.reload();
  }

  // -- Attendance Logic --
  async goAtendimento(ev: any) {
    if (ev.status === 'em_atendimento') {
       this.openAtendimento(ev);
    } else {
       this.isSaving = true;
       try {
         await this.proService.iniciarAtendimento(ev.id);
         this.openAtendimento({ ...ev, status: 'em_atendimento' });
       } finally { this.isSaving = false; }
    }
  }

  private openAtendimento(ev: any) {
    this.activeEvent = ev;
    this.extras      = [...(ev.servicos_extras || [])];
    this.view        = 'atendimento';
  }

  async finishAtendimento() {
    if (!this.activeEvent) return;
    this.isSaving = true;
    try {
      const resp = await this.proService.finalizarEEnviarCaixa({
        eventId:          this.activeEvent.id,
        clienteNome:      this.activeEvent?.clientes?.nome || 'Cliente',
        servicoPrincipal: {
          titulo: this.activeEvent?.servicos?.titulo || 'Serviço',
          preco:  this.activeEvent?.servicos?.preco  || 0,
          emoji:  this.activeEvent?.servicos?.emoji  || '✂️'
        },
        servicosExtras:   this.extras,
        profissional:     this.profile.nome
      });
      this.finishedItem = resp;
      this.view = 'sucesso';
    } finally { this.isSaving = false; }
  }

  // -- Helpers --
  addExtra(s: Servico) { this.extras.push({ ...s }); this.showAddExtras = false; }
  removeExtra(i: number) { this.extras.splice(i, 1); }
  backToAgenda() { this.view = 'agenda'; this.activeEvent = null; }
  fmtH(dt: string) { return this.proService.formatHora(dt); }
  getStat(s: string) { return this.proService.getStatusInfo(s); }
}
