import { bookingDate, bookingMinutes, slotOverlaps, BusyInterval } from '../../utils/booking-slots';
import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EstabelecimentoPublicoService, EstabelecimentoPublico, ProfissionalPublico } from '../../services/estabelecimento-publico.service';
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
  private route      = inject(ActivatedRoute);
  private pubService = inject(EstabelecimentoPublicoService);
  private cdr        = inject(ChangeDetectorRef);
  private notifService = inject(NotificationService);

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

  // --- Extra Metadata (Nicho) ---
  aparelho: string = '';
  defeito: string = '';

  // --- Time Slots ---
  slots: { time: string; available: boolean }[] = [];

  // --- Calendar navigation ---
  calendarDays: { date: string; dayName: string; dayNum: number; monthShort: string; isToday: boolean; isSelected: boolean; isClosed: boolean }[] = [];

  get progressValue(): number {
    const p: Record<BookingStep, number> = { marketplace: 0, step0: 10, step1: 25, step_pro: 50, step2: 75, step3: 90, done: 100 };
    return p[this.step];
  }

  get stepLabel(): string {
    const labels: Record<BookingStep, string> = {
      marketplace: 'Explorar',
      step0: 'Perfil',
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
    this.step = isDirect ? 'step1' : 'step0';

    // Subscribe to realtime changes
    this.pubService.data$.subscribe(data => {
      if (data && data.estabelecimento) {
        this.estab  …2495 tokens truncated…/ Call the public API — NO AUTH REQUIRED
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
          event_metadata: eventMeta
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar agendamento.');
      }

      this.goToStep('done', 'Confirmando sua reserva...');
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
