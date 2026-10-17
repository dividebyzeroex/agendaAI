/**
 * Secure second-screen transport for the AgendaAI cashier.
 *
 * The secret stays in the URL fragment (never sent to the HTTP server), and
 * only SHA-256 derived topics and AES-GCM ciphertext reach Supabase Realtime.
 * Anyone holding the pairing link is a trusted physical display.
 * Payment confirmation MUST still be verified against Stripe on the server.
 */
export type DisplayPhase = 'idle' | 'draft' | 'awaiting' | 'recorded';
export interface DisplayItem {
  title: string;
  quantity: number;
  unitPrice: number;
}
export interface DisplaySnapshot {
  version: 1;
  phase: DisplayPhase;
  establishment: string;
  logoUrl: string;
  items: DisplayItem[];
  discount: number;
  prepaid: number;
  total: number;
  receiptToken: string;
  paymentUrl: string;
  issuedAt: number;
  revision: number;
}
export type DisplayPacket = { type: 'snapshot'; snapshot: DisplaySnapshot } | { type: 'hello' } | { type: 'shutdown' };
export interface SealedPacket { iv: string; ciphertext: string; }

export const DISPLAY_SUCCESS_MS = 8500;
export const DISPLAY_RECORD_MS = 7000;
export const DISPLAY_STALE_MS = 27000;
export const PAYMENT_POLL_MS = 6000;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SECRET_PATTERN = new RegExp('^' + UUID + '-' + UUID + '$', 'i');
const RECEIPT_PATTERN = new RegExp('^' + UUID + '$', 'i');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createDisplaySecret(): string {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}
export function validDisplaySecret(value: string): boolean {
  return SECRET_PATTERN.test(value);
}
export function displayUrl(origin: string, secret: string): string {
  if (!validDisplaySecret(secret)) throw new Error('Pareamento inválido');
  return new URL('/visor-caixa#pair=' + encodeURIComponent(secret), origin).href;
}
function toBase64(bytes: Uint8Array): string {
  let chars = '';
  for (const byte of bytes) chars += String.fromCharCode(byte);
  return btoa(chars);
}
function fromBase64(text: string): Uint8Array {
  const chars = atob(text);
  return Uint8Array.from(chars, ch => ch.charCodeAt(0));
}
export async function createDisplayCipher(secret: string): Promise<{topic: string; key: CryptoKey}> {
  if (!validDisplaySecret(secret)) throw new Error('Pareamento inválido');
  const topicDigest = await crypto.subtle.digest('SHA-256', encoder.encode('agendaai-display-topic-v1:' + secret));
  const keyDigest = await crypto.subtle.digest('SHA-256', encoder.encode('agendaai-display-aes-v1:' + secret));
  const topic = Array.from(new Uint8Array(topicDigest)).map(n => n.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', keyDigest, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
  return { topic: 'agendaai-screen-' + topic, key };
}
export async function sealDisplayPacket(key: CryptoKey, payload: DisplayPacket): Promise<SealedPacket> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, clear);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}
export async function openDisplayPacket(key: CryptoKey, packet: unknown): Promise<DisplayPacket | null> {
  if (!packet || typeof packet !== 'object') return null;
  const encoded = packet as Partial<SealedPacket>;
  if (typeof encoded.iv !== 'string' || typeof encoded.ciphertext !== 'string' ||
      encoded.iv.length > 40 || encoded.ciphertext.length > 24000) return null;
  try {
    const rawIv = fromBase64(encoded.iv);
    if (rawIv.length !== 12) return null;
    // Own ArrayBuffers, not ArrayBufferLike/SharedArrayBuffer, required by DOM WebCrypto types.
    const iv = new Uint8Array(rawIv.length);
    iv.set(rawIv);
    const rawCiphertext = fromBase64(encoded.ciphertext);
    const ciphertext = new Uint8Array(rawCiphertext.length);
    ciphertext.set(rawCiphertext);
    const bytes = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ciphertext);
    const decoded: unknown = JSON.parse(decoder.decode(bytes));
    if (!decoded || typeof decoded !== 'object') return null;
    const packetValue = decoded as Partial<DisplayPacket>;
    if (packetValue.type === 'hello') return {type: 'hello'};
    if (packetValue.type === 'shutdown') return {type: 'shutdown'};
    if (packetValue.type !== 'snapshot') return null;
    const snapshot = readDisplaySnapshot((packetValue as {snapshot?:unknown}).snapshot);
    return snapshot ? {type:'snapshot', snapshot} : null;
  } catch {
    return null;
  }
}
function validNumber(value: unknown, ceiling: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= ceiling;
}
function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export function safePayUrl(value: unknown, receiptToken: string, origin: string): string {
  if (typeof value !== 'string' || value.length > 3000 || !RECEIPT_PATTERN.test(receiptToken)) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.hostname === 'checkout.stripe.com') return parsed.toString();
    if (parsed.origin === origin && parsed.pathname === '/comanda/' + receiptToken &&
        !parsed.search && !parsed.hash) return parsed.toString();
  } catch {
    // Disallow untrusted origins or arbitrary URLs in the customer QR.
  }
  return '';
}
export function readDisplaySnapshot(raw: unknown): DisplaySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s['version'] !== 1 || !['idle','draft','awaiting','recorded'].includes(String(s['phase'])) ||
      !validNumber(s['total'], 10000000) || !validNumber(s['discount'], 10000000) ||
      !validNumber(s['prepaid'], 10000000) ||
      !validNumber(s['issuedAt'], 9999999999999) || !validNumber(s['revision'], 1e12) ||
      !Array.isArray(s['items']) || s['items'].length > 30) return null;
  const items: DisplayItem[] = [];
  for (const candidate of s['items']) {
    if (!candidate || typeof candidate !== 'object') return null;
    const item = candidate as Record<string,unknown>;
    if (!clip(item['title'], 90) || !validNumber(item['quantity'], 1000) ||
        !Number.isInteger(item['quantity']) || item['quantity'] === 0 ||
        !validNumber(item['unitPrice'], 10000000)) return null;
    items.push({title: clip(item['title'], 90), quantity:item['quantity'], unitPrice:item['unitPrice']});
  }
  const phase = s['phase'] as DisplayPhase;
  const token = clip(s['receiptToken'], 40);
  if (phase === 'awaiting' && !RECEIPT_PATTERN.test(token)) return null;
  if (phase === 'recorded' && s['paymentUrl']) return null;
  return {
    version:1,
    phase,
    establishment:clip(s['establishment'], 90) || 'Estabelecimento',
    logoUrl:clip(s['logoUrl'], 500),
    items,
    discount:s['discount'] as number,
    prepaid:s['prepaid'] as number,
    total:s['total'] as number,
    receiptToken:RECEIPT_PATTERN.test(token)?token:'',
    paymentUrl:clip(s['paymentUrl'], 3000),
    issuedAt:s['issuedAt'] as number,
    revision:s['revision'] as number
  };
}
/** A cashier broadcast can never be proof that Stripe settled the money. */
export function confirmedByProvider(receiptToken: string, answer: unknown): boolean {
  if (!RECEIPT_PATTERN.test(receiptToken) || !answer || typeof answer !== 'object') return false;
  const result = answer as {online?:unknown; status?:unknown};
  return result.online === true && result.status === 'paid';
}
