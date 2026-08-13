import { Component, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing implements OnInit, AfterViewInit, OnDestroy {
  isScrolled = false;
  isMobileMenuOpen = false;

  // Scrollytelling
  chatMessages = [
    { type: 'user', text: 'Oi, tem horário livre hoje à tarde?', delay: 0, triggerEvent: false },
    { type: 'ai', text: 'Olá! Temos às 15:00 ou 16:30. Qual você prefere?', delay: 500, triggerEvent: false },
    { type: 'user', text: 'Pode ser 16:30!', delay: 1000, triggerEvent: false },
    { type: 'ai', text: 'Pronto! Seu agendamento para 16:30 foi confirmado. Até lá!', delay: 1500, triggerEvent: true }
  ];
  visibleMessages: any[] = [];
  eventBooked = false;

  // Chameleon Showcase
  activeNicheId = 'clinica';
  niches = [
    { id: 'clinica', title: 'Saúde & Estética', icon: 'pi-heart', color: '#10b981', chat: 'Gostaria de agendar um retorno.', event: 'Consulta — Dra. Ana', detail: 'Prontuário e Histórico' },
    { id: 'barbearia', title: 'Barbearias', icon: 'pi-hashtag', color: '#f59e0b', chat: 'Tem horário para cabelo e barba hoje?', event: 'Corte + Barba', detail: 'Fila de Espera' },
    { id: 'assistencia', title: 'Oficinas & Assistência', icon: 'pi-wrench', color: '#3b82f6', chat: 'Meu iPhone 13 quebrou a tela.', event: 'OS: Tela iPhone 13', detail: 'Aparelho e Defeito' },
    { id: 'petshop', title: 'Petshops', icon: 'pi-star', color: '#8b5cf6', chat: 'Queria marcar banho pro Rex.', event: 'Banho — Rex (Golden)', detail: 'Perfil do Tutor' }
  ];

  get activeNiche() {
    return this.niches.find(n => n.id === this.activeNicheId);
  }

  // Stats (animated counters)
  stats = [
    { value: 0, target: 24, suffix: '/7', label: 'Disponibilidade' },
    { value: 0, target: 80, suffix: '%', label: 'Menos faltas' },
    { value: 0, target: 1, suffix: 's', label: 'Tempo de resposta' },
    { value: 0, target: 500, suffix: '+', label: 'Negócios ativos' }
  ];
  statsAnimated = false;

  // FAQ
  faqs = [
    { question: 'Preciso de conhecimento técnico para configurar?', answer: 'Não. O cadastro leva menos de 2 minutos. Você configura os serviços, horários e profissionais, e o sistema está pronto para receber agendamentos.', expanded: false },
    { question: 'A inteligência artificial vai soar artificial para meus clientes?', answer: 'O assistente utiliza linguagem natural e humanizada. As respostas são cordiais, diretas e adaptadas ao vocabulário do seu segmento.', expanded: false },
    { question: 'E se o cliente quiser cancelar fora do horário comercial?', answer: 'O sistema processa cancelamentos e reagendamentos a qualquer hora. Quando um horário é liberado, a lista de espera é notificada automaticamente.', expanded: false },
    { question: 'O sistema funciona junto com a minha equipe de recepção?', answer: 'Perfeitamente. Ele é um complemento, não uma substituição. Sua equipe continua no comando — o AgendaAi apenas cuida das tarefas repetitivas.', expanded: false }
  ];

  private observer: IntersectionObserver | null = null;
  private scrollyObserver: IntersectionObserver | null = null;
  private statsObserver: IntersectionObserver | null = null;

  constructor(private router: Router, private el: ElementRef, private zone: NgZone) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.setupIntersectionObserver();
    this.setupScrollytellingObserver();
    this.setupStatsObserver();
    this.setupBentoGlow();
  }

  ngOnDestroy() {
    if (this.observer) this.observer.disconnect();
    if (this.scrollyObserver) this.scrollyObserver.disconnect();
    if (this.statsObserver) this.statsObserver.disconnect();
  }

  // --- Reveal on scroll ---
  private setupIntersectionObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 0.12 });

    const revealElements = this.el.nativeElement.querySelectorAll('.reveal');
    revealElements.forEach((el: Element) => this.observer?.observe(el));
  }

  // --- Chat animation trigger ---
  private setupScrollytellingObserver() {
    this.scrollyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.visibleMessages.length === 0) {
          this.playChatAnimation();
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 0.4 });

    const section = this.el.nativeElement.querySelector('.scrolly-container');
    if (section) this.scrollyObserver.observe(section);
  }

  playChatAnimation() {
    this.visibleMessages = [];
    this.eventBooked = false;
    this.chatMessages.forEach((msg, i) => {
      setTimeout(() => {
        this.visibleMessages = [...this.visibleMessages, msg];
        if (msg.triggerEvent) {
          setTimeout(() => this.eventBooked = true, 600);
        }
      }, 600 + (i * 1200));
    });
  }

  // --- Stats counter animation ---
  private setupStatsObserver() {
    this.statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.statsAnimated) {
          this.statsAnimated = true;
          this.animateCounters();
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 0.5 });

    const section = this.el.nativeElement.querySelector('.stats-bar');
    if (section) this.statsObserver.observe(section);
  }

  private animateCounters() {
    this.stats.forEach(stat => {
      const duration = 1500;
      const steps = 40;
      const increment = stat.target / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= stat.target) {
          stat.value = stat.target;
          clearInterval(interval);
        } else {
          stat.value = Math.round(current);
        }
      }, duration / steps);
    });
  }

  // --- Bento card cursor glow ---
  private setupBentoGlow() {
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        const cards = this.el.nativeElement.querySelectorAll('.bento-item');
        cards.forEach((card: HTMLElement) => {
          card.addEventListener('mousemove', (e: MouseEvent) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
          });
        });
      }, 500);
    });
  }

  setActiveNiche(id: string) {
    this.activeNicheId = id;
  }

  toggleFaq(index: number) {
    this.faqs[index].expanded = !this.faqs[index].expanded;
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 50;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  scrollTo(sectionId: string) {
    this.isMobileMenuOpen = false;
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }
}
