import { Component, inject, OnInit } from '@angular/core';
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

  // -- Master State --
  step: BookingStep = 'service';
  isLoading = true;
  isSaving  = false;
  notFound  = false;
  errorMsg  = '';

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
    if (!slug) { this.notFound = true; this.isLoading = false; return; }

    try {
      const result = await this.pubService.getBySlug(slug);
      if (!result.estabelecimento) {
        this.notFound = true;
      } else {
        this.estab    = result.estabelecimento;
        this.services = result.servicos;
        this.schedule = result.horarios;
        this.pros     = result.profissionais;
      }
    } catch (e) {
      this.errorMsg = 'Falha ao conectar com o servidor.';
    } finally {
      this.isLoading = false;
    }
  }

  // 1. Select Service
  pickService(s: Servico) {
    this.selectedService = s;
    this.prosForService = this.pros.filter(p => !p.servicos?.length || p.servicos.includes(s.id!));
    this.step = 'pro';
  }

  // 2. Select Pro
  pickPro(p: ProfissionalPublico | null) {
    this.selectedPro = p;
    this.step = 'time';
    if (!this.selectedDate) this.selectedDate = new Date().toISOString().split('T')[0];
    this.refreshSlots();
  }

  // 3. Select Time
  async refreshSlots() {
    if (!this.selectedDate) return;
    this.selectedTime = '';
    this.slots = [];
    
    // Check establishment working hours for that day
    const dow = new Date(this.selectedDate + 'T12:00:00').getDay();
    const dayConfig = this.schedule.find(h => h.dia_semana === dow && h.ativo);
    
    if (!dayConfig || !dayConfig.abre || !dayConfig.fecha) return;

    // Fetch busy times
    let busy: string[] = [];
    try {
      if (this.selectedPro) {
        busy = await this.pubService.getEventosDoProfissionalNoDia(this.selectedPro.id, this.selectedDate);
      } else {
        busy = await this.pubService.getEventosDoDia(this.estab!.id!, this.selectedDate);
      }
    } catch (e) { console.warn('Busy check failed'); }

    // Build slots
    const [hA, mA] = dayConfig.abre.split(':').map(Number);
    const [hF, mF] = dayConfig.fecha.split(':').map(Number);
    let current = hA * 60 + mA;
    const end = hF * 60 + mF;
    const duration = this.selectedService?.duracao_min || 30;

    while (current + duration <= end) {
      const time = `${Math.floor(current/60).toString().padStart(2,'0')}:${(current%60).toString().padStart(2,'0')}`;
      this.slots.push({ time, available: !busy.includes(time) });
      current += 30; // 30min granularity
    }
  }

  confirmTime() {
    if (this.selectedDate && this.selectedTime) this.step = 'confirm';
  }

  async finalize() {
    if (!this.custName.trim() || !this.custPhone.trim()) {
      this.errorMsg = 'Nome e telefone são obrigatórios.';
      return;
    }
    this.isSaving = true; this.errorMsg = '';
    
    try {
      const { id: clienteId } = await this.clientSvc.upsertClienteByPhone(this.custName, this.custPhone);
      
      const start = `${this.selectedDate}T${this.selectedTime}:00`;
      const endDt = new Date(new Date(start).getTime() + (this.selectedService?.duracao_min || 30) * 60000);
      
      await this.agendaSvc.addEvent({
        title: `${this.selectedService?.emoji || '✂️'} ${this.custName} | ${this.selectedService?.titulo}`,
        start, 
        end: endDt.toISOString().slice(0, 19),
        cliente_id: clienteId,
        servico_id: this.selectedService?.id,
        profissional_id: this.selectedPro?.id,
        status: 'confirmado',
      });

      this.smsSvc.enviarConfirmacao(this.custPhone, this.custName, this.selectedService?.titulo!, this.selectedTime);
      this.step = 'done';
    } catch (err: any) {
      this.errorMsg = err.message || 'Erro ao criar agendamento.';
    } finally {
      this.isSaving = false;
    }
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
