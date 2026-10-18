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
  // Explicit ISO offset protects same-day dates from implicit UTC conversions.
  const input = String(value || '');
  if (!/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(input)) return false;
  const time = Date.parse(input);
  return Number.isFinite(time) && time > now + 30_000 && time <= now + 90 * 86400_000;
}
export function validMediaItems(input: unknown): input is Array<{url: string; type: 'image'|'video'}> {
  return Array.isArray(input) && input.length <= 10 && input.every((item) => {
    if (!item || (item.type !== 'image' && item.type !== 'video') || typeof item.url !== 'string') return false;
    try {
      const url = new URL(item.url);
      return url.protocol === 'https:' && url.hostname === 'media.zernio.com'
        && url.pathname.startsWith('/temp/') && url.pathname.length > 6;
    } catch { return false; }
  });
}
export function mediaRequired(platforms: Array<{platform: string}>, media: unknown): boolean {
  return platforms.some(p=>['instagram','tiktok','pinterest'].includes(p.platform))
     && (!Array.isArray(media) || media.length === 0);
}
class IntegrationError extends Error { constructor(public status: number, message: string) { super(message); } }

async function callZernio(path: string, method: 'GET' | 'POST' = 'GET', body?: object, idempotency?: string) {
  const key = process.env['ZERNIO_API_KEY'] || process.env['ZERNIO_APP_KEY'];
  // Keep the key strictly server-side; reject placeholder and malformed keys.
  if (key && !/^(?:sk|zrk)_[0-9a-f]{64}$/i.test(key))
    throw new IntegrationError(503, 'Credencial Zernio inválida. Verifique ZERNIO_API_KEY na Vercel.');
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
      if (response.status === 409 && result?.code === 'profile_external_id_conflict' && result?.details?.existingProfileId) return { profile:{_id:result.details.existingProfileId} };
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
    const anonKey = process.env['SUPABASE_ANON_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
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
  // Zernio enforces a unique externalId and profile name. Reuse it when an earlier
  // request created the profile but our database write timed out.
  const profileName = 'agendaai-' + ctx.externalId;
  let profileId: string | undefined;
  try {
    const created: any = await callZernio('/profiles', 'POST', {
      name: profileName, description: ctx.displayName, externalId: ctx.externalId
    });
    profileId = created.profile?._id;
  } catch (error) {
    if (!(error instanceof IntegrationError) || error.status !== 409) throw error;
  }
  if (!profileId || !OBJECT_ID.test(profileId)) {
    const query: any = await callZernio('/profiles?externalId=' + encodeURIComponent(ctx.externalId));
    const profiles = query.profiles || query.data?.profiles || [];
    const found = profiles.find((p: any) => p.externalId === ctx.externalId || p.name === profileName);
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
    // Lightweight authenticated check: validates the app key without creating
    // a Zernio profile, connecting an account or posting anything.
    if (action === 'health') {
      const verify: any = await callZernio('/auth/verify');
      return res.status(200).json({ configured: verify.valid === true, authType: verify.authType || null });
    }
    const { data: mapped, error: mappedError } = await db.from('zernio_profile_links')
      .select('zernio_profile_id').eq('external_id',ctx.externalId).maybeSingle();
    if (mappedError) throw new IntegrationError(503,'Migração Zernio indisponível.');
    let profileId: string | null = mapped?.zernio_profile_id || null;
    // Browsing the dashboard must be read-only. Create a profile only after
    // the salon or Owner explicitly starts an OAuth connection.
    if (action === 'connect' && !profileId) profileId = await ensureProfile(db,ctx);
    if (action === 'overview') {
      let accounts: any[] = [];
      if (profileId) {
        const accountsResult: any = await callZernio('/accounts?profileId='+encodeURIComponent(profileId));
        accounts = scopedAccounts(accountsResult.accounts || accountsResult.data?.accounts, profileId)
          .map((a: any) => ({ id:a._id || a.id, platform:a.platform, username:a.username, isActive:a.isActive }));
      }
      // Owner only: aggregated, read-only visibility over connected tenant profiles.
      // A tenant never receives any other tenant's identifiers.
      let tenants: Array<{ nome: string; profileId: string; connectedAccounts: number }> = [];
      if (scope === 'owner') {
        const { data: rows, error: lookup } = await db.from('zernio_profile_links')
          .select('estabelecimento_id,zernio_profile_id,estabelecimento(nome)').eq('scope','tenant').limit(100);
        if (lookup) throw new IntegrationError(503,'Não foi possível carregar perfis dos salões.');
        const all: any = await callZernio('/accounts');
        const allAccounts = all.accounts || all.data?.accounts;
        tenants = (rows || []).map((r: any) => ({
          nome: r.estabelecimento?.nome || 'Estabelecimento',
          profileId: r.zernio_profile_id,
          connectedAccounts: scopedAccounts(allAccounts, r.zernio_profile_id).filter((a: any) => a.isActive).length,
        }));
      }
      return res.status(200).json({ profileId, accounts, tenants });
    }
    if (action === 'connect') {
      if (!profileId) throw new IntegrationError(503,'Não foi possível criar o perfil Zernio.');
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
    if (action === 'media-presign') {
      const filename = String(body.filename || '');
      const contentType = String(body.contentType || '');
      const size = Number(body.size || 0);
      const supported = ['image/jpeg','image/png','video/mp4','video/quicktime'];
      if (!profileId) throw new IntegrationError(409,'Conecte uma rede social antes de enviar mídia.');
      if (!supported.includes(contentType) || filename.length < 3 || filename.length > 160
        || filename.includes('/') || filename.includes(String.fromCharCode(92)) || !Number.isFinite(size) || size <= 0 || size > 300 * 1024 * 1024)
        throw new IntegrationError(400,'Envie JPG, PNG, MP4 ou MOV de até 300 MB.');
      const upload: any = await callZernio('/media/presign','POST',{filename,contentType,size});
      let trustedUpload = false;
      try {
        const putUrl = new URL(String(upload.uploadUrl || ''));
        trustedUpload = putUrl.protocol === 'https:' && validMediaItems([{url:String(upload.publicUrl || ''), type:contentType.startsWith('image/')?'image':'video'}]);
      } catch { trustedUpload = false; }
      if (!trustedUpload) throw new IntegrationError(502,'O Zernio não retornou um endereço de upload válido.');
      return res.status(200).json({ uploadUrl:upload.uploadUrl, publicUrl:upload.publicUrl });
    }
    if (action === 'draft' || action === 'schedule') {
      if (!profileId) throw new IntegrationError(409,'Conecte primeiro uma rede social ao seu estabelecimento.');
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
      const mediaItems = body.mediaItems || [];
      if (!validMediaItems(mediaItems)) throw new IntegrationError(400,'Os anexos de mídia são inválidos. Envie arquivos pela área de upload.');
      if (mediaRequired(platforms,mediaItems))
        throw new IntegrationError(400,'O Instagram exige uma foto ou vídeo. Adicione uma mídia antes de agendar.');
      if (platforms.some(p => p.platform === 'instagram') && content.length > 2200)
        throw new IntegrationError(400,'O Instagram aceita até 2.200 caracteres na legenda.');
      const payload: Record<string,unknown> = {content,platforms, ...(mediaItems.length ? {mediaItems} : {})};
      if (action === 'schedule') {
        if (!validSchedule(body.scheduledFor, Date.now()))
          throw new IntegrationError(400,'Escolha uma data e horário ainda futuros. Para hoje, selecione um horário após o atual.');
        // Zernio accepts an ISO instant with Z; never reinterpret it in another timezone.
        payload['scheduledFor'] = new Date(String(body.scheduledFor)).toISOString();
        payload['timezone'] = 'UTC';
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
