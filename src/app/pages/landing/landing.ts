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
  goToDemo(){this.router.navigate(['/demonstracao'],{queryParams:{segmento:this.activeSegmentId==='pet'?'petshop':this.activeSegmentId==='estetica'?'estetica':'barbearia'}});}
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

  readonly capabilities = [
    {category:'AGENDA',icon:'pi-calendar',name:'Agendamento online',description:'Link público para reservar serviço, profissional e horário. Compartilhe pelo Instagram, WhatsApp ou site.'},
    {category:'RECEPÇÃO',icon:'pi-clock',name:'Fila e encaixes',description:'Acompanhe quem chegou sem agendamento, organize o atendimento e encaixe horários quando necessário.'},
    {category:'ATENDIMENTO',icon:'pi-receipt',name:'Comandas e comissões',description:'Registre serviços e produtos, acompanhe o caixa e consulte os repasses da equipe.'},
    {category:'RECEBIMENTOS',icon:'pi-credit-card',name:'Pagamentos e sinal',description:'Recebimentos online e reservas com sinal, conforme o provedor conectado e as condições aplicáveis.',note:'Integração necessária'},
    {category:'EXPERIÊNCIA',icon:'pi-user',name:'Área do cliente',description:'Acesso privado para consultar reservas e solicitar alterações permitidas pelas regras do estabelecimento.'},
    {category:'RECORRÊNCIA',icon:'pi-refresh',name:'Clubes e pacotes',description:'Organize benefícios, sessões pré-pagas e recorrência, com liberação vinculada aos pagamentos quando configurado.',note:'Requer configuração'},
    {category:'RELACIONAMENTO',icon:'pi-heart',name:'Fidelização e retorno',description:'Acompanhe o histórico e prepare campanhas para quem autorizou receber comunicações.'},
    {category:'PRODUTOS',icon:'pi-box',name:'Estoque e consumo',description:'Cadastre produtos e insumos, acompanhe movimentações e planeje reposições da operação.'},
    {category:'FINANCEIRO',icon:'pi-chart-bar',name:'Resultados do negócio',description:'Controle contas a pagar e receber, movimentações e relatórios para acompanhar a operação.'},
    {category:'ESCALA',icon:'pi-building',name:'Gestão de unidades',description:'Organize unidades e controle de acesso em operações que precisam ampliar a gestão.',note:'Conforme módulo disponível'},
    {category:'SUA MARCA',icon:'pi-image',name:'Página de agendamento',description:'Personalize informações do seu espaço e compartilhe uma página de reservas com sua identidade.'},
    {category:'QUALIDADE',icon:'pi-star',name:'Avaliações e atendimento',description:'Colete feedback, acompanhe a satisfação e identifique oportunidades de melhoria da experiência.'}
  ];

  faqs = [
    { q: 'Como funcionam os 30 dias gratuitos?', a: 'Você cadastra seu negócio e pode configurar serviços, profissionais e o link de agendamento para avaliar a rotina real. Não pedimos cartão e não fazemos cobrança automática. A assinatura é opcional ao final do teste.', open: true },
    { q: 'O plano Essencial custa mesmo R$ 97 por mês?', a: 'Sim. O plano Essencial anunciado custa R$ 97/mês na contratação mensal e oferece agenda e link público de agendamento, até cinco profissionais ativos, cadastro de clientes e serviços, histórico, caixa e suporte por e-mail. Recursos adicionais podem ter condições próprias.', open: false },
    { q: 'Meus clientes conseguem agendar pelo WhatsApp?', a: 'Você pode compartilhar o link de reservas pelo WhatsApp, Instagram ou site para o cliente agendar online. Isso não significa que um robô de WhatsApp esteja incluso; mensagens automatizadas exigem integração própria e autorização do destinatário.', open: false },
    { q: 'O AgendaAI recebe pagamentos e sinal de reservas?', a: 'O sistema tem módulos de recebimentos e sinal. A utilização depende de ativar o provedor de pagamento compatível e atender às condições da integração. Tarifas de processamento podem ser cobradas pelo prestador.', open: false },
    { q: 'Posso oferecer clube, pacotes ou sessões antecipadas?', a: 'A plataforma contempla recursos de clubes recorrentes e sessões pré-pagas. Eles exigem a configuração adequada de serviços, regras e pagamentos; confirme a disponibilidade para o seu negócio e plano durante o teste.', open: false },
    { q: 'Meu cliente pode consultar ou cancelar reservas?', a: 'Há uma área privativa vinculada a reservas. As ações disponíveis respeitam as regras do estabelecimento e, quando houver pagamento antecipado, o cancelamento pode exigir tratamento financeiro adicional.', open: false },
    { q: 'Preciso migrar tudo ou instalar algum programa?', a: 'Não. Comece com um serviço e um profissional, compartilhe a agenda e amplie gradualmente. O AgendaAI funciona pelo navegador. Também é possível importar cadastros de clientes por planilha, conforme o fluxo disponibilizado no painel.', open: false },
    { q: 'Vocês garantem mais vendas ou redução de faltas?', a: 'Não prometemos percentuais de resultado. O AgendaAI oferece ferramentas para organizar atendimento e acompanhar desempenho. A recomendação é testar com seus próprios dados e avaliar o impacto na rotina.', open: false }
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
