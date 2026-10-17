/** Manual payments must already have been received before the cashier marks a receipt paid. */
const manualMethods = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito'] as const;
export function requiresReceivedPaymentConfirmation(method: string): boolean {
  return manualMethods.some(allowed => allowed === method);
}
/** Stripe generates an unpaid charge; other methods only register money already received. */
export function canSubmitCashPayment(method: string, receivedConfirmed: boolean): boolean {
  return method === 'online' ||
    (requiresReceivedPaymentConfirmation(method) && receivedConfirmed);
}
