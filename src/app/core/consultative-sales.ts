import { PRICING_CATALOG } from './pricing-catalog.js';

/**
 * Public sales discovery is deterministic by design: no personal data is sent
 * to an LLM, no model can invent prices, and unreleased modules are never sold.
 * This module may later supply verified facts to a budgeted AI copy layer.
 */
export type SalesNeedId = 'agenda' | 'equipe' | 'pagamentos' | 'crescimento';
export type SalesPlanId = 'agenda' | 'gestao';

export interface SalesNeed {
  id: SalesNeedId;
  title: string;
  detail: string;
  label: string;
}
export interface SalesRecommendation {
  planId: SalesPlanId;
  planName: string;
  needs: SalesNeed[];
  headline: string;
  answer: string;
  growthPreview: boolean;
  nextQuestion: string;
}
const NEEDS: Record<SalesNeedId, SalesNeed> = {
  agenda: {
    id: 'agenda',
    title: 'Agenda online e horários organizados',
    detail: 'Link público de agendamento, serviços, profissionais e histórico de reservas.',
    label: 'Agenda'
  },
  equipe: {
    id: 'equipe',
    title: 'Comissões e controle da equipe',
    detail: 'Comanda, fechamento e comissões por profissional no plano Gestão.',
    label: 'Equipe e comissões'
  },
  pagamentos: {
    id: 'pagamentos',
    title: 'Caixa, comandas e Pay Express',
    detail: 'Comandas, múltiplos serviços e pagamentos quando o provedor estiver habilitado.',
    label: 'Caixa e recebimentos'
  },
  crescimento: {
    id: 'crescimento',
    title: 'Relacionamento e crescimento',
    detail: 'Campanhas com IA estão em prévia, sujeitas a convite, sem contratação comercial.',
    label: 'Crescimento'
  }
};
export const SALES_STARTERS = [
  'Tenho muitos horários vagos',
  'Preciso controlar as comissões da equipe',
  'Quero organizar caixa e pagamentos',
  'Quero atrair clientes e reduzir faltas'
] as const;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const MATCHERS: Record<SalesNeedId, RegExp> = {
  agenda: /\b(agenda|agendar|agendamento|agendamentos|horario|horarios|reserva|reservas|cancelamento|cancelamentos|falta|faltas|ausencia|ausencias|encaixe|encaixes|ocupacao|vagas|vagos|vaga|cliente faltou|confirmacao)\b/,
  equipe: /\b(comissao|comissoes|repasse|repasses|produtividade|salario|salarios|controle de equipe|fechamento da equipe|quanto cada profissional recebe|pagamento dos profissionais)\b/,
  pagamentos: /\b(caixa|pagamento|pagamentos|pix|cobrar|cobranca|cobrancas|comanda|comandas|maquininha|cartao|receber|recebimentos|faturamento|financeiro|fluxo de caixa|fechamento)\b/,
  crescimento: /\b(marketing|instagram|whatsapp|fidelizar|fidelizacao|campanha|campanhas|divulgar|divulgacao|crescer|crescimento|atrair|captar|retencao|voltar|retorno|clientes novos|novos clientes|promocao|promocoes|social)\b/
};
export function discoverSalesNeeds(messages: readonly string[]): SalesRecommendation | null {
  const corpus = messages.slice(-8).map(value => normalize(String(value).slice(0, 600))).join(' ');
  if (!corpus.trim()) return null;
  const ids = (Object.keys(MATCHERS) as SalesNeedId[]).filter(id => MATCHERS[id].test(corpus));
  if (!ids.length) return null;
  const planId: SalesPlanId = ids.some(id => id === 'equipe' || id === 'pagamentos') ? 'gestao' : 'agenda';
  const growthPreview = ids.includes('crescimento');
  const needs = ids.map(id => NEEDS[id]);
  const plan = PRICING_CATALOG[planId];
  const headline = ids.length === 1 ? needs[0].title : 'Uma operação mais organizada, do agendamento ao resultado.';
  const intro = ids.includes('equipe')
    ? 'Você precisa acompanhar quem executa os serviços e quanto cada profissional recebe.'
    : ids.includes('pagamentos')
    ? 'Seu foco é deixar o atendimento e o fechamento mais claros.'
    : ids.includes('agenda')
    ? 'Vamos começar pela organização dos seus horários e das reservas.'
    : 'Você quer conquistar e manter mais clientes, sem perder o controle da operação.';
  const growthNote = growthPreview
    ? ' O Growth IA é uma prévia por convite e não faz parte da contratação atual.'
    : '';
  return {
    planId,
    planName: plan.name,
    needs,
    headline,
    answer: intro + ' Separei os recursos relacionados ao que você descreveu. O plano ' + plan.name + ' é a referência contratável mais próxima para começar.' + growthNote,
    growthPreview,
    nextQuestion: ids.includes('agenda') && !ids.includes('equipe')
      ? 'Você também precisa controlar comissões, caixa ou pagamentos?'
      : 'Você quer conhecer a demonstração ou ajustar sua necessidade antes de criar a conta?'
  };
}
