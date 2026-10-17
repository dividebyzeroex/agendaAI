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
  // Demonstration only. No remote payment is ever created by this preview.
  checkoutScene: 'cart' | 'payment' | 'success' = 'cart';
  readonly checkoutScenes = [
    {id:'cart' as const,number:'01',label:'Comanda ao vivo'},
    {id:'payment' as const,number:'02',label:'Pagar com QR'},
    {id:'success' as const,number:'03',label:'Pagamento confirmado'}
  ];
  setCheckoutScene(scene: 'cart' | 'payment' | 'success'): void {
    this.checkoutScene = scene;
  }

  activeCapabilityPillar: 'all' | 'attendance' | 'payments' | 'growth' | 'management' = 'all';
  readonly capabilityPillars = [
    {id:'all' as const,name:'Todos'},
    {id:'attendance' as const,name:'Atendimento'},
    {id:'payments' as const,name:'Recebimentos'},
    {id:'growth' as const,name:'Relacionamento'},
    {id:'management' as const,name:'Gestão'}
  ];
  selectCapabilityPillar(id: 'all' | 'attendance' | 'payments' | 'growth' | 'management'):void {
    this.activeCapabilityPillar=id;
  }
  get visibleCapabilities(){
    return this.activeCapabilityPillar==='all'
      ? this.capabilities
      : this.capabilities.filter(c=>c.pillar===this.activeCapabilityPillar);
  }

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
      headline: 'Do primeiro horário ao último pagamento, tudo conectado.',
      description: 'Organize os horários, receba pela plataforma quando a Stripe Connect estiver habilitada e entregue uma jornada de atendimento mais fluida da recepção ao caixa.',
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
    {pillar:'attendance',category:'AGENDA',icon:'pi-calendar',name:'Agenda online compartilhável',description:'O cliente escolhe horário, profissional e serviço em uma página com a identidade do seu espaço.'},
    {pillar:'attendance',category:'RECEPÇÃO',icon:'pi-users',name:'Fila, encaixes e check-in',description:'Organize chegadas, atendimentos sem reserva, confirmação e ocupação dos profissionais.'},
    {pillar:'attendance',category:'EQUIPE',icon:'pi-sitemap',name:'Serviços com vários profissionais',description:'Agende corte e manicure ao mesmo tempo, com responsáveis diferentes, ou organize serviços em sequência para o mesmo cliente.',note:'Disponível no painel'},
    {pillar:'attendance',category:'COMANDA',icon:'pi-receipt',name:'Serviços e produtos no atendimento',description:'Monte a comanda enquanto o cliente é atendido. Acompanhe itens, preços e responsáveis.'},
    {pillar:'payments',category:'PAY EXPRESS',icon:'pi-desktop',name:'Checkout em duas telas',description:'O caixa opera de um lado e o cliente acompanha os valores no visor pareado, sem ver dados administrativos.',note:'Requer segunda tela'},
    {pillar:'payments',category:'STRIPE CONNECT',icon:'pi-credit-card',name:'Pagamento digital integrado',description:'Com a conta Stripe Connect habilitada, emita cobranças online por link ou QR Code e acompanhe a confirmação.',note:'Ativação e tarifas aplicáveis'},
    {pillar:'payments',category:'RESERVAS',icon:'pi-wallet',name:'Sinal e comanda digital',description:'Associe pagamentos antecipados às reservas e ofereça acesso à comanda digital ou recibo conforme a operação.',note:'Conforme configuração'},
    {pillar:'payments',category:'REPASSES',icon:'pi-percentage',name:'Comissões individualizadas',description:'Cada serviço da comanda mantém seu profissional responsável e aplica a comissão padrão ou a regra específica do serviço.',note:'Por profissional e serviço'},
    {pillar:'growth',category:'RELACIONAMENTO',icon:'pi-heart',name:'Fidelidade e retorno',description:'Histórico, benefícios e campanhas de relacionamento para clientes que autorizaram comunicações.'},
    {pillar:'growth',category:'RECORRÊNCIA',icon:'pi-refresh',name:'Clubes e pacotes',description:'Sessões pré-pagas, planos recorrentes e controle de utilização, quando habilitados.',note:'Configuração adicional'},
    {pillar:'growth',category:'EXPERIÊNCIA',icon:'pi-user',name:'Área privativa do cliente',description:'Acesso às próprias reservas e ações permitidas pelas regras do estabelecimento.'},
    {pillar:'growth',category:'QUALIDADE',icon:'pi-star',name:'Feedback e avaliações',description:'Registre a experiência de quem foi atendido e encontre oportunidades para melhorar.'},
    {pillar:'management',category:'ESTOQUE',icon:'pi-box',name:'Produtos, insumos e reposição',description:'Acompanhe movimentações, consumo interno e pontos de atenção para a reposição.'},
    {pillar:'management',category:'FINANCEIRO',icon:'pi-chart-bar',name:'Caixa e visão financeira',description:'Movimentações, contas a pagar e receber, relatórios e acompanhamento de resultados.'},
    {pillar:'management',category:'OPERAÇÃO',icon:'pi-building',name:'Unidades e permissões',description:'Estruture o acesso da equipe e acompanhe diferentes unidades conforme o módulo contratado.',note:'Conforme plano'},
    {pillar:'management',category:'SUA MARCA',icon:'pi-image',name:'Página com identidade própria',description:'Seu estabelecimento em primeiro plano, com serviços e informações para agendar.'}
  ];

  faqs = [
    { q: 'Como funcionam os 30 dias gratuitos?', a: 'Você cadastra seu negócio e pode configurar serviços, profissionais e o link de agendamento para avaliar a rotina real. Não pedimos cartão e não fazemos cobrança automática. A assinatura é opcional ao final do teste.', open: true },
    { q: 'O plano Essencial custa mesmo R$ 97 por mês?', a: 'Sim. O plano Essencial anunciado custa R$ 97/mês na contratação mensal e oferece agenda e link público de agendamento, até cinco profissionais ativos, cadastro de clientes e serviços, histórico, caixa e suporte por e-mail. Recursos adicionais podem ter condições próprias.', open: false },
    { q: 'Meus clientes conseguem agendar pelo WhatsApp?', a: 'Você pode compartilhar o link de reservas pelo WhatsApp, Instagram ou site para o cliente agendar online. Isso não significa que um robô de WhatsApp esteja incluso; mensagens automatizadas exigem integração própria e autorização do destinatário.', open: false },
    { q: 'Como funciona o Stripe Connect no AgendaAI?', a: 'O estabelecimento pode vincular sua própria conta Stripe Connect ao AgendaAI, sujeito à habilitação e análise do provedor. A plataforma gera cobranças integradas e acompanha o status por confirmação do servidor. Taxas do AgendaAI e da Stripe podem se aplicar; o vínculo não significa uma parceria ou endosso comercial da Stripe.', open: false },
    { q: 'O cliente precisa preencher dados de cartão no balcão?', a: 'Não no caixa do salão. Com o Pay Express ativo, a segunda tela pode apresentar a comanda e o QR da cobrança. O cliente usa o próprio celular e o checkout seguro hospedado pelo provedor. O AgendaAI exibe sucesso somente após confirmar o pagamento pelo sistema.', open: false },
    { q: 'A segunda tela precisa ler uma comanda a cada atendimento?', a: 'Não. Depois de parear o visor do cliente, a seleção do atendimento no caixa sincroniza itens e valores automaticamente. A leitura manual é opcional para comandas físicas ou recuperação de cobrança existente.', open: false },
    { q: 'Posso ter dois profissionais atendendo a mesma pessoa?', a: 'Sim. No painel do AgendaAI, você pode criar um agendamento com serviços paralelos para profissionais diferentes ou programar serviços em sequência. Se o cliente pedir barba, sobrancelha ou outro serviço durante a visita, adicione-o ao atendimento antes de emitir a cobrança. Os serviços são reunidos em uma única comanda, com a comissão de cada profissional calculada separadamente.', open: false },
    { q: 'Quais tipos de recebimento ficam registrados?', a: 'O AgendaAI diferencia cobranças Stripe pendentes de pagamentos presenciais já recebidos. Para registrar dinheiro, Pix ou maquininha externa, o atendente confirma o recebimento; cobranças Stripe só são consideradas pagas após a validação pelo provedor.', open: false },
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
