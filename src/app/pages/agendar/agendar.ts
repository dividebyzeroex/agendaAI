import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EstabelecimentoPublicoService, EstabelecimentoPublico, ProfissionalPublico } from '../../services/estabelecimento-publico.service';
import { Servico, Horario } from '../../services/estabelecimento.service';
import { AgendaEventService } from '../../services/agenda-event.service';
import { ClienteService } from '../../services/cliente.service';
import { SmsService } from '../../services/sms.service';

type BookingStep = 'service' | 'pro' | 'time' | 'confirm' | 'done';

@Component({
  selector: 'app-agendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agendar.html',
  styleUrls: ['./agendar.css'],
})
export class Agendar implements OnInit {
  private route      = inject(ActivatedRoute);
  private pubService = inject(EstabelecimentoPublicoService);
  private agendaSvc  = inject(AgendaEventService);
  private clientSvc  = inject(ClienteService);
  private smsSvc     = inject(SmsService);
  private cdr        = inject(ChangeDetectorRef);

  // -- Master State --
  step: BookingStep = 'service';
  isLoading = true;
  isTransitioning = false;
  isSaving  = false;
  notFound  = false;
  errorMsg  = '';
  transitionMsg = '';

  // -- Fetched Data --
  estab: EstabelecimentoPublico | null = null;
  services: Servico[] = [];
  schedule: Horario[] = [];
  pros: ProfissionalPublico[] = [];
  prosForService: ProfissionalPublico[] = [];

  // -- Selection State --
  selectedService: Servico | null = null;
  selectedPro: ProfissionalPublico | null = null;
  selectedDate: string = '';
  selectedTime: string = '';
  
  // -- Identification --
  custName: string = '';
  custPhone: string = '';

  // -- Slots --
  slots: { time: string; available: boolean }[] = [];

  get progress(): number {
    const p: Record<BookingStep, number> = { service: 20, pro: 40, time: 60, confirm: 85, done: 100 };
    return p[this.step];
  }

  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    if (!slug) { 
      console.warn('[Agendar] Slug ausente na URL.');
      this.notFound = true; 
      this.isLoading = false; 
      return; 
    }

    // Subscribe to changes (Realtime enabled)
    this.pubService.data$.subscribe(data => {
      if (data && data.estabelecimento) {
        this.estab    = data.estabelecimento;
        this.services = data.servicos;
        this.schedule = data.horarios;
        this.pros     = data.profissionais;
        this.isLoading = false;
        this.notFound  = false;
        
        // Auto-refresh related states
        if (this.selectedService) {
           this.prosForService = this.pros.filter(p => !p.servicos?.length || p.servicos.includes(this.selectedService!.id!));
        }
        if (this.step === 'time') this.refreshSlots();

        this.cdr.detectChanges();
      }
    });

    // 10s Security Timeout
    const timeout = setTimeout(() => {
      if (this.isLoading) {
        console.warn('[Agendar] Carregamento excedeu 10s. Forçando término.');
        this.isLoading = false;
        this.errorMsg  = 'O servidor está demorando para responder. Tente recarregar a página.';
        this.cdr.detectChanges();
      }
    }, 10000);

