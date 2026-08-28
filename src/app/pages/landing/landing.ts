import { Component, HostListener, OnInit, ElementRef, ChangeDetectorRef } from '@angular/core';
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
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing implements OnInit {
  isScrolled = false;
  isMobileMenuOpen = false;
  isAnnualBilling = true;

  // Active Segment in Chameleon section
  activeSegmentId = 'saude';
  segments: SegmentDetail[] = [
    {
      id: 'saude',
      name: 'Clínicas & Consultórios',
      category: 'Saúde & Medicina',
      headline: 'Prontuário integrado, retorno programado e confirmação de consultas.',
      description: 'A IA atende pacientes com discrição e cordialidade, tira dúvidas sobre preparo de exames e agenda consultas diretamente na grade dos médicos ou especialistas.',
      terms: [
        { label: 'Vocabulário', value: 'Consultas, Retornos, Procedimentos' },
        { label: 'Documentação', value: 'Prontuário digital e histórico de atendimentos' },
        { label: 'Regra de Encaixe', value: 'Priorização de retornos e pós-operatórios' }
      ],
      chatExample: {
        client: 'Dra. Camila, teria horário para consulta dermatológica esta semana?',
        clientMsg: 'Olá! Gostaria de marcar uma consulta com a Dra. Camila para quinta ou sexta-feira à tarde.',
        aiResponse: 'Olá Mariana! A Dra. Camila tem disponibilidade na quinta-feira às 15h30 ou na sexta às 14h00. Qual desses horários se encaixa melhor na sua rotina?',
        serviceTag: 'Consulta Dermatológica',
        timeTag: 'Quinta, 15:30'
      },
      features: [
        'Envio de orientações pré-consulta (jejum, exames)',
        'Bloqueio automático de intervalos entre cirurgias',
        'Controle de múltiplos profissionais e salas'
      ]
    },
    {
      id: 'barbearia',
      name: 'Barbearias & Salões',
      category: 'Beleza & Estilo',
      headline: 'Fila de espera inteligente, cálculo de comissões e comandas.',
      description: 'Linguagem rápida e direta. A IA compreende termos como degradê, barba terapia ou química, consulta a cadeira do barbeiro preferido do cliente e confirma em segundos.',
      terms: [
        { label: 'Vocabulário', value: 'Cortes, Barbas, Cadeiras, Horários' },
        { label: 'Operação', value: 'Fila de espera ativa com preenchimento de desistências' },
        { label: 'Financeiro', value: 'Rateio de comissão por profissional e comanda integrada' }
      ],
      chatExample: {
        client: 'Tem horário com o Rodrigo hoje?',
        clientMsg: 'E aí, tem vaga pra corte degradê e barba hoje por volta das 18h?',
        aiResponse: 'Fala Gabriel! Às 18h com o Rodrigo está livre. Deseja que eu confirme sua cadeira agora?',
        serviceTag: 'Corte Degradê + Barba Terapia',
        timeTag: 'Hoje, 18:00'
      },
      features: [
        'Preenchimento automático de horários cancelados',
        'Comanda digital com consumo de bar e produtos',
        'Lembrete 1h antes com confirmação rápida por botão'
      ]
    },
    {
      id: 'estetica',
      name: 'Estética & Bem-estar',
      category: 'Estética & Spa',
      headline: 'Controle de pacotes, fichas de anamnese e sessões recorrentes.',
      description: 'Gerencie pacotes de 5 ou 10 sessões (drenagem, depilação a laser, massagens) com abatimento automático e acompanhamento do progresso de cada cliente.',
      terms: [
        { label: 'Vocabulário', value: 'Sessões, Protocolos, Pacotes, Salas' },
        { label: 'Acompanhamento', value: 'Ficha de anamnese e contraindicações' },
        { label: 'Recorrência', value: 'Controle de saldo de sessões contratadas' }
      ],
      chatExample: {
        client: 'Quero agendar a sessão 3 do meu pacote',
        clientMsg: 'Boa tarde! Gostaria de marcar a minha terceira sessão de drenagem com a Clara.',
        aiResponse: 'Olá Juliana! Localizei seu pacote Drenagem Ouro (restam 3 sessões). A terapeuta Clara tem horário amanhã às 16h ou quinta às 10h. Qual prefere?',
        serviceTag: 'Sessão 3/5 • Drenagem Linfática',
        timeTag: 'Amanhã, 16:00'
      },
      features: [
        'Aviso de término de pacote para renovação',
        'Reserva automática de equipamentos específicos por sala',
        'Instruções pós-procedimento enviadas via WhatsApp'
      ]
    },
    {
      id: 'pet',
      name: 'Pet Shops & Veterinárias',
      category: 'Mercado Pet',
      headline: 'Ficha completa do animal, porte, táxi pet e preferências de tosa.',
      description: 'Cadastro vinculado ao tutor e aos animais (cão, gato, raça, porte). A IA pergunta o nome do pet e personaliza o atendimento conforme o histórico.',
      terms: [
        { label: 'Vocabulário', value: 'Banho, Tosa, Porte, Vacinas, Táxi Dog' },
        { label: 'Identificação', value: 'Perfil individual de cada pet do mesmo tutor' },
        { label: 'Logística', value: 'Horário de coleta e entrega (leva e traz)' }
      ],
      chatExample: {
        client: 'Banho e tosa pro Thor no sábado',
        clientMsg: 'Oi! Preciso marcar banho e tosa na tesoura pro Thor (Golden) neste sábado.',
        aiResponse: 'Olá Paula! O Thor vai ser muito bem recebido. Temos vaga no sábado às 09h30 com a groomer Rafaela. Deseja incluir o serviço de busca e entrega (táxi dog)?',
        serviceTag: 'Banho & Tosa na Tesoura • Porte Grande',
        timeTag: 'Sábado, 09:30'
      },
      features: [
        'Registro de comportamento (ex: animal idoso, medroso)',
        'Controle de vacinas e alertas de reforço ao tutor',
        'Aviso de "Pet pronto para retirada" automático'
      ]
    }
  ];

  get activeSegment(): SegmentDetail {
    return this.segments.find(s => s.id === this.activeSegmentId) || this.segments[0];
  }

  // FAQ Accordion State
  faqs = [
    {
      q: 'Como funciona a integração com o WhatsApp?',
      a: 'O AgendaAi conecta-se ao número oficial do seu estabelecimento via QR Code ou API oficial. Quando um cliente envia uma mensagem de texto ou áudio, o sistema compreende o pedido em linguagem natural, verifica sua disponibilidade em tempo real e realiza o agendamento de forma autônoma.',
      open: true
    },
    {
      q: 'O que acontece quando o cliente manda um áudio?',
      a: 'O sistema transcreve o áudio instantaneamente, identifica a intenção (ex: marcar corte, remarcar consulta, saber preços) e responde em texto com precisão profissional, sem exigir que o cliente escute outro áudio.',
      open: false
    },
    {
      q: 'Minha equipe humana continuará tendo controle total?',
      a: 'Sim, totalmente. O painel web permite que você e sua equipe visualizem a agenda completa, criem agendamentos manuais (para clientes presenciais ou por telefone), alterem horários e assumam conversas no WhatsApp com um único clique.',
      open: false
    },
    {
      q: 'Como o sistema reduz as faltas (no-shows)?',
      a: 'O AgendaAi dispara lembretes automáticos com botões de confirmação simples no WhatsApp (ex: 24h e 2h antes). Se o cliente informar que não poderá comparecer, o horário é liberado imediatamente e a fila de espera é acionada para preencher a vaga.',
      open: false
    },
    {
      q: 'Existe contrato de fidelidade ou taxa de adesão?',
      a: 'Não. Você pode testar a plataforma gratuitamente por 7 dias sem qualquer compromisso. Após o período de testes, você escolhe o plano que melhor se adapta ao seu volume e pode cancelar a qualquer momento sem taxas rescisórias.',
      open: false
    }
  ];

  constructor(
    private router: Router,
    private el: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {}

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

  goToLogin() {
    this.router.navigate(['/login']);
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
