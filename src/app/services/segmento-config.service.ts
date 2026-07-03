import { Injectable, inject } from '@angular/core';
import { EstabelecimentoService } from './estabelecimento.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface ServicoSugerido {
  emoji: string;
  titulo: string;
  descricao: string;
  preco: number;
  duracao_min: number;
}

export interface RoleOption {
  label: string;
  value: string;
}

export interface SegmentoConfig {
  /** Identificador do segmento */
  id: string;
  /** Nome amigável (ex: "Barbearia") */
  label: string;
  /** Emoji representativo do segmento (ex: 💈) */
  heroEmoji: string;
  /** Emoji padrão para serviços sem emoji definido */
  emojiPadrao: string;
  /** Cor padrão sugerida */
  corPadrao: string;

  // ─── Labels ──────────────────────────────────────────────────
  /** Singular: "Barbeiro", "Tosador", "Confeiteiro" */
  labelProfissional: string;
  /** Plural: "Profissionais", "Equipe" */
  labelProfissionalPlural: string;
  /** "Cliente", "Tutor", "Paciente" */
  labelCliente: string;
  /** "Serviço", "Procedimento", "Produto" */
  labelServico: string;

  // ─── Placeholders ────────────────────────────────────────────
  /** Placeholder do nome do negócio */
  placeholderNome: string;
  /** Placeholder do nome de um serviço */
  placeholderServico: string;
  /** Placeholder da especialidade do profissional */
  placeholderEspecialidade: string;
  /** Placeholder do cargo */
  placeholderCargo: string;

  // ─── Roles ───────────────────────────────────────────────────
  /** Role padrão para novo profissional */
  rolePadrao: string;
  /** Opções de role disponíveis */
  roles: RoleOption[];

  // ─── Serviços Sugeridos ──────────────────────────────────────
  servicosSugeridos: ServicoSugerido[];

  // ─── Tour (Primeiro Acesso) ──────────────────────────────────
  tourSteps: { t: string; d: string }[];
}

// ─── Dicionário Completo ────────────────────────────────────────────────────