    try {
      console.log(`[Agendar] Sincronizando: ${slug}...`);
      const data = await this.pubService.getBySlug(slug);
      clearTimeout(timeout);
      
      // FINAL VALIDATION: Stop loading anyway
      this.isLoading = false;
      
      if (!data || !data.estabelecimento) {
        console.warn(`[Agendar] Estabelecimento não encontrado para o slug: ${slug}`);
        this.notFound = true;
      } else {
        this.notFound = false;
      }
      
      this.cdr.detectChanges();
    } catch (e: any) {
      console.error('[Agendar] Falha na sincronização:', e);
      this.errorMsg = 'Falha ao conectar com o servidor.';
      this.isLoading = false;
    }
  }

  /** Premium transition between screens */
  async goToStep(next: BookingStep, msg: string) {
    this.transitionMsg = msg;
    this.isTransitioning = true;
    this.cdr.detectChanges();
    
    // Aesthetic delay for elite feeling
    await new Promise(r => setTimeout(r, 800));
    
    this.step = next;
    this.isTransitioning = false;
    this.cdr.detectChanges();
  }

  // 1. Select Service
  pickService(s: Servico) {
    this.selectedService = s;
    this.prosForService = this.pros.filter(p => !p.servicos?.length || p.servicos.includes(s.id!));
    this.goToStep('pro', 'Localizando especialistas disponíveis...');
  }

  // 2. Select Pro
  pickPro(p: ProfissionalPublico | null) {
    this.selectedPro = p;
    if (!this.selectedDate) this.selectedDate = new Date().toISOString().split('T')[0];
    this.refreshSlots();
    this.goToStep('time', 'Gerando grade de horários dinâmica...');
  }

  // 3. Select Time
  async refreshSlots() {
    if (!this.selectedDate) return;
    this.selectedTime = '';
    this.slots = [];
    
    // Check establishment working hours for that day
    const dow = new Date(this.selectedDate + 'T12:00:00').getDay();
    const dayConfig = this.schedule.find(h => h.dia_semana === dow && h.ativo);
    
    // Fallback: Default to 08:00 - 18:00 if not configured
    const abre  = dayConfig?.abre  || '08:00';
    const fecha = dayConfig?.fecha || '18:00';

    if (!abre || !fecha) return;

    // Fetch busy times
    let busy: string[] = [];
    try {
      busy = await this.pubService.getEventosDoDia(this.estab!.id!, this.selectedDate);
    } catch (e) { console.warn('Busy check failed'); }

    // Build slots
    const [hA, mA] = abre.split(':').map(Number);
    const [hF, mF] = fecha.split(':').map(Number);
    let current = hA * 60 + mA;
    const end = hF * 60 + mF;
    const duration = 30; // Forced to 30min per request

    while (current + duration <= end) {
      const time = `${Math.floor(current/60).toString().padStart(2,'0')}:${(current%60).toString().padStart(2,'0')}`;
      this.slots.push({ time, available: !busy.includes(time) });
      current += 30; // 30min granularity
    }
  }

  confirmTime() {
    if (this.selectedDate && this.selectedTime) {
      this.goToStep('confirm', 'Preparando resumo da reserva...');
    }
  }

  async finalize() {
    if (!this.custName.trim() || !this.custPhone.trim()) {
      this.errorMsg = 'Nome e telefone são obrigatórios.';
      return;
    }
    this.isSaving = true; this.errorMsg = '';
    
    try {
      const { id: clienteId } = await this.clientSvc.upsertClienteByPhone(this.custName, this.custPhone);
      
      const startDt = new Date(`${this.selectedDate}T${this.selectedTime}:00`);
      const duration = this.selectedService?.duracao_min || 30;
      const endDt = new Date(startDt.getTime() + duration * 60000);
      
      await this.agendaSvc.addEvent({
        title: `${this.selectedService?.emoji || '✂️'} ${this.custName} | ${this.selectedService?.titulo}`,
        start: this.toLocalISO(startDt), 
        end: this.toLocalISO(endDt),
        cliente_id: clienteId,
        servico_id: this.selectedService?.id,
        status: 'confirmado',
      });

      this.smsSvc.enviarConfirmacao(this.custPhone, this.custName, this.selectedService?.titulo!, this.selectedTime);
      this.goToStep('done', 'Finalizando seu agendamento...');
    } catch (err: any) {
      this.errorMsg = err.message || 'Erro ao criar agendamento.';
      this.isSaving = false;
    }
  }

  private toLocalISO(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    // Forcing Brasil/Sao_Paulo offset (-03:00) during string creation
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
  }

  getInitials(name?: string): string {
    if (!name) return 'AI';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  goBack() {
    if (this.step === 'pro') this.step = 'service';
    else if (this.step === 'time') this.step = 'pro';
    else if (this.step === 'confirm') this.step = 'time';
  }

  formatDate(d: string) {
    return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';
  }
}
