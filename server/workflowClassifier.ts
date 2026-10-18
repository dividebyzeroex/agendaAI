/**
 * api/utils/workflowClassifier.ts
 *
 * Classifier de ações de workflow — inspirado em:
 * - utils/permissions/dangerousPatterns.ts (Claude Source)
 * - utils/permissions/yoloClassifier.ts (Claude Source)
 *
 * Antes de executar qualquer ação de automação, verifica se é uma
 * ação permitida e não contém padrões destrutivos.
 */

/** Ações explicitamente permitidas nos workflows do AgendaAi */
const SAFE_ACTIONS = new Set([
  'SEND_SMS',
  'SEND_EMAIL',
  'NOTIFY_ADMIN',
  'ADD_TAG',
  'UPDATE_STATUS',
  'CREATE_EVENT',
  'CANCEL_EVENT',
  'SEND_REMINDER',
  'LOG_ACTIVITY',
]);

/** Triggers de eventos explicitamente permitidos */
const SAFE_TRIGGERS = new Set([
  'ON_EVENT_CREATED',
  'ON_EVENT_CANCELED',
  'ON_EVENT_UPDATED',
  'ON_CLIENT_CREATED',
  'ON_REMINDER_DUE',
  'ON_NO_SHOW',
  'CRON_DAILY',
]);

/** Padrões destrutivos que NUNCA devem aparecer em mensagens/payloads */
const DANGEROUS_PATTERNS = [
  /drop\s+table/i,
  /truncate\s+table/i,
  /delete\s+from/i,
  /update\s+\w+\s+set/i,
  /exec\s*\(/i,
  /eval\s*\(/i,
  /process\.env/i,
  /<script/i,
  /javascript:/i,
  /on\w+=["']/i,      // HTML event injection
  /\$\{.*\}/,         // Template literal injection
  /system\s*\(/i,
];

export interface ClassifierResult {
  allowed: boolean;
  reason?: string;
  risk: 'safe' | 'suspicious' | 'blocked';
}

/**
 * Verifica se um trigger é permitido.
 */
export function classifyTrigger(trigger: string): ClassifierResult {
  if (SAFE_TRIGGERS.has(trigger)) {
    return { allowed: true, risk: 'safe' };
  }
  return {
    allowed: false,
    reason: `Trigger "${trigger}" não é um evento permitido. Permitidos: ${[...SAFE_TRIGGERS].join(', ')}`,
    risk: 'blocked',
  };
}

/**
 * Verifica se uma ação de workflow é permitida.
 */
export function classifyAction(action: string): ClassifierResult {
  if (SAFE_ACTIONS.has(action)) {
    return { allowed: true, risk: 'safe' };
  }
  return {
    allowed: false,
    reason: `Ação "${action}" não é uma ação permitida. Permitidas: ${[...SAFE_ACTIONS].join(', ')}`,
    risk: 'blocked',
  };
}

/**
 * Verifica um payload de mensagem/SMS por padrões de injeção.
 */
export function classifyPayload(payload: unknown): ClassifierResult {
  const text = JSON.stringify(payload);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        reason: `Payload contém padrão suspeito: ${pattern.source}`,
        risk: 'blocked',
      };
    }
  }

  return { allowed: true, risk: 'safe' };
}

/**
 * Classificação completa de uma requisição de workflow.
 * Verifica trigger + action + payload em sequência.
 */
export function classifyWorkflowRequest(
  trigger: string,
  action: string,
  payload: unknown,
): ClassifierResult {
  const triggerResult = classifyTrigger(trigger);
  if (!triggerResult.allowed) return triggerResult;

  const actionResult = classifyAction(action);
  if (!actionResult.allowed) return actionResult;

  const payloadResult = classifyPayload(payload);
  if (!payloadResult.allowed) return payloadResult;

  return { allowed: true, risk: 'safe' };
}
