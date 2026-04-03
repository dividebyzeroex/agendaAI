/**
 * src/app/utils/memoize.ts
 *
 * Stale-While-Revalidate (SWR) cache helper — adaptado de utils/memoize.ts (Claude Source)
 *
 * Padrão:
 * 1. Cache fresh   → retorna imediatamente
 * 2. Cache stale   → retorna stale E refresca em background (não bloqueia)
 * 3. Sem cache     → bloqueia até ter o valor, deduplica chamadas concorrentes
 *
 * Ideal para: EstabelecimentoService, ServicoService — dados que mudam pouco
 * mas devem ser sempre responsivos.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  refreshing: boolean;
}

/**
 * Versão assíncrona com deduplicação de cold misses.
 * Evita N chamadas paralelas ao mesmo recurso.
 */
export function createSWRCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  ttlMs = 5 * 60 * 1000, // 5 minutos default
): {
  get: (...args: Args) => Promise<Result>;
  clear: () => void;
} {
  const cache = new Map<string, CacheEntry<Result>>();
  const inFlight = new Map<string, Promise<Result>>();

  function key(args: Args): string {
    return JSON.stringify(args);
  }

  async function get(...args: Args): Promise<Result> {
    const k = key(args);
    const cached = cache.get(k);
    const now = Date.now();

    // 1. Sem cache → cold miss, deduplica chamadas concorrentes
    if (!cached) {
      const pending = inFlight.get(k);
      if (pending) return pending;

      const promise = fn(...args);
      inFlight.set(k, promise);

      try {
        const result = await promise;
        if (inFlight.get(k) === promise) {
          cache.set(k, { value: result, timestamp: now, refreshing: false });
        }
        return result;
      } finally {
        if (inFlight.get(k) === promise) inFlight.delete(k);
      }
    }

    // 2. Cache stale → retorna stale + refresca em background
    if (now - cached.timestamp > ttlMs && !cached.refreshing) {
      cached.refreshing = true;
      const stale = cached;

      fn(...args)
        .then(newValue => {
          if (cache.get(k) === stale) {
            cache.set(k, { value: newValue, timestamp: Date.now(), refreshing: false });
          }
        })
        .catch(() => {
          if (cache.get(k) === stale) {
            stale.refreshing = false; // Permite nova tentativa
          }
        });

      return cached.value;
    }

    // 3. Cache fresh
    return cache.get(k)!.value;
  }

  return {
    get,
    clear: () => { cache.clear(); inFlight.clear(); },
  };
}
