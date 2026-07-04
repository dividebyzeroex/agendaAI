import { Component, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
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
  mouseY = 0;
  mouseX = 0;
  isScrolled = false;
  isMobileMenuOpen = false;

  private observer: IntersectionObserver | null = null;

  constructor(private router: Router, private el: ElementRef) {}

  ngOnInit() {
    // Inicializações, se necessário
  }

  ngAfterViewInit() {
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    // Limpeza se necessário
  }

  private setupIntersectionObserver() {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.15
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          // Opcional: parar de observar após a animação (para animar só na primeira vez)
          // this.observer?.unobserve(entry.target);
        }
      });
    }, options);

    const revealElements = this.el.nativeElement.querySelectorAll('.reveal');
    revealElements.forEach((el: Element) => this.observer?.observe(el));
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

  faqs = [
    { question: 'O AgendaAi funciona se eu já tiver um sistema antigo?', answer: 'Com certeza! Nosso agente atua diretamente em cima da comunicação, rodando em paralelo até você se sentir seguro de migrar 100%.', expanded: false },
    { question: 'A Inteligência Artificial vai soar robótica para meus clientes?', answer: 'Zero. A IA usa linguagem humanizada de alto nível, com direito a emoticons na medida certa, gírias locais (se treinado) e altíssima cordialidade.', expanded: false },
    { question: 'Preciso de um desenvolvedor para configurar?', answer: 'Não. Nossa configuração leva menos de 1 minuto! Você escaneia o QR Code, a IA aprende com suas instruções básicas e já nasce pronta.', expanded: false },
    { question: 'E se o cliente quiser cancelar de madrugada?', answer: 'Esse é o poder do AgendaAi! O software cancela e instantaneamente envia mensagem para sua lista de espera preenchendo o buraco no dia seguinte.', expanded: false }
  ];

  toggleFaq(index: number) {
    this.faqs[index].expanded = !this.faqs[index].expanded;
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }
}
