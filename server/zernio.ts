import type { VercelRequest, VercelResponse } from './http.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const API = 'https://zernio.com/api/v1';
const PLATFORMS = new Set(['instagram','facebook','linkedin','tiktok','youtube','pinterest','reddit','bluesky','threads','googlebusiness','telegram','twitter','whatsapp','snapchat','discord','slack']);
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Scope = 'tenant' | 'owner';
export function scopedAccounts(input: unknown, profileId: string): any[] {
  if (!Array.isArray(input)) return [];
  return input.filter((account) => account && (
    account.profileId === profileId ||
    account.profileId?._id === profileId ||
    account.profile?._id === profileId
  ));
}
export function validSchedule(value: unknown, now: number): boolean {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) && time > now + 120000 && time <= now + 90 * 86400000;
}
class IntegrationError extends Error { constructor(public status: number, message: string) { super(message); } }

async function callZernio(path: string, method: 'GET' | 'POST' = 'GET', body?: object, idempotency?: string) {
  const key = process.env['ZERNIO_API_KEY'];
  if (!key) throw new IntegrationError(503, 'Zernio ainda não foi configurado no servidor.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(API + path, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotency ? { 'x-request-id': idempotency } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && result?.code === 'profile_external_id_conflict') return result;
      throw new IntegrationError(response.status >= 500 ? 502 : response.status, result?.error || 'Falha na comunicação com Zernio.');
    }
    return result;
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError(502, 'Não foi possível conectar ao Zernio.');
  } finally { clearTimeout(timeout); }
}