const SEGMENTOS: Record<string, SegmentoConfig> = {

  barbearia: {
    id: 'barbearia', label: 'Barbearia', heroEmoji: '💈', emojiPadrao: '✂️', corPadrao: '#6366f1',
    labelProfissional: 'Barbeiro', labelProfissionalPlural: 'Barbeiros', labelCliente: 'Cliente', labelServico: 'Serviço',
    placeholderNome: 'Ex: Barbearia Silva', placeholderServico: 'Ex: Corte Social', placeholderEspecialidade: 'Ex: Degradê, Barba', placeholderCargo: 'Ex: Barbeiro Sênior',
    rolePadrao: 'barbeiro',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Barbeiro', value: 'barbeiro' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '✂️', titulo: 'Corte Social', descricao: 'Corte masculino tradicional', preco: 40, duracao_min: 30 },
      { emoji: '🪒', titulo: 'Barba', descricao: 'Barba completa com toalha quente', preco: 30, duracao_min: 20 },
      { emoji: '💈', titulo: 'Corte + Barba', descricao: 'Combo completo', preco: 60, duracao_min: 45 },
      { emoji: '🧴', titulo: 'Hidratação', descricao: 'Hidratação capilar profunda', preco: 35, duracao_min: 25 },
    ],
    tourSteps: [
      { t: 'Sua Agenda Profissional', d: 'Bem-vindo. Aqui sua produtividade encontra a organização.' },
      { t: 'Foco no Cliente', d: 'Acesse seus agendamentos, preferências e histórico de serviços.' },
      { t: 'Meus Ganhos', d: 'Veja suas comissões e metas acumuladas de forma clara e justa.' },
      { t: 'Pronto para Atender', d: 'Sua estação está pronta. Comece agora!' },
    ],
  },

  salao: {
    id: 'salao', label: 'Salão de Beleza', heroEmoji: '💅', emojiPadrao: '💇', corPadrao: '#ec4899',
    labelProfissional: 'Profissional', labelProfissionalPlural: 'Profissionais', labelCliente: 'Cliente', labelServico: 'Serviço',
    placeholderNome: 'Ex: Studio Belle Hair', placeholderServico: 'Ex: Escova Progressiva', placeholderEspecialidade: 'Ex: Coloração, Mechas', placeholderCargo: 'Ex: Cabeleireira Sênior',
    rolePadrao: 'profissional',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Cabeleireiro(a)', value: 'profissional' },
      { label: 'Manicure', value: 'manicure' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '💇', titulo: 'Corte Feminino', descricao: 'Corte e finalização', preco: 80, duracao_min: 45 },
      { emoji: '🎨', titulo: 'Coloração', descricao: 'Tintura completa', preco: 150, duracao_min: 90 },
      { emoji: '💅', titulo: 'Manicure', descricao: 'Unhas das mãos', preco: 35, duracao_min: 40 },
      { emoji: '✨', titulo: 'Escova', descricao: 'Escova modelada', preco: 50, duracao_min: 30 },
    ],
    tourSteps: [
      { t: 'Seu Studio Digital', d: 'Bem-vinda ao centro de controle do seu salão.' },
      { t: 'Gestão de Clientes', d: 'Acesse históricos, preferências e fidelização.' },
      { t: 'Meus Ganhos', d: 'Acompanhe comissões e produtividade em tempo real.' },
      { t: 'Pronto para Atender', d: 'Sua estação está pronta. Comece agora!' },
    ],
  },

  petshop: {
    id: 'petshop', label: 'Pet Shop', heroEmoji: '🐾', emojiPadrao: '🐶', corPadrao: '#f59e0b',
    labelProfissional: 'Tosador', labelProfissionalPlural: 'Equipe', labelCliente: 'Tutor', labelServico: 'Serviço',
    placeholderNome: 'Ex: PetLove Centro', placeholderServico: 'Ex: Banho Completo', placeholderEspecialidade: 'Ex: Tosa, Veterinária', placeholderCargo: 'Ex: Tosador Sênior',
    rolePadrao: 'tosador',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Tosador(a)', value: 'tosador' },
      { label: 'Veterinário(a)', value: 'veterinario' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '🛁', titulo: 'Banho', descricao: 'Banho completo com secagem', preco: 50, duracao_min: 40 },
      { emoji: '✂️', titulo: 'Tosa Higiênica', descricao: 'Tosa básica de higiene', preco: 35, duracao_min: 30 },
      { emoji: '🐩', titulo: 'Banho + Tosa', descricao: 'Combo completo', preco: 80, duracao_min: 60 },
      { emoji: '🩺', titulo: 'Consulta Veterinária', descricao: 'Avaliação clínica geral', preco: 120, duracao_min: 30 },
    ],
    tourSteps: [
      { t: 'Seu Pet Shop Digital', d: 'Bem-vindo ao centro de controle do seu negócio pet.' },
      { t: 'Gestão de Tutores', d: 'Acesse históricos de pets, preferências e agendamentos.' },
      { t: 'Meus Ganhos', d: 'Acompanhe faturamento e comissões por profissional.' },
      { t: 'Pronto para Atender', d: 'Sua estação está pronta. Vamos cuidar deles!' },
    ],
  },

  clinica_odonto: {
    id: 'clinica_odonto', label: 'Clínica Odontológica', heroEmoji: '🦷', emojiPadrao: '🦷', corPadrao: '#06b6d4',
    labelProfissional: 'Dentista', labelProfissionalPlural: 'Dentistas', labelCliente: 'Paciente', labelServico: 'Procedimento',
    placeholderNome: 'Ex: OdontoSmile Clínica', placeholderServico: 'Ex: Limpeza Dental', placeholderEspecialidade: 'Ex: Ortodontia, Implantes', placeholderCargo: 'Ex: Cirurgião-Dentista',
    rolePadrao: 'dentista',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Dentista', value: 'dentista' },
      { label: 'Auxiliar', value: 'auxiliar' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '🪥', titulo: 'Limpeza', descricao: 'Profilaxia dental completa', preco: 150, duracao_min: 40 },
      { emoji: '🦷', titulo: 'Restauração', descricao: 'Restauração em resina', preco: 200, duracao_min: 45 },
      { emoji: '📐', titulo: 'Ortodontia', descricao: 'Manutenção de aparelho', preco: 250, duracao_min: 30 },
      { emoji: '💉', titulo: 'Extração', descricao: 'Extração simples', preco: 180, duracao_min: 30 },
    ],
    tourSteps: [
      { t: 'Sua Clínica Digital', d: 'Bem-vindo ao centro de gestão da sua clínica odontológica.' },
      { t: 'Gestão de Pacientes', d: 'Acesse prontuários, histórico e próximos procedimentos.' },
      { t: 'Financeiro', d: 'Controle de faturamento, convênios e comissões.' },
      { t: 'Pronto para Atender', d: 'Sua agenda está configurada. Comece agora!' },
    ],
  },

  clinica_medica: {
    id: 'clinica_medica', label: 'Clínica Médica', heroEmoji: '🏥', emojiPadrao: '🩺', corPadrao: '#0ea5e9',
    labelProfissional: 'Médico(a)', labelProfissionalPlural: 'Corpo Clínico', labelCliente: 'Paciente', labelServico: 'Consulta',
    placeholderNome: 'Ex: Clínica Vida & Saúde', placeholderServico: 'Ex: Consulta Clínica Geral', placeholderEspecialidade: 'Ex: Dermatologia, Cardiologia', placeholderCargo: 'Ex: Médico Clínico Geral',
    rolePadrao: 'medico',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Médico(a)', value: 'medico' },
      { label: 'Enfermeiro(a)', value: 'enfermeiro' },
      { label: 'Recepcionista', value: 'recepcionista' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '🩺', titulo: 'Consulta Geral', descricao: 'Avaliação clínica geral', preco: 200, duracao_min: 30 },
      { emoji: '🔬', titulo: 'Exame de Rotina', descricao: 'Check-up básico', preco: 180, duracao_min: 20 },
      { emoji: '💉', titulo: 'Vacinação', descricao: 'Aplicação de vacina', preco: 80, duracao_min: 15 },
      { emoji: '📋', titulo: 'Retorno', descricao: 'Consulta de retorno', preco: 100, duracao_min: 20 },
    ],
    tourSteps: [
      { t: 'Sua Clínica Digital', d: 'Bem-vindo ao centro de gestão da sua clínica.' },
      { t: 'Gestão de Pacientes', d: 'Prontuários, histórico e agendamentos integrados.' },
      { t: 'Financeiro', d: 'Faturamento, convênios e controle de receitas.' },
      { t: 'Pronto para Atender', d: 'Sua agenda está configurada. Comece agora!' },
    ],
  },

  estetica: {
    id: 'estetica', label: 'Estética / Spa', heroEmoji: '💆', emojiPadrao: '🧖', corPadrao: '#a855f7',
    labelProfissional: 'Esteticista', labelProfissionalPlural: 'Especialistas', labelCliente: 'Cliente', labelServico: 'Procedimento',
    placeholderNome: 'Ex: Spa Vitale', placeholderServico: 'Ex: Limpeza de Pele', placeholderEspecialidade: 'Ex: Facial, Corporal', placeholderCargo: 'Ex: Esteticista Sênior',
    rolePadrao: 'esteticista',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Esteticista', value: 'esteticista' },
      { label: 'Massoterapeuta', value: 'massoterapeuta' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '🧖', titulo: 'Limpeza de Pele', descricao: 'Limpeza facial profunda', preco: 120, duracao_min: 60 },
      { emoji: '💆', titulo: 'Massagem Relaxante', descricao: 'Massagem corpo inteiro', preco: 150, duracao_min: 60 },
      { emoji: '✨', titulo: 'Peeling', descricao: 'Peeling químico ou mecânico', preco: 180, duracao_min: 45 },
      { emoji: '💅', titulo: 'Design de Sobrancelha', descricao: 'Design com pinça e henna', preco: 50, duracao_min: 30 },
    ],
    tourSteps: [
      { t: 'Seu Spa Digital', d: 'Bem-vinda ao centro de gestão do seu espaço de beleza.' },
      { t: 'Gestão de Clientes', d: 'Históricos de tratamento, preferências e fidelização.' },
      { t: 'Meus Ganhos', d: 'Comissões e produtividade por especialista.' },
      { t: 'Pronto para Atender', d: 'Seu espaço está configurado. Comece agora!' },
    ],
  },

  assistencia: {
    id: 'assistencia', label: 'Assistência Técnica', heroEmoji: '🔧', emojiPadrao: '🛠️', corPadrao: '#64748b',
    labelProfissional: 'Técnico', labelProfissionalPlural: 'Técnicos', labelCliente: 'Cliente', labelServico: 'Serviço',
    placeholderNome: 'Ex: TechFix Assistência', placeholderServico: 'Ex: Troca de Tela', placeholderEspecialidade: 'Ex: Celulares, Notebooks', placeholderCargo: 'Ex: Técnico Sênior',
    rolePadrao: 'tecnico',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Técnico', value: 'tecnico' },
      { label: 'Atendente', value: 'atendente' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '📱', titulo: 'Troca de Tela', descricao: 'Substituição de display', preco: 200, duracao_min: 60 },
      { emoji: '🔋', titulo: 'Troca de Bateria', descricao: 'Substituição de bateria', preco: 100, duracao_min: 30 },
      { emoji: '💻', titulo: 'Formatação', descricao: 'Formatação e instalação de SO', preco: 120, duracao_min: 90 },
      { emoji: '🛠️', titulo: 'Diagnóstico', descricao: 'Avaliação técnica do aparelho', preco: 50, duracao_min: 30 },
    ],
    tourSteps: [
      { t: 'Sua Assistência Digital', d: 'Bem-vindo ao centro de gestão da sua assistência técnica.' },
      { t: 'Gestão de Clientes', d: 'Acompanhe aparelhos, status de reparo e histórico.' },
      { t: 'Financeiro', d: 'Controle de orçamentos, peças e receita.' },
      { t: 'Pronto para Atender', d: 'Sua bancada está pronta. Comece agora!' },
    ],
  },

  doceria: {
    id: 'doceria', label: 'Doceria / Confeitaria', heroEmoji: '🧁', emojiPadrao: '🎂', corPadrao: '#f472b6',
    labelProfissional: 'Confeiteiro(a)', labelProfissionalPlural: 'Equipe', labelCliente: 'Cliente', labelServico: 'Encomenda',
    placeholderNome: 'Ex: Doce Sabor Confeitaria', placeholderServico: 'Ex: Bolo Personalizado', placeholderEspecialidade: 'Ex: Bolos, Doces Finos', placeholderCargo: 'Ex: Confeiteira Chefe',
    rolePadrao: 'confeiteiro',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Confeiteiro(a)', value: 'confeiteiro' },
      { label: 'Atendente', value: 'atendente' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '🎂', titulo: 'Bolo Personalizado', descricao: 'Bolo decorado sob encomenda', preco: 120, duracao_min: 60 },
      { emoji: '🧁', titulo: 'Cupcakes (12un)', descricao: 'Caixa com 12 cupcakes', preco: 60, duracao_min: 30 },
      { emoji: '🍫', titulo: 'Brigadeiros (50un)', descricao: 'Caixa gourmet com 50 unidades', preco: 80, duracao_min: 20 },
      { emoji: '🍰', titulo: 'Torta Especial', descricao: 'Torta para eventos', preco: 90, duracao_min: 45 },
    ],
    tourSteps: [
      { t: 'Sua Doceria Digital', d: 'Bem-vinda ao centro de gestão da sua confeitaria.' },
      { t: 'Gestão de Encomendas', d: 'Acompanhe pedidos, prazos e preferências dos clientes.' },
      { t: 'Financeiro', d: 'Controle de receita, custos e produtividade.' },
      { t: 'Pronto para Criar', d: 'Seu ateliê está configurado. Comece agora!' },
    ],
  },

  outro: {
    id: 'outro', label: 'Outro', heroEmoji: '🏢', emojiPadrao: '📋', corPadrao: '#6366f1',
    labelProfissional: 'Profissional', labelProfissionalPlural: 'Equipe', labelCliente: 'Cliente', labelServico: 'Serviço',
    placeholderNome: 'Ex: Meu Negócio', placeholderServico: 'Ex: Atendimento Padrão', placeholderEspecialidade: 'Ex: Geral', placeholderCargo: 'Ex: Atendente',
    rolePadrao: 'profissional',
    roles: [
      { label: 'Dono / Admin', value: 'dono' },
      { label: 'Profissional', value: 'profissional' },
      { label: 'Financeiro', value: 'financeiro' },
    ],
    servicosSugeridos: [
      { emoji: '📋', titulo: 'Atendimento Padrão', descricao: 'Atendimento geral', preco: 50, duracao_min: 30 },
      { emoji: '⭐', titulo: 'Serviço Premium', descricao: 'Atendimento premium', preco: 100, duracao_min: 60 },
    ],
    tourSteps: [
      { t: 'Seu Negócio Digital', d: 'Bem-vindo ao centro de gestão do seu negócio.' },
      { t: 'Gestão de Clientes', d: 'Acesse históricos, preferências e agendamentos.' },
      { t: 'Financeiro', d: 'Controle de faturamento e produtividade.' },
      { t: 'Pronto para Atender', d: 'Tudo configurado. Comece agora!' },
    ],
  },
};

