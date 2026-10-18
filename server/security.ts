import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from './http.js';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function adminClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new HttpError(503, 'Serviço indisponível.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorizeTenant(req: VercelRequest, tenantId: unknown) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new HttpError(401, 'Autenticação necessária.');
  if (typeof tenantId !== 'string' || !isUuid(tenantId)) throw new HttpError(400, 'Estabelecimento inválido.');
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(header.slice(7));
  if (error || !user) throw new HttpError(401, 'Sessão inválida.');
  const { data: owner } = await db.from('estabelecimento').select('id').eq('id', tenantId).eq('user_id', user.id).maybeSingle();
  if (!owner) {
    const { data: member } = await db.from('profissionais').select('id').eq('estabelecimento_id', tenantId).eq('user_id', user.id).eq('ativo', true).in('role', ['dono', 'secretaria', 'admin']).maybeSingle();
    if (!member) throw new HttpError(403, 'Acesso não autorizado.');
  }
  const {data:access,error:accessError}=await db.from('estabelecimento').select('active,trial_ends_at,plano_expires_at').eq('id',tenantId).single();
  if(accessError||!access?.active||Math.max(Date.parse(access.trial_ends_at||'')||0,Date.parse(access.plano_expires_at||'')||0)<=Date.now())throw new HttpError(403,'Acesso vencido ou bloqueado.');
  return db;
}
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function projectOrigin() {
  const raw = process.env['PROJECT_URL'];
  if (!raw || !raw.startsWith('https://')) throw new HttpError(503, 'URL pública não configurada.');
  return new URL(raw).origin;
}
export function handleError(res: any, error: unknown) { return res.status(error instanceof HttpError ? error.status : 500).json({ error: error instanceof HttpError ? error.message : 'Não foi possível concluir a operação.' }); }
