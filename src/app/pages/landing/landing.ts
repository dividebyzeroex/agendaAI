import { Component, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef } from '@angular/core';
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

  // Scrollytelling State
  scrollProgress = 0;
  chatMessages = [
    { type: 'user', text: 'Oi, tem horário livre hoje à tarde?', delay: 0 },
    { type: 'ai', text: 'Olá! Temos às 15:00 ou 16:30. Qual você prefere?', delay: 500 },
    { type: 'user', text: 'Pode ser 16:30!', delay: 1000 },
    { type: 'ai', text: 'Marcado! Seu agendamento para 16:30 foi confirmado.', delay: 1500, triggerEvent: true }
  ];
  visibleMessages: any[] = [];
  eventBooked = false;

  // Chameleon Showcase State
  activeNicheId = 'clinica';
  niches = [
    { id: 'clinica', title: 'Saúde & Estética', icon: 'pi-heart', color: '#10b981', chat: 'Gostaria de agendar um retorno.', event: 'Consulta - Dra. Ana', detail: 'Prontuário e Histórico' },
    { id: 'barbearia', title: 'Barbearias', icon: 'pi-scissors', color: '#f59e0b', chat: 'Tem horário para cabelo e barba hoje?', event: 'Corte + Barba', detail: 'Fila de Espera' },
    { id: 'assistencia', title: 'Oficinas & Assistência', icon: 'pi-wrench', color: '#3b82f6', chat: 'Meu iPhone 13 quebrou a tela.', event: 'OS: Tela iPhone 13', detail: 'Aparelho e Defeito' },
    { id: 'petshop', title: 'Petshops', icon: 'pi-star', color: '#8b5cf6', chat: 'Queria marcar banho pro Rex.', event: 'Banho - Rex (Golden)', detail: 'Perfil do Tutor' }
  ];

  get activeNiche() {
    return this.niches.find(n => n.id === this.activeNicheId);
  }

  private observer: IntersectionObserver | null = null;

  constructor(private router: Router, private el: ElementRef) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.setupIntersectionObserver();
    this.setupScrollytellingObserver();
  }

  ngOnDestroy() {
    if (this.observer) this.observer.disconnect();
  }

  private setupIntersectionObserver() {
    const options = { root: null, rootMargin: '0px', threshold: 0.15 };
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, options);
    const revealElements = this.el.nativeElement.querySelectorAll('.reveal');
    revealElements.forEach((el: Element) => this.observer?.observe(el));
  }

  private setupScrollytellingObserver() {
    // A simple observer to trigger the chat animation when the scrollytelling section comes into view
    const triggerOptions = { root: null, rootMargin: '0px', threshold: 0.5 };
    const scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.visibleMessages.length === 0) {
          this.playChatAnimation();
        }
      });
    }, triggerOptions);
    
    const scrollSection = this.el.nativeElement.querySelector('.scrolly-container');
    if (scrollSection) scrollObserver.observe(scrollSection);
  }

  playChatAnimation() {
    this.visibleMessages = [];
    this.eventBooked = false;
    
    this.chatMessages.forEach((msg, index) => {
      setTimeout(() => {
        this.visibleMessages.push(msg);
        if (msg.triggerEvent) {
          setTimeout(() => this.eventBooked = true, 500);
        }
      }, msg.delay + (index * 800)); // Staggered delays
    });
  }

  setActiveNiche(id: string) {
    this.activeNicheId = id;
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
