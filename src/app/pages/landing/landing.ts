import { Component, HostListener, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface SegmentDetail {
  id: string;
  name: string;
  category: string;
  headline: string;
  description: string;
  terms: { label: string; value: string }[];
  chatExample: {
    client: string;
    clientMsg: string;
    aiResponse: string;
    serviceTag: string;
    timeTag: string;
  };
  features: string[];
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing implements OnInit {
  pilot = {business_name:'',email:'',website:'',termsAccepted:false};
  pilotSending = false;
  pilotMessage = '';
  async requestPilot() {
    if (this.pilotSending) return;
    this.pilotSending = true; this.pilotMessage = '';
    try {
      const response = await fetch('/api/commercial?action=interest', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.pilot)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar agora.');
      this.pilotMessage = 'Interesse registrado. Você pode iniciar seu cadastro gratuito pelo botão acima. Nenhuma cobrança foi criada.';
      this.pilot = {business_name:'',email:'',website:'',termsAccepted:false};
    } catch (error) { this.pilotMessage = error instanceof Error ? error.message : 'Tente novamente.'; }
    finally { this.pilotSending = false; this.cdr.detectChanges(); }
  }
  isScrolled = false;
  isMobileMenuOpen = false;
  isAnnualBilling = false;

  // Active Segment in Chameleon section
  activeSegmentId = 'barbearia';
  segments: SegmentDetail[] = [
    {
      id: 'saude',
      name: 'Clínicas & Consultórios',
      category: 'Saúde & Medicina',
      headline: 'Organize consultas e a agenda dos profissionais.',
      description: 'Centralize os horários de consultas e o cadastro de clientes. Configure orientações administrativas e mantenha decisões clínicas sob responsabilidade do profissional.',
      terms: [
        { label: 'Vocabulário', value: 'Consultas, Retornos, Procedimentos' },
        { label: 'Documentação', value: 'Cadastro de clientes e serviços' },
        { label: 'Regra de Encaixe', value: 'Horários definidos pelo estabelecimento' }
      ],
      chatExample: {
        client: 'Dra. Camila, teria horário para consulta dermatológica esta semana?',
        clientMsg: 'Olá! Gostaria de marcar uma consulta com a Dra. Camila para quinta ou sexta-feira à tarde.',
        aiResponse: 'Olá Mariana! A Dra. Camila tem disponibilidade na quinta-feira às 15h30 ou na sexta às 14h00. Qual desses horários se encaixa melhor na sua rotina?',
        serviceTag: 'Consulta Dermatológica',
        timeTag: 'Quinta, 15:30'
      },
      features: [
        'Cadastro de serviços e duração das consultas',
        'Organização da disponibilidade dos profissionais',
        'Acompanhamento dos agendamentos da equipe'
      ]
    },
    {
      id: 'barbearia',
      name: 'Barbearias & Salões',
      category: 'Beleza & Estilo',
      headline: 'Agenda, equipe e serviços em um só lugar.',
      description: 'Cadastre cortes, barbas e tratamentos, organize os horários de cada profissional e compartilhe seu link de agendamento com os clientes.',
      terms: [
        { label: 'Vocabulário', value: 'Cortes, Barbas, Cadeiras, Horários' },
        { label: 'Operação', value: 'Visualização dos horários de atendimento' },
        { label: 'Financeiro', value: 'Acompanhamento de comandas e comissões' }
      ],
      chatExample: {
        client: 'Tem horário com o Rodrigo hoje?',
        clientMsg: 'E aí, tem vaga pra corte degradê e barba hoje por volta das 18h?',
        aiResponse: 'Fala Gabriel! Às 18h com o Rodrigo está livre. Deseja que eu confirme sua cadeira agora?',
        serviceTag: 'Corte Degradê + Barba Terapia',
        timeTag: 'Hoje, 18:00'
      },
      features: [
        'Visualização dos horários disponíveis',
        'Cadastro de serviços e produtos',
        'Cadastro de horários e pausas da equipe'
      ]
    },
    {
      id: 'estetica',
      name: 'Estética & Bem-estar',
      category: 'Estética & Spa',
      headline: 'Dê mais clareza à rotina dos atendimentos.',
      description: 'Cadastre os serviços e os profissionais e acompanhe seus agendamentos. Valide durante o teste as necessidades específicas do seu espaço.',
      terms: [
        { label: 'Vocabulário', value: 'Sessões, Protocolos, Pacotes, Salas' },
        { label: 'Acompanhamento', value: 'Histórico de agendamentos' },
        { label: 'Recorrência', value: 'Organização dos próximos atendimentos' }
      ],
      chatExample: {
        client: 'Quero agendar a sessão 3 do meu pacote',
        clientMsg: 'Boa tarde! Gostaria de marcar a minha terceira sessão de drenagem com a Clara.',
        aiResponse: 'Olá Juliana! Vamos consultar os horários da Clara para sua próxima sessão. Você prefere atendimento pela manhã ou à tarde?',
        serviceTag: 'Drenagem Linfática',
        timeTag: 'Amanhã, 16:00'
      },
      features: [
        'Cadastro de clientes e profissionais',
        'Definição de serviços e sua duração',
        'Configuração de orientações administrativas'
      ]
    },
    {
      id: 'pet',
      name: 'Pet Shops & Veterinárias',
      category: 'Mercado Pet',
      headline: 'Organize os serviços e os horários da equipe.',
      description: 'Cadastre serviços como banho e tosa e organize a disponibilidade da equipe. Adapte as orientações do atendimento ao seu estabelecimento.',
      terms: [
        { label: 'Vocabulário', value: 'Banho, Tosa, Porte, Vacinas, Táxi Dog' },
        { label: 'Identificação', value: 'Cadastro de contato dos clientes' },
        { label: 'Logística', value: 'Organização da disponibilidade da equipe' }
      ],
      chatExample: {
        client: 'Banho e tosa pro Thor no sábado',
        clientMsg: 'Oi! Preciso marcar banho e tosa na tesoura pro Thor (Golden) neste sábado.',
        aiResponse: 'Olá Paula! Vamos consultar a disponibilidade para o banho e tosa do Thor. Você prefere o período da manhã ou da tarde?',
        serviceTag: 'Banho & Tosa na Tesoura • Porte Grande',
        timeTag: 'Sábado, 09:30'
      },
      features: [
        'Cadastro dos serviços do estabelecimento',
        'Consulta dos agendamentos da equipe',
        'Configuração das mensagens de atendimento'
      ]
    }
  ];

  get activeSegment(): SegmentDetail {
    return this.segments.find(s => s.id === this.activeSegmentId) || this.segments[0];
  }

  faqs = [
    { q: 'O que está incluído nos 30 dias gratuitos?', a: 'Um período para avaliar a plataforma com sua empresa, configurar a agenda e conhecer os recursos disponíveis. Não pedimos cartão e não existe cobrança automática ao terminar o teste. A contratação de um plano é uma decisão separada.', open: true },
    { q: 'Posso compartilhar a agenda no WhatsApp?', a: 'Sim. Compartilhe o link público do seu estabelecimento no WhatsApp, Instagram ou site. O cliente escolhe o serviço e o horário pelo link. Um robô de conversa no WhatsApp não está incluído nesta oferta.', open: false },
    { q: 'Minha equipe continua no controle?', a: 'O painel permite acompanhar clientes, profissionais e agendamentos. A equipe deve revisar as configurações e supervisionar respostas de IA, especialmente em situações que exigem julgamento humano.', open: false },
    { q: 'Vocês garantem redução de faltas ou mais vendas?', a: 'Não prometemos resultados fixos. A proposta é apoiar a organização e o acompanhamento dos atendimentos. Use o teste para medir os efeitos na sua operação e decidir com dados reais.', open: false },
    { q: 'Como funciona a contratação depois do teste?', a: 'Você escolhe um plano e confirma as condições e o pagamento quando a contratação estiver disponível. O teste não gera uma assinatura automática. Consulte os termos para entender os requisitos da operação comercial.', open: false }
  ];

  constructor(
    private router: Router,
    private el: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() { this.segments = this.segments.filter(segment => ['barbearia', 'estetica'].includes(segment.id)); }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 30;
  }

  selectSegment(id: string) {
    this.activeSegmentId = id;
    this.cdr.detectChanges();
  }

  toggleFaq(index: number) {
    this.faqs[index].open = !this.faqs[index].open;
  }

  toggleBilling(annual: boolean) {
    this.isAnnualBilling = annual;
  }

  signIn() { this.router.navigate(['/login']); }

  goToLogin() {
    this.router.navigate(['/login'], { queryParams: { trial: 30 } });
  }

  scrollTo(id: string) {
    this.isMobileMenuOpen = false;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }
}
