/** Modelo de concorrente ilustrativo, consultado em 18/10/2026.
 * Mensalidade de referência: R$ 99,99 + R$ 20 por profissional adicional.
 * Não representa todos os concorrentes, nem uma cotação; impostos não incluídos.
 */
export const agendaAiMonthlyComparison = 97;
export function competitorMonthlyComparison(professionals: number): number {
  const n = Number.isFinite(professionals) ? Math.max(1, Math.min(12, Math.round(professionals))) : 1;
  return (9999 + 2000 * (n - 1)) / 100;
}
