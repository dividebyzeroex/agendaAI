/**
 * api/utils/sanitize.ts
 *
 * Unicode Sanitization — adaptado do Claude Source Code (utils/sanitization.ts)
 *
 * Protege contra ASCII Smuggling e Hidden Prompt Injection:
 * Caracteres Unicode invisíveis podem injetar instruções maliciosas que
 * o AI processa mas o usuário não vê.
 *
 * Aplicar em TODO input de usuário antes de salvar no banco ou
 * passar para multi-agents.
 */

/** Remove caracteres Unicode perigosos de uma string. Iterativo até estabilizar. */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return input;
  let current = input;
  let previous = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (current !== previous && iterations < MAX_ITERATIONS) {
    previous = current;

    // NFKC normalization decompõe sequências de caracteres compostos
    current = current.normalize('NFKC');

    // Remove categorias Unicode perigosas (invisíveis ao usuário)
    try {
      current = current.replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '');
    } catch {
      // Fallback para ambientes sem suporte a Unicode Property Escapes
    }

    // Ranges explícitos como fallback adicional
    current = current
      .replace(/[\u200B-\u200F]/g, '')   // Zero-width spaces + LTR/RTL marks
      .replace(/[\u202A-\u202E]/g, '')   // Directional formatting
      .replace(/[\u2066-\u2069]/g, '')   // Directional isolates
      .replace(/[\uFEFF]/g, '')          // Byte Order Mark
      .replace(/[\uE000-\uF8FF]/g, ''); // Private use area

    iterations++;
  }

  return current;
}

/** Sanitiza recursivamente strings dentro de objetos e arrays. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDeep) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[sanitizeText(k)] = sanitizeDeep(v);
    }
    return result as unknown as T;
  }
  return value;
}

/** Trunca e sanitiza um telefone para E.164 brasileiro. */
export function sanitizePhone(phone: string): string {
  const clean = sanitizeText(phone).replace(/\D/g, '').slice(0, 13);
  if (clean.startsWith('55') && clean.length >= 12) return `+${clean}`;
  if (clean.length === 10 || clean.length === 11) return `+55${clean}`;
  return `+${clean}`;
}
