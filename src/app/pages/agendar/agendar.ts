import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EstabelecimentoPublicoService, EstabelecimentoPublico, ProfissionalPublico } from '../../services/estabelecimento-publico.service';
import { Servico, Horario } from '../../services/estabelecimento.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';

type BookingStep = 'step1' | 'step_pro' | 'step2' | 'step3' | 'done';

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
  private cdr        = inject(ChangeDetectorRef);

  get config() {
    return SegmentoConfigService.forSegmento(this.estab?.segmento || '');
  }

  // --- Master State ---
  step: BookingStep = 'step1';
  progress = 0;
  isLoading = true;
  isTransitioning = false;
  isSaving  = false;
  notFound  = false;
  errorMsg  = '';
  transitionMsg = '';

  // --- Fetched Data ---
  estab: EstabelecimentoPublico | null = null;
  services: Servico[] = [];
  schedule: Horario[] = [];
  pros: ProfissionalPublico[] = [];

  // --- Categories ---
  categorias: string[] = ['Todos'];
  categoriaAtiva: string = 'Todos';

  // --- Selection State ---
  selectedService: Servico | null = null;
  selectedPro: ProfissionalPublico | null = null;
  selectedDate: string = '';
  selectedTime: string = '';

  // --- Client Identification (NO registration needed!) ---
  custName: string = '';
  custPhone: string = '';

  // --- Time Slots ---
  slots: { time: string; available: boolean }[] = [];

  // --- Calendar navigation ---
  calendarDays: { date: string; dayName: string; dayNum: number; monthShort: string; isToday: boolean; isSelected: boolean; isClosed: boolean }[] = [];

  get progressValue(): number {
    const p: Record<BookingStep, number> = { step1: 25, step_pro: 50, step2: 75, step3: 90, done: 100 };
    return p[this.step];
  }

  get stepLabel(): string {
    const labels: Record<BookingStep, string> = {
      step1: `Passo 1 de 4 · Escolha o ${this.config.labelServico}`,
      step_pro: `Passo 2 de 4 · Escolha o ${this.config.labelProfissional}`,
      step2: 'Passo 3 de 4 · Selecione o horário',
      step3: 'Passo 4 de 4 · Confirmação',
      done: 'Concluído'
    };
    return labels[this.step];
  }

  get filteredServices() {
    if (this.categoriaAtiva === 'Todos') return this.services;
    return this.services.filter(s => (s as any).categoria === this.categoriaAtiva);
  }

  get prosForSelectedService() {
    if (!this.selectedService) return [];
    return this.pros.filter(p => !p.servicos?.length || p.servicos.includes(this.selectedService!.id!));
  }

  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    if (!slug) {
      this.notFound = true;
      this.isLoading = false;
      return;
    }

    // Subscribe to realtime changes
    this.pubService.data$.subscribe(data => {
      if (data && data.estabelecimento) {
        this.estab    = data.estabelecimento;
        this.services = data.servicos || [];
        this.schedule = data.horarios || [];
        this.pros     = data.profissionais || [];
        this.isLoading = false;
        this.notFound  = false;

        // Build categories from services
        const cats = new Set<string>();
        this.services.forEach(s => {
          if ((s as any).categoria) cats.add((s as any).categoria);
        });
        this.categorias = cats.size > 0 ? ['Todos', ...Array.from(cats)] : [];

        if (this.step === 'step2') this.refreshSlots();
        this.cdr.detectChanges();
      }
    });

    // Timeout safety net
    const timeout = setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.errorMsg = 'O servidor está demorando para responder. Tente recarregar a página.';
        this.cdr.detectChanges();
      }
    }, 12000);

    try {
      const data = await this.pubService.getBySlug(slug);
      clearTimeout(timeout);
      this.isLoading = false;
      if (!data || !data.estabelecimento) {
        this.notFound = true;
      }
      this.cdr.detectChanges();
    } catch (e: any) {
      this.errorMsg = 'Falha ao conectar com o servidor.';
      this.isLoading = false;
    }
  }

  // === STEP NAVIGATION ===

  async goToStep(next: BookingStep, msg: string) {
    this.transitionMsg = msg;
    this.isTransitioning = true;
    this.cdr.detectChanges();
    await new Promise(r => setTimeout(r, 500));
    this.step = next;
    this.isTransitioning = false;
    this.cdr.detectChanges();
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goBack() {
    this.errorMsg = '';
    if (this.step === 'step2') this.step = 'step1';
    else if (this.step === 'step3') this.step = 'step2';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // === STEP 1: Service + Professional ===

  selecionarCategoria(cat: string) {
    this.categoriaAtiva = cat;
    this.selectedService = null;
    this.selectedPro = null;
  }

  toggleService(s: Servico) {
    if (this.selectedService?.id === s.id) {
      this.selectedService = null;
      this.selectedPro = null;
    } else {
      this.selectedService = s;
      this.selectedPro = null;
    }
  }
  
  goStepPro() {
    if (this.selectedService) {
      this.step = 'step_pro';
    }
  }

  pickPro(p: ProfissionalPublico | null) {
    this.selectedPro = p;
  }

  goStep2() {
    if (this.selectedService) {
      if (!this.selectedDate) this.selectedDate = new Date().toISOString().split('T')[0];
      this.step = 'step2';
      this.buildCalendarDays();
      this.refreshSlots();
    }
  }

  // === STEP 2: Date + Time ===

  buildCalendarDays() {
    this.calendarDays = [];
    const today = new Date();
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dow = d.getDay();

      // Check if this day is a working day
      const dayConfig = this.schedule.find(h => h.dia_semana === dow);
      const isClosed = !dayConfig || !dayConfig.ativo;

      this.calendarDays.push({
        date: dateStr,
        dayName: dayNames[dow],
        dayNum: d.getDate(),
        monthShort: monthNames[d.getMonth()],
        isToday: i === 0,
        isSelected: dateStr === this.selectedDate,
        isClosed,
      });
    }
  }

  selectDate(day: any) {
    if (day.isClosed) return;
    this.selectedDate = day.date;
    this.calendarDays.forEach(d => d.isSelected = d.date === day.date);
    this.refreshSlots();
  }

  async refreshSlots() {
    if (!this.selectedDate) return;
    this.selectedTime = '';
    this.slots = [];

    const dow = new Date(this.selectedDate + 'T12:00:00').getDay();
    const dayConfig = this.schedule.find(h => h.dia_semana === dow && h.ativo);

    const abre  = dayConfig?.abre  || '08:00';
    const fecha = dayConfig?.fecha || '18:00';
    if (!abre || !fecha) return;

    let busy: string[] = [];
    try {
      busy = await this.pubService.getEventosDoDia(this.estab!.id!, this.selectedDate);
    } catch (e) {}

    const [hA, mA] = abre.split(':').map(Number);
    const [hF, mF] = fecha.split(':').map(Number);
    let current = hA * 60 + mA;
    const end = hF * 60 + mF;
    const duration = this.selectedService?.duracao_min || 30;

    // Filter past slots if today
    const now = new Date();
    const isToday = this.selectedDate === now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    while (current + duration <= end) {
      const time = `${Math.floor(current/60).toString().padStart(2,'0')}:${(current%60).toString().padStart(2,'0')}`;
      const isPast = isToday && current <= currentMinutes;
      this.slots.push({ time, available: !busy.includes(time) && !isPast });
      current += 30;
    }
    this.cdr.detectChanges();
  }

  selectTime(slot: any) {
    if (!slot.available) return;
    this.selectedTime = slot.time;
  }

  confirmarStep2() {
    if (this.selectedDate && this.selectedTime) {
      this.goToStep('step3', 'Preparando resumo...');
    }
  }

  // === STEP 3: Confirm & Book (NO LOGIN!) ===

  formatPhone(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.substring(0, 11);

    if (value.length >= 7) {
      value = `(${value.substring(0,2)}) ${value.substring(2,7)}-${value.substring(7)}`;
    } else if (value.length >= 3) {
      value = `(${value.substring(0,2)}) ${value.substring(2)}`;
    }
    this.custPhone = value;
  }

  async finalize() {
    const nameClean = this.custName.trim();
    const phoneClean = this.custPhone.replace(/\D/g, '');

    if (!nameClean) {
      this.errorMsg = 'Por favor, informe seu nome.';
      return;
    }
    if (phoneClean.length < 10) {
      this.errorMsg = 'Informe um telefone válido com DDD.';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';

    try {
      const startDt = new Date(`${this.selectedDate}T${this.selectedTime}:00`);
      const duration = this.selectedService?.duracao_min || 30;
      const endDt = new Date(startDt.getTime() + duration * 60000);

      const eventTitle = `${this.selectedService?.emoji || this.config.emojiPadrao} ${nameClean} | ${this.selectedService?.titulo}`;

      // Call the public API — NO AUTH REQUIRED
      const response = await fetch('/api/public-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimento_id: this.estab!.id,
          servico_id: this.selectedService?.id,
          profissional_id: this.selectedPro?.id || null,
          start: this.toLocalISO(startDt),
          end: this.toLocalISO(endDt),
          cliente_nome: nameClean,
          cliente_telefone: phoneClean,
          title: eventTitle,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar agendamento.');
      }

      // Send SMS confirmation (fire-and-forget)
      fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneClean,
          tipo: 'confirmacao',
          message: `✅ Olá, ${nameClean}! Seu agendamento de *${this.selectedService?.titulo}* às ${this.selectedTime} foi confirmado. Até lá! — ${this.estab?.nome}`,
        }),
      }).catch(() => {}); // Silently ignore SMS errors

      this.goToStep('done', 'Confirmando sua reserva...');
    } catch (err: any) {
      this.errorMsg = err.message || 'Erro ao criar agendamento.';
      this.isSaving = false;
    }
  }

  // === UTILS ===

  private toLocalISO(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
  }

  getInitials(name?: string): string {
    if (!name) return 'AI';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }

  formatDate(d: string) {
    return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';
  }

  formatPrice(price: number): string {
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  newBooking() {
    this.step = 'step1';
    this.selectedService = null;
    this.selectedPro = null;
    this.selectedDate = '';
    this.selectedTime = '';
    this.custName = '';
    this.custPhone = '';
    this.errorMsg = '';
    this.isSaving = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