function supabaseAdmin(): SupabaseClient {
  const url = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new IntegrationError(503, 'Supabase indisponível.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function getScope(db: SupabaseClient, bearer: string, scope: Scope, tenantId?: string) {
  if (!/^Bearer\s+\S+$/i.test(bearer)) throw new IntegrationError(401, 'Entre novamente.');
  const token = bearer.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new IntegrationError(401, 'Sessão expirada.');
  if (scope === 'owner') {
    const url = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const anonKey = process.env['SUPABASE_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    if (!url || !anonKey) throw new IntegrationError(503, 'Autorização indisponível.');
    // Existing SECURITY DEFINER RPC verifies private.is_platform_owner() against the JWT.
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { error: ownerError } = await authClient.rpc('get_platform_metrics');
    if (ownerError) throw new IntegrationError(403, 'Somente o Owner pode acessar as redes da plataforma.');
    return { externalId: 'agendaai-owner', displayName: 'AgendaAI Owner', tenantId: null as string | null };
  }
  if (!tenantId || !UUID.test(tenantId)) throw new IntegrationError(400, 'Estabelecimento inválido.');
  const { data: tenant, error: lookupError } = await db.from('estabelecimento').select('id,nome,user_id,active').eq('id',tenantId).eq('user_id',user.id).maybeSingle();
  if (lookupError) throw new IntegrationError(503, 'Não foi possível consultar o estabelecimento.');
  if (!tenant?.active) throw new IntegrationError(403, 'Acesso reservado ao proprietário do estabelecimento.');
  return { externalId: tenantId, displayName: tenant.nome, tenantId };
}

async function ensureProfile(db: SupabaseClient, ctx: { externalId: string; displayName: string; tenantId: string | null }) {
  const { data: existing, error: readError } = await db.from('zernio_profile_links').select('zernio_profile_id').eq('external_id', ctx.externalId).maybeSingle();
  if (readError) throw new IntegrationError(503, 'Migração de perfis do Zernio pendente.');
  if (existing?.zernio_profile_id) return existing.zernio_profile_id as string;
  // Zernio enforces a unique profile name. Reuse it when an earlier
  // request created the profile but our database write timed out.
  const profileName = 'agendaai-' + ctx.externalId;
  let profileId: string | undefined;
  try {
    const created: any = await callZernio('/profiles', 'POST', {
      name: profileName, description: ctx.displayName
    });
    profileId = created.profile?._id;
  } catch (error) {
    if (!(error instanceof IntegrationError) || error.status !== 409) throw error;
  }
  if (!profileId || !OBJECT_ID.test(profileId)) {
    const query: any = await callZernio('/profiles');
    const profiles = query.profiles || query.data?.profiles || [];
    const found = profiles.find((p: any) => p.name === profileName);
    profileId = found?._id || found?.id;
  }
  if (!profileId || !OBJECT_ID.test(profileId)) throw new IntegrationError(502, 'Não foi possível identificar o perfil do Zernio.');
  const { error: insertError } = await db.from('zernio_profile_links').insert({
    scope: ctx.tenantId ? 'tenant' : 'owner',
    estabelecimento_id: ctx.tenantId,
    external_id: ctx.externalId,
    zernio_profile_id: profileId,
  });
  if (insertError) {
    const { data: raced } = await db.from('zernio_profile_links').select('zernio_profile_id').eq('external_id', ctx.externalId).maybeSingle();
    if (raced?.zernio_profile_id === profileId) return profileId;
    throw new IntegrationError(409, 'Conexão simultânea detectada. Atualize a página.');
  }
  return profileId as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Método não permitido.'}); }
  try {
    const action = String(req.query['action'] || '').replace(/^zernio-/, '');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const scope: Scope = body.scope === 'owner' ? 'owner' : 'tenant';
    const db = supabaseAdmin();
    const ctx = await getScope(db, String(req.headers.authorization || ''), scope, body.estabelecimentoId);
    const profileId = await ensureProfile(db,ctx);
    if (action === 'overview') {
      const accountsResult: any = await callZernio('/accounts?profileId='+encodeURIComponent(profileId));
      const accounts = scopedAccounts(accountsResult.accounts || accountsResult.data?.accounts, profileId)
        .map((a: any) => ({ id:a._id || a.id, platform:a.platform, username:a.username, isActive:a.isActive }));
      return res.status(200).json({ profileId, accounts });
    }
    if (action === 'connect') {
      const platform = String(body.platform || '');
      if (!PLATFORMS.has(platform)) throw new IntegrationError(400,'Plataforma não suportada.');
      // Use a trusted, configured first-party return URL; never use the request Host header.
      const site = new URL(process.env['PROJECT_URL'] || 'https://agenda-ai-beryl.vercel.app');
      if (site.protocol !== 'https:') throw new IntegrationError(503,'Configure PROJECT_URL com HTTPS.');
      const callback = new URL(scope==='owner'?'/platform-admin/social':'/admin/social',site.origin);
      const params = new URLSearchParams({ profileId, redirect_url: callback.toString() });
      const response: any = await callZernio('/connect/'+platform+'?'+params.toString());
      if (!response.authUrl || !/^https:\/\//.test(response.authUrl)) throw new IntegrationError(502,'Autorização indisponível no Zernio.');
      return res.status(200).json({ authUrl: response.authUrl });
    }
    if (action === 'draft' || action === 'schedule') {
      const content = String(body.content || '').trim();
      if (!content || content.length > 3000) throw new IntegrationError(400,'Escreva uma mensagem de até 3.000 caracteres.');
      const requested = Array.isArray(body.accountIds) ? [...new Set(body.accountIds.filter((v: unknown) => typeof v === 'string'))] as string[] : [];
      if (!requested.length || requested.length > 5) throw new IntegrationError(400,'Selecione de uma a cinco contas.');
      const listing: any = await callZernio('/accounts?profileId='+encodeURIComponent(profileId));
      const accounts: any[] = scopedAccounts(listing.accounts || listing.data?.accounts, profileId);
      const allowed = new Map(accounts.map(a => [a._id || a.id,a]));
      const platforms = requested.map(id => {
        const account = allowed.get(id);
        if (!account || !account.isActive || !PLATFORMS.has(account.platform)) throw new IntegrationError(403,'A conta selecionada não pertence a este perfil ou está desconectada.');
        return { accountId:id, platform:account.platform };
      });
      const payload: Record<string,unknown> = { content, platforms };
      if (action === 'schedule') {
        const scheduledAt = new Date(String(body.scheduledFor || ''));
        if (!validSchedule(body.scheduledFor, Date.now()))
          throw new IntegrationError(400,'Selecione uma data futura válida (até 90 dias).');
        // ISO with timezone offset; Zernio accepts timezone + local scheduledFor.
        const formatter = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
        payload['scheduledFor']=formatter.format(scheduledAt).replace(' ','T');
        payload['timezone']='America/Sao_Paulo';
      }
      const result: any = await callZernio('/posts','POST',payload, typeof body.requestId === 'string' && UUID.test(body.requestId)?body.requestId:undefined);
      const post = result.post || result.existingPost;
      if (!post?._id) throw new IntegrationError(502, 'Zernio não confirmou a criação da publicação.');
      return res.status(200).json({post, status: post.status || (action === 'draft' ? 'draft' : 'scheduled')});
    }
    throw new IntegrationError(400,'Ação inválida.');
  } catch (error) {
    const status=error instanceof IntegrationError ? error.status : 500;
    console.error('[Zernio] Failed:',status,error instanceof Error ? error.name : 'Error');
    return res.status(status).json({error:error instanceof IntegrationError ? error.message : 'Não foi possível concluir a operação.'});
  }
}
