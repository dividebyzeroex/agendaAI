import { SupabaseService } from '../../services/supabase.service';
import {
  bookingDate,
  bookingMinutes,
  slotOverlaps,
  nextOpeningDate,
} from '../../utils/booking-slots';
import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  EstabelecimentoPublicoService,
  EstabelecimentoPublico,
  ProfissionalPublico,
} from '../../services/estabelecimento-publico.service';
import { Servico, Horario } from '../../services/estabelecimento.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';
import { NotificationService } from '../../services/notification.service';

type BookingStep = 'marketplace' | 'step0' | 'step1' | 'step_pro' | 'step2' | 'step3' | 'done';

@Component({
  selector: 'app-agendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agendar.html',
  styleUrls: ['./agendar.css'],
})
export class Agendar implements OnInit {
  private route = inject(ActivatedRoute);
  private publicDb = inject(SupabaseService).client;
  publicPage: any = null;
  bookingPending = false;
  quote: any = null;
  quoteLoading = false;
  private reservationAttempt = { fingerprint: '', key: crypto.randomUUID() };
  async loadPublicPage() {
    if (!this.estab?.id) return;
    const { data } = await this.publicDb.rpc('business_public_page', { p_tenant: this.estab.id });
    this.publicPage = data;
    this.cdr.markForCheck();
  }
  private pubService = inject(EstabelecimentoPublicoService);
  private cdr = inject(ChangeDetectorRef);
  private notifService = inject(NotificationService);

  get config() {
    return SegmentoConfigService.forSegmento(this.estab?.segmento || '');
  }

  // --- Master State ---
  step: BookingStep = 'step1';
  progress = 0;
  isLoading = true;
  isTransitioning = false;
  isSaving = false;
  notFound = false;
  errorMsg = '';
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

  // --- Extra Metadata (Nicho) ---
  petNome = '';
  petRaca = '';
  petPorte = '';
  petCuidados = '';
  aparelho: string = '';
  defeito: string = '';

  // --- Time Slots ---
  slots: { time: string; available: boolean }[] = [];
  slotsLoading = false;
  private slotsRequest = 0;
  assignedProfessionals: Partial<Record<string, ProfissionalPublico>> = {};
  get bookingProfessional() {
    return this.selectedPro || this.assignedProfessionals[this.selectedTime] || null;
  }

  // --- Calendar navigation ---
  calendarDays: {
    date: string;
    dayName: string;
    dayNum: number;
    monthShort: string;
    isToday: boolean;
    isSelected: boolean;
    isClosed: boolean;
  }[] = [];

  get progressValue(): number {
    const p: Record<BookingStep, number> = {
      marketplace: 0,
      step0: 10,
      step1: 33,
      step_pro: 33,
      step2: 66,
      step3: 90,
      done: 100,
    };
    return p[this.step];
  }

  get stepLabel(): string {
    const labels: Record<BookingStep, string> = {
      marketplace: 'Explorar',
      step0: 'Perfil',
      step1: `Passo 1 de 3 · Escolha o ${this.config.labelServico}`,
      step_pro: `Passo 1 de 3 · Escolha o ${this.config.labelProfissional}`,
      step2: 'Passo 2 de 3 · Selecione o horário',
      step3: 'Passo 3 de 3 · Confirmação',
      done: 'Concluído',
    };
    return labels[this.step];
  }

  get filteredServices() {
    if (this.categoriaAtiva === 'Todos') return this.services;
    return this.services.filter((s) => (s as any).categoria === this.categoriaAtiva);
  }

  get prosForSelectedService() {
    if (!this.selectedService) return [];
    return this.pros.filter(
      (p) => !p.servicos?.length || p.servicos.includes(this.selectedService!.id!),
    );
  }

  // --- Marketplace State ---
  searchQuery: string = '';
  searchResults: EstabelecimentoPublico[] = [];
  isSearching: boolean = false;
  private searchTimeout: any;

  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') || '';
    const isDirect = this.route.snapshot.queryParamMap.get('direct') === 'true';

