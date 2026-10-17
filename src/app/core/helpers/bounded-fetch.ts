/** Bound network waits without retrying mutations with an uncertain outcome. */
export async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('A conexão demorou demais. Verifique sua internet e tente novamente.', 'TimeoutError')), 20000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); source?.removeEventListener('abort', abort); }
}
