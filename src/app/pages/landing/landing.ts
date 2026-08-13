import { Component, HostListener, OnInit, AfterViewInit, OnDestroy, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface NicheConfig {
  id: string;
  title: string;
  badge: string;
  icon: string;
  color: string;
  gradient: string;
  clientName: string;
  clientAvatar: string;
  chatUser: string;
  chatAi: string;
  serviceName: string;
  servicePrice: string;
  duration: string;
  professional: string;
  specialModule: string;
  specialValue: string;
}

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
  isAnnual = true;

  // Chameleon Niches
  activeNicheId = 'clinica';
  niches: NicheConfig[] = [
    {
      id: 'clinica',
      title: 'Saúde & Clínicas',
      badge: 'Prontuário Integrado',
      icon: 'pi-heart-fill',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
      clientName: 'Dra. Camila Torres',
      clientAvatar: 'https://images.unsplash.com/photo-1594824813589-9a0083111f18?w=120&auto=format&fit=crop&q=80',
      chatUser: 'Olá! Gostaria de agendar consulta com a dermatologista para sexta-feira.',
      chatAi: 'Olá Mariana! Temos às 14h30 ou 16h com a Dra. Camila. Qual horário prefere?',
      serviceName: 'Consulta Dermatológica',
      servicePrice: 'R$ 280,00',
      duration: '45 min',
      professional: 'Dra. Camila Torres (CRM 12498)',
      specialModule: 'Prontuário Médico & Anamnese',
      specialValue: 'Histórico clínico vinculado automaticamente'
    },
    {
      id: 'barbearia',
      title: 'Barbearias & Salões',
      badge: 'Fila Inteligente',
      icon: 'pi-tag',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      clientName: 'Don Corleone Studio',
      clientAvatar: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=120&auto=format&fit=crop&q=80',
      chatUser: 'E aí irmão, tem vaga pra corte degradê e barba hoje às 18h?',
      chatAi: 'Fala Lucas! Às 18h com o mestre Rodrigo tá liberado. Posso garantir sua cadeira?',
      serviceName: 'Corte Degradê + Barba Terapia',
      servicePrice: 'R$ 95,00',
      duration: '50 min',
      professional: 'Rodrigo Barber (Cadeira 02)',
      specialModule: 'Fila de Espera Automática (Walk-in)',
      specialValue: 'Encaixe automático caso ocorra desistência'
    },
    {
      id: 'petshop',
      title: 'Pet Shops & Vet',
      badge: 'Ficha Pet',
      icon: 'pi-star-fill',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
      clientName: 'Pet Imperial Club',
      clientAvatar: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=120&auto=format&fit=crop&q=80',
      chatUser: 'Oi! Quero agendar banho e tosa higiênica pro Thor (Golden Retriever) no sábado.',
      chatAi: 'Olá Paula! Thor vai ser muito bem cuidado. Temos vaga às 10h no sábado com táxi dog disponível!',
      serviceName: 'Banho Premium + Tosa Higiênica',
      servicePrice: 'R$ 130,00',
      duration: '1h 30m',
      professional: 'Groomer Especialista Lucas',
      specialModule: 'Ficha Cadastral do Pet & Vacinas',
      specialValue: 'Thor • Golden • 3 anos • Porte Grande'
    },
    {
      id: 'estetica',
      title: 'Estética & Spas',
      badge: 'Pacotes & Sessões',
      icon: 'pi-sparkles',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981, #059669)',
      clientName: 'Glow Spa & Estética',
      clientAvatar: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=120&auto=format&fit=crop&q=80',
      chatUser: 'Boa tarde! Quero marcar uma massagem relaxante e drenagem.',
      chatAi: 'Boa tarde Beatriz! Temos a Sala Zen reservada para você hoje às 17h com a Terapeuta Clara.',
      serviceName: 'Sessão Relaxante Aromática',
      servicePrice: 'R$ 190,00',
      duration: '1 hora',
      professional: 'Terapeuta Clara Santos',
      specialModule: 'Controle de Pacotes e Recorrência',
      specialValue: 'Sessão 3 de 5 (Pacote Drenagem Ouro)'
    },
    {
      id: 'assistencia',
      title: 'Oficinas & Tech',
      badge: 'Ordem de Serviço',
      icon: 'pi-cog',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
      clientName: 'TechFix Premium Lab',
      clientAvatar: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=120&auto=format&fit=crop&q=80',
      chatUser: 'Preciso trocar a bateria do meu iPhone 13 hoje com urgência.',
      chatAi: 'Claro Eduardo! Temos a peça original pronta para troca expressa às 15h. Leva 30 min.',
      serviceName: 'Troca de Bateria Original iPhone',
      servicePrice: 'R$ 380,00',
      duration: '35 min',
      professional: 'Bancada Express Lab 01',
      specialModule: 'Ordem de Serviço com Termo de Garantia',
      specialValue: 'OS #4912 • Garantia 90 dias • Laudo Digital'
    }
  ];

  get activeNiche(): NicheConfig {
    return this.niches.find(n => n.id === this.activeNicheId) || this.niches[0];
  }

  // Scrollytelling simulation messages
  chatSimMessages = [
    { type: 'user', text: 'Boa tarde! Vocês atendem hoje às 16h30?', time: '14:32' },
    { type: 'ai', text: 'Olá Juliana! Sim! Temos horário disponível com a Dra. Camila às 16h30. Deseja confirmar agora?', time: '14:32' },
    { type: 'user', text: 'Sim, por favor! Pode marcar no meu nome.', time: '14:33' },
    { type: 'ai', text: 'Agendado com sucesso! ✅ Você receberá o lembrete 2h antes no WhatsApp. Até logo!', time: '14:33', trigger: true }
  ];
  visibleSimMessages: any[] = [];
  isSimEventBooked = false;
  private simTimeout: any;

  // Stats Counters
  stats = [
    { value: 0, target: 24, suffix: '/7', label: 'Atendimento Autônomo', desc: 'Sua agenda nunca dorme' },
    { value: 0, target: 84, suffix: '%', label: 'Menos No-Shows', desc: 'Confirmação via WhatsApp' },
    { value: 0, target: 1, suffix: 's', label: 'Tempo de Resposta', desc: 'Conversão instantânea' },
    { value: 0, target: 500, suffix: '+', label: 'Empresas Ativas', desc: 'Em todo o Brasil' }
  ];
  statsAnimated = false;

  // FAQs
  faqs = [
    {
      question: 'Como a Inteligência Artificial responde meus clientes?',
      answer: 'O AgendaAi se conecta ao seu WhatsApp de forma oficial e segura. Quando um cliente manda mensagem (áudio ou texto), a IA compreende a solicitação em linguagem natural, consulta seus horários livres em tempo real e fecha o agendamento sem intervenção manual.',
      expanded: true
    },
    {
      question: 'O sistema substitui minha recepcionista ou secretária?',
      answer: 'Não! O sistema funciona como um superpoder para a sua equipe. Ele cuida do trabalho repetitivo e das mensagens de madrugada ou fins de semana, permitindo que suas recepcionistas foquem no atendimento presencial de excelência e no relacionamento com os clientes.',
      expanded: false
    },
    {
      question: 'Posso personalizar as regras, horários e preços da minha empresa?',
      answer: '100% personalizável. Você define os serviços, tempos de intervalo, profissionais, regras de comissão, formas de pagamento e até o tom de voz da IA (formal, descontraído, com gírias do seu segmento, etc.).',
      expanded: false
    },
    {
      question: 'E se o cliente enviar um áudio no WhatsApp?',
      answer: 'Nosso motor de IA transcreve e interpreta áudios com extrema precisão, identificando o dia, horário e serviço desejado tão rápido quanto uma mensagem de texto.',
      expanded: false
    },
    {
      question: 'Preciso instalar algum software pesado no computador?',
      answer: 'Nenhum! O AgendaAi é 100% em nuvem e roda perfeitamente em qualquer celular, tablet ou computador. Você acessa o painel de onde estiver.',
      expanded: false
    },
    {
      question: 'Como funciona o teste gratuito?',
      answer: 'Você ganha 7 dias de acesso completo sem compromisso. Não cobramos taxa de adesão e você pode cancelar com 1 clique a qualquer momento.',
      expanded: false
    }
  ];

  // Testimonials
  testimonials = [
    {
      name: 'Dra. Beatriz Albuquerque',
      role: 'Diretora Clínica • DermaPrime',
      avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&auto=format&fit=crop&q=80',
      text: 'Nossa taxa de faltas despencou de 28% para menos de 4% no primeiro mês. O cliente adora a rapidez de agendar pelo WhatsApp.',
      rating: 5,
      metric: '+R$ 18.400 recuperados/mês'
    },
    {
      name: 'Marcelo Rossi',
      role: 'Sócio Fundador • Barbearia Dom Pedro (3 unidades)',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
      text: 'Antes a gente perdia dezenas de clientes aos domingos e à noite. Agora a agenda de segunda-feira amanhece 100% lotada no automático.',
      rating: 5,
      metric: '+340 novos cortes/mês'
    },
    {
      name: 'Juliana Mendes',
      role: 'Proprietária • Studio Belle & Spa',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      text: 'O fato de o sistema se adaptar ao prontuário e às particularidades do nosso espaço fez toda a diferença. Não troco por nada.',
      rating: 5,
      metric: 'Economia de 3h diárias'
    }
  ];

  constructor(
    private router: Router, 
    private el: ElementRef, 
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.startChatSimulationLoop();
    this.animateCountersImmediately();
  }

  ngAfterViewInit() {
    this.setupIntersectionObserver();
  }

  ngOnDestroy() {
    if (this.simTimeout) clearTimeout(this.simTimeout);
  }

  private setupIntersectionObserver() {
    try {
      const options = { root: null, rootMargin: '0px', threshold: 0.08 };
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      }, options);

      const revealElements = this.el.nativeElement.querySelectorAll('.reveal');
      revealElements.forEach((el: Element) => {
        el.classList.add('active'); // Garante que tudo fica visível imediatamente
        observer.observe(el);
      });
    } catch (e) {
      // Fallback
      const revealElements = this.el.nativeElement.querySelectorAll('.reveal');
      revealElements.forEach((el: Element) => el.classList.add('active'));
    }
  }

  startChatSimulationLoop() {
    this.visibleSimMessages = [];
    this.isSimEventBooked = false;
    this.cdr.detectChanges();

    let cumulativeDelay = 400;
    this.chatSimMessages.forEach((msg, index) => {
      this.simTimeout = setTimeout(() => {
        this.visibleSimMessages.push(msg);
        if (msg.trigger) {
          setTimeout(() => {
            this.isSimEventBooked = true;
            this.cdr.detectChanges();
          }, 400);
        }
        this.cdr.detectChanges();
      }, cumulativeDelay);
      cumulativeDelay += (index === 1 ? 1600 : 1200);
    });

    // Loop replay every 14 seconds
    this.simTimeout = setTimeout(() => {
      this.startChatSimulationLoop();
    }, 14000);
  }

  private animateCountersImmediately() {
    if (this.statsAnimated) return;
    this.statsAnimated = true;
    this.stats.forEach(stat => {
      const duration = 1200;
      const steps = 30;
      const increment = stat.target / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= stat.target) {
          stat.value = stat.target;
          clearInterval(interval);
          this.cdr.detectChanges();
        } else {
          stat.value = Math.round(current);
          this.cdr.detectChanges();
        }
      }, duration / steps);
    });
  }

  setActiveNiche(id: string) {
    this.activeNicheId = id;
    this.cdr.detectChanges();
  }

  toggleFaq(index: number) {
    this.faqs[index].expanded = !this.faqs[index].expanded;
  }

  toggleBilling(annual: boolean) {
    this.isAnnual = annual;
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 40;
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