    if (!slug) {
      this.notFound = true;
      this.step = 'marketplace';
      this.isLoading = false;
      this.performSearch(); // Busca inicial vazia
      return;
    }

    // Pré-configura o step correto para evitar flash de tela
    this.step = 'step1';

    // Subscribe to realtime changes
    this.pubService.data$.subscribe((data) => {
      if (data && data.estabelecimento) {
        this.estab = data.estabelecimento;
        void this.loadPublicPage();
        this.services = data.servicos || [];
        this.schedule = data.horarios || [];
        this.pros = data.profissionais || [];
        this.isLoading = false;
        this.notFound = false;

        // Se estava no marketplace por algum erro prévio, e agora carregou dados via socket:
        if (this.step === 'marketplace') {
          this.step = 'step1';
        }

        // Build categories from services
        const cats = new Set<string>();
        this.services.forEach((s) => {
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
        this.step = 'marketplace';
        // Mostra um toast informando que não encontrou
        try {
          const notifService = (this as any)['notifService'] || inject(NotificationService);
          notifService.showToast({
            title: 'Não Encontrado',
            message: 'O link acessado é inválido. Busque o estabelecimento abaixo.',
            type: 'WARNING',
            icon: 'pi pi-exclamation-triangle',
          });
        } catch (e) {
          console.error('Sem NotifService:', e);
        }

        this.performSearch(); // Busca inicial
      }
      // Se encontrou, step já foi configurado no início do ngOnInit
      this.cdr.detectChanges();
    } catch (e: any) {
      this.errorMsg = 'Falha ao conectar com o servidor.';
      this.isLoading = false;
    }
  }

  // --- Marketplace Methods ---
  onSearchInput() {
    this.isSearching = true;
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.performSearch();
    }, 500);
  }

  async performSearch() {
    this.isSearching = true;
    this.cdr.detectChanges();
    this.searchResults = await this.pubService.searchEstabelecimentos(this.searchQuery);
    this.isSearching = false;
    this.cdr.detectChanges();
  }

  goToEstabelecimento(slug?: string) {
    if (!slug) return;
    // Just navigate by updating window location to force reload state correctly,
    // or use router.navigate. Since we don't have Router injected, we can use location.href
    window.location.href = `/agendar/${slug}`;
  }

  // === STEP NAVIGATION ===

