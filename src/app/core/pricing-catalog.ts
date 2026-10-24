/** Pricing catalog: source of truth for public offers and Stripe server quotes.
 * Legacy plans remain recognizable for already-contracted subscriptions.
 * New prices are PILOT proposals; Growth is not purchasable until validated.
 */
export type PricingStatus = 'active' | 'preview' | 'legacy';
export const PRICING_CATALOG = {
  agenda: { id: 'agenda', name: 'AgendaAI Agenda', monthlyCents: 7900, status: 'active', features: ['Agenda e link público de agendamento', 'Clientes, serviços e profissionais sem taxa por agenda', 'Organização dos horários e histórico de reservas', 'Suporte por e-mail'] },
  gestao: { id: 'gestao', name: 'AgendaAI Gestão', monthlyCents: 11900, status: 'active', features: ['Tudo do Agenda', 'Comanda, caixa e comissões por profissional', 'Atendimentos com múltiplos serviços', 'Pay Express com provedor habilitado', 'Relatórios operacionais e implantação assistida'] },
  growth: { id: 'growth', name: 'AgendaAI Growth IA', monthlyCents: 16900, status: 'preview', features: ['Tudo do Gestão', 'Automações e campanhas avançadas em validação', 'Recursos de retenção sujeitos a disponibilidade'] },
  basico: { id: 'basico', name: 'Essencial (legado)', monthlyCents: 9700, status: 'legacy', features: [] },
  completo: { id: 'completo', name: 'Completo (legado)', monthlyCents: 19700, status: 'legacy', features: [] },
  premium: { id: 'premium', name: 'Premium (legado)', monthlyCents: 34900, status: 'legacy', features: [] },
} as const;
export type PricingPlanId = keyof typeof PRICING_CATALOG;
export const PRICING_DISCOUNTS = { 1: 0, 3: 5, 6: 10, 12: 20 } as const;
export function isSellablePlan(id: unknown): id is 'agenda' | 'gestao' {
  return (id === 'agenda' || id === 'gestao');
}
export function pricingQuote(id: unknown, months: unknown) {
  if (typeof id !== 'string' || !Object.hasOwn(PRICING_CATALOG, id) ||
      typeof months !== 'number' || !Number.isInteger(months) ||
      !Object.hasOwn(PRICING_DISCOUNTS, months)) throw new Error('Plano ou ciclo inválido.');
  const plan = PRICING_CATALOG[id as PricingPlanId];
  const discount = PRICING_DISCOUNTS[months as keyof typeof PRICING_DISCOUNTS];
  return { planId: id as PricingPlanId, months, amount: Math.round(plan.monthlyCents * months * (100 - discount) / 100), discount };
}
/** Monthly contribution before fixed overhead and acquisition; input and output in BRL. */
export function estimateContribution(price: number, variableCost: number, taxRate: number, processingRate = 0.0469, processingFixed = 0.39) {
  if (![price,variableCost,taxRate,processingRate,processingFixed].every(Number.isFinite) || price <= 0 || variableCost < 0 || taxRate < 0 || taxRate > 1 || processingRate < 0 || processingFixed < 0) return null;
  return Math.round((price * (1 - taxRate - processingRate) - variableCost - processingFixed) * 100) / 100;
}