// Fallback é sempre "outro" (genérico)
const FALLBACK = SEGMENTOS['outro'];

// ─── Lista completa para selects e onboarding ───────────────────────────────

export const SEGMENTO_OPTIONS = [
  { label: 'Barbearia',             value: 'barbearia',      icon: '💈' },
  { label: 'Salão de Beleza',       value: 'salao',          icon: '💅' },
  { label: 'Pet Shop / Veterinário',value: 'petshop',        icon: '🐾' },
  { label: 'Clínica Odontológica',  value: 'clinica_odonto', icon: '🦷' },
  { label: 'Clínica Médica',        value: 'clinica_medica', icon: '🏥' },
  { label: 'Estética / Spa',        value: 'estetica',       icon: '💆' },
  { label: 'Assistência Técnica',   value: 'assistencia',    icon: '🔧' },
  { label: 'Doceria / Confeitaria', value: 'doceria',        icon: '🧁' },
  { label: 'Outro',                 value: 'outro',          icon: '🏢' },
];

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SegmentoConfigService {
  private estabService = inject(EstabelecimentoService);

  /** Observable que emite a configuração atualizada quando o estabelecimento muda */
  config$: Observable<SegmentoConfig> = this.estabService.estabelecimento$.pipe(
    map(estab => this.getConfig(estab?.segmento))
  );

  /** Retorna a configuração para um segmento específico (ou o atual do estabelecimento) */
  getConfig(segmento?: string | null): SegmentoConfig {
    if (!segmento) {
      const current = this.estabService.estabelecimento$.value?.segmento;
      return SEGMENTOS[current || ''] || FALLBACK;
    }
    return SEGMENTOS[segmento] || FALLBACK;
  }

  /** Retorna a configuração atual (snapshot síncrono) */
  get current(): SegmentoConfig {
    const seg = this.estabService.estabelecimento$.value?.segmento;
    return SEGMENTOS[seg || ''] || FALLBACK;
  }

  /** Retorna todas as opções de segmento para selects */
  get options() {
    return SEGMENTO_OPTIONS;
  }

  /** Retorna a config para um segmento específico (estático, sem dependência do estabelecimento) */
  static forSegmento(segmento: string): SegmentoConfig {
    return SEGMENTOS[segmento] || FALLBACK;
  }
}