  async goToStep(next: BookingStep, _msg: string) {
    this.step = next;
    this.isTransitioning = false;
    this.cdr.markForCheck();
    window.scrollTo({ top: 0, behavior: 'auto' });
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
      if (this.prosForSelectedService.length === 1)
        this.selectedPro = this.prosForSelectedService[0];
      this.goStep2();
    }
  }

  pickPro(p: ProfissionalPublico | null) {
    this.selectedPro = p;
  }

  goStep2() {
    if (this.selectedService) {
      if (!this.selectedDate)
        this.selectedDate = nextOpeningDate(this.schedule, this.selectedService.duracao_min || 30);
      this.step = 'step2';
      this.buildCalendarDays();
      this.refreshSlots();
    }
  }

  // === STEP 2: Date + Time ===

  buildCalendarDays() {
    this.calendarDays = [];
    const today = new Date(bookingDate() + 'T12:00:00-03:00');
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];

    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = bookingDate(d);
      const parts = dateStr.split('-').map(Number);
      const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      const dow = day.getUTCDay();

      // Check if this day is a working day
      const dayConfig = this.schedule.find((h) => h.dia_semana === dow);
      const isClosed = !dayConfig || !dayConfig.ativo;

      this.calendarDays.push({
        date: dateStr,
        dayName: dayNames[dow],
        dayNum: day.getUTCDate(),
        monthShort: monthNames[day.getUTCMonth()],
        isToday: i === 0,
        isSelected: dateStr === this.selectedDate,
        isClosed,
      });
    }
  }

  selectDate(day: any) {
    if (day.isClosed) return;
    this.selectedDate = day.date;
    this.calendarDays.forEach((d) => (d.isSelected = d.date === day.date));
    this.refreshSlots();
  }

  async refreshSlots() {
    const request = ++this.slotsRequest;
    const date = this.selectedDate;
    this.selectedTime = '';
    this.slots = [];
    this.assignedProfessionals = {};
    this.slotsLoading = false;
    if (!date || !this.selectedService) return;
    const dow = new Date(date + 'T12:00:00-03:00').getUTCDay();
    const hours = this.schedule.find((h) => h.dia_semana === dow && h.ativo);
    if (!hours?.abre || !hours.fecha) return;
    this.slotsLoading = true;
    this.errorMsg = '';
    this.cdr.markForCheck();
    try {
      const busy = await this.pubService.getBusyIntervals(this.estab!.id!, date);
      if (request !== this.slotsRequest) return;
      const duration = this.selectedService.duracao_min || 30;
      const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      const today = date === bookingDate();
      const now = bookingMinutes(new Date());
      const candidates = this.selectedPro ? [this.selectedPro] : this.prosForSelectedService;
      for (
        let current = minutes(hours.abre);
        current + duration <= minutes(hours.fecha);
        current += 30
      ) {
        const time = `${Math.floor(current / 60)
          .toString()
          .padStart(2, '0')}:${(current % 60).toString().padStart(2, '0')}`;
        const available = candidates.find((pro) => {
          const d = pro.disponibilidades?.find((item) => item.dia_semana === dow);
          return (
            d?.ativo &&
            d.hora_inicio &&
            d.hora_fim &&
            current >= minutes(d.hora_inicio) &&
            current + duration <= minutes(d.hora_fim) &&
            !(
              d.intervalo_inicio &&
              d.intervalo_fim &&
              current < minutes(d.intervalo_fim) &&
              current + duration > minutes(d.intervalo_inicio)
            ) &&
            !slotOverlaps(date, time, duration, busy, pro.id)
          );
        });
        const free = this.pros.length ? !!available : !slotOverlaps(date, time, duration, busy);
        this.slots.push({
          time,
          available:
            free && !(today && current <= now + (this.publicPage?.deposit_percent > 0 ? 45 : 0)),
        });
        if (available) this.assignedProfessionals[time] = available;
      }
    } catch {
      if (request === this.slotsRequest)
        this.errorMsg = 'Não foi possível consultar os horários. Tente novamente.';
    } finally {
      if (request === this.slotsRequest) {
        this.slotsLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  get availableSlots() {
    return this.slots.filter((slot) => slot.available);
  }
  get hasAvailableSlots() {
    return this.availableSlots.length > 0;
  }

  selectTime(slot: any) {
    if (!slot.available) return;
    this.selectedTime = slot.time;
  }

  async confirmarStep2() {
    if (!this.selectedDate || !this.selectedTime || this.quoteLoading) return;
    this.quoteLoading = true;
    this.errorMsg = '';
    try {
      const { data, error } = await this.publicDb
        .rpc('quote_booking', {
          p_tenant: this.estab!.id,
          p_service: this.selectedService!.id,
          p_pro: this.bookingProfessional?.id || null,
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (error || !data) throw Error('Não foi possível conferir o valor. Tente novamente.');
      this.quote = data;
      await this.goToStep('step3', 'Preparando resumo...');
    } catch (e) {
      this.errorMsg = e instanceof Error ? e.message : 'Não foi possível conferir o valor.';
    } finally {
      this.quoteLoading = false;
      this.cdr.markForCheck();
    }
  }

  // === STEP 3: Confirm & Book (NO LOGIN!) ===

  formatPhone(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.substring(0, 11);

    if (value.length >= 7) {
      value = `(${value.substring(0, 2)}) ${value.substring(2, 7)}-${value.substring(7)}`;
    } else if (value.length >= 3) {
      value = `(${value.substring(0, 2)}) ${value.substring(2)}`;
    }
    this.custPhone = value;
  }

  async finalize() {
    const nameClean = this.custName.trim();
    const phoneClean = this.custPhone.replace(/\D/g, '');

    if (nameClean.length < 2) {
      this.errorMsg = 'Informe seu nome com pelo menos duas letras.';
      return;
    }
    if (phoneClean.length < 10) {
      this.errorMsg = 'Informe um telefone válido com DDD.';
      return;
    }

    if (this.isSaving) return;
    if (!this.selectedService || !this.selectedDate || !this.selectedTime) {
      this.errorMsg = 'Escolha um serviço e horário antes de confirmar.';
      return;
    }
    if (this.pros.length && !this.bookingProfessional) {
      this.errorMsg = 'O horário mudou. Escolha um horário disponível novamente.';
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';

    try {
      let eventMeta: any = null;
      if (this.config.id === 'assistencia') {
        if (!this.aparelho || !this.defeito) {
          this.errorMsg = 'Por favor, informe o Aparelho e o Defeito.';
          this.isSaving = false;
          return;
        }
        eventMeta = { aparelho: this.aparelho, defeito: this.defeito };
      }
      if (this.config.id === 'petshop') {
        if (!this.petNome.trim()) {
          this.errorMsg = 'Informe o nome do pet.';
          this.isSaving = false;
          return;
        }
        eventMeta = {
          pet_nome: this.petNome.trim(),
          pet_raca: this.petRaca.trim(),
          pet_porte: this.petPorte,
          pet_cuidados: this.petCuidados.trim(),
        };
      }
      const startDt = new Date(`${this.selectedDate}T${this.selectedTime}:00-03:00`);
      const duration = this.selectedService?.duracao_min || 30;
      const endDt = new Date(startDt.getTime() + duration * 60000);

      const eventTitle = `${this.selectedService?.emoji || this.config.emojiPadrao} ${nameClean} | ${this.selectedService?.titulo}`;

      const fingerprint = JSON.stringify([
        this.estab!.id,
        this.selectedService?.id,
        this.bookingProfessional?.id,
        startDt.toISOString(),
        nameClean,
        phoneClean,
        eventMeta,
      ]);
      if (this.reservationAttempt.fingerprint !== fingerprint)
        this.reservationAttempt = { fingerprint, key: crypto.randomUUID() };
      // Call the public API — NO AUTH REQUIRED
      const response = await fetch('/api/public-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimento_id: this.estab!.id,
          servico_id: this.selectedService?.id,
          profissional_id: this.bookingProfessional?.id || null,
          start: this.toLocalISO(startDt),
          end: this.toLocalISO(endDt),
          cliente_nome: nameClean,
          cliente_telefone: phoneClean,
          title: eventTitle,
          event_metadata: eventMeta,
          reservation_key: this.reservationAttempt.key,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar agendamento.');
      }

      if (result.deposit_token) {
        window.location.assign('/comanda/' + encodeURIComponent(result.deposit_token));
        return;
      }
      this.bookingPending = result.event?.status === 'pendente';
      this.goToStep(
        'done',
        this.bookingPending ? 'Enviando seu pedido...' : 'Confirmando sua reserva...',
      );
    } catch (err: any) {
      this.errorMsg = err.message || 'Erro ao criar agendamento.';
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  // === UTILS ===

  private toLocalISO(d: Date): string {
    return d.toISOString();
  }

  getInitials(name?: string): string {
    if (!name) return 'AI';
    const parts = name.split(' ').filter((p) => p.length > 0);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }

  formatDate(d: string) {
    return d
      ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        })
      : '';
  }

  formatPrice(price: number): string {
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  newBooking() {
    this.reservationAttempt = { fingerprint: '', key: crypto.randomUUID() };
    this.quote = null;
    this.step = 'step1';
    this.selectedService = null;
    this.selectedPro = null;
    this.selectedDate = '';
    this.selectedTime = '';
    this.petNome = '';
    this.petRaca = '';
    this.petPorte = '';
    this.petCuidados = '';
    this.aparelho = '';
    this.defeito = '';
    this.custName = '';
    this.custPhone = '';
    this.errorMsg = '';
    this.isSaving = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
