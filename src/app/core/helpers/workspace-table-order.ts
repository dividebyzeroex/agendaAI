/**
 * Each financial table has its own timestamp schema.
 * financial_settlements records payment time in paid_at (no created_at).
 */
export function workspaceOrderColumn(table: string): string {
  return table === 'financial_settlements' ? 'paid_at' : 'created_at';
}
