/**
 * Requirements match the current GoTrue password policy: minimum length,
 * at least one lower-case, upper-case and numeric ASCII character.
 * These are checked before creating an Auth user (not just at tenant creation).
 */
export interface PasswordRequirement {
  id: 'length' | 'lower' | 'upper' | 'number';
  label: string;
  valid: boolean;
}
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: 'length', label: '8 caracteres ou mais', valid: password.length >= 8 },
    { id: 'lower', label: 'Uma letra minúscula', valid: /[a-z]/.test(password) },
    { id: 'upper', label: 'Uma letra maiúscula', valid: /[A-Z]/.test(password) },
    { id: 'number', label: 'Um número', valid: /[0-9]/.test(password) },
  ];
}
export function isValidSignupPassword(password: string): boolean {
  return passwordRequirements(password).every(item => item.valid);
}
export const PASSWORD_HELP =
  'Crie uma senha com pelo menos 8 caracteres, incluindo letra minúscula, maiúscula e número.';

export type SignupIssue =
  | 'password'
  | 'already-registered'
  | 'invalid-email'
  | 'rate-limit'
  | 'network'
  | 'disabled'
  | 'expired-session'
  | 'unknown';

/** Map untrusted provider errors to intentional, human-readable PT-BR copy. */
export function classifySignupError(error: unknown): SignupIssue {
  const input = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const code = typeof input?.code === 'string' ? input.code.toLowerCase() : '';
  const message = typeof input?.message === 'string' ? input.message.toLowerCase() : '';
  const status = Number(input?.status || 0);
  if (code === 'weak_password' || /password should contain|password.*(character|lowercase|uppercase|digit)|password.*at least|weak password|password.*invalid/.test(message)) {
    return 'password';
  }
  if (code === 'user_already_exists' || code === 'email_exists' ||
      /already registered|already exists|email.*already.*(used|taken)/.test(message)) {
    return 'already-registered';
  }
  if (code === 'email_address_invalid' || code === 'email_address_not_authorized' ||
      /invalid email|email.*not.*valid/.test(message)) {
    return 'invalid-email';
  }
  if (status === 429 || /rate.?limit|too many requests|too many attempts|sending email.*exceeded|email rate limit|limite de tentativas/.test(message) ||
      code.includes('rate_limit') || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'rate-limit';
  }
  if (code === 'signup_disabled' || /signups? (are |is )?disabled|registrations? disabled/.test(message)) {
    return 'disabled';
  }
  if (/session.*expired|jwt expired|sessão expirou|not authenticated/.test(message)) {
    return 'expired-session';
  }
  if (/failed to fetch|network|fetch failed|connection|timed? ?out|offline|aborterror|timeout/.test(message)) {
    return 'network';
  }
  return 'unknown';
}
export function signupErrorMessage(error: unknown): string {
  switch (classifySignupError(error)) {
    case 'password': return PASSWORD_HELP;
    case 'already-registered': return 'Este e-mail já possui uma conta. Entre com sua senha ou solicite um link de acesso.';
    case 'invalid-email': return 'Confira o endereço de e-mail e tente novamente.';
    case 'rate-limit': return 'Foram feitas muitas tentativas. Aguarde alguns minutos antes de solicitar outro acesso.';
    case 'network': return 'Não conseguimos conectar agora. Seus dados foram mantidos. Confira a internet e tente novamente.';
    case 'disabled': return 'Não foi possível criar a conta neste momento. Tente novamente mais tarde.';
    case 'expired-session': return 'Sua sessão expirou. Entre novamente para continuar com os dados já preenchidos.';
    default: return 'Não conseguimos concluir esta etapa agora. Seus dados continuam aqui. Tente novamente ou use o acesso por e-mail.';
  }
}
