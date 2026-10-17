import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { adminClient, authorizeTenant, HttpError, handleError, isUuid } from './security.js';
import { authenticate, ownedEstablishment, billingClients } from './billing.js';
import type { VercelRequest, VercelResponse } from './http.js';
const env = () => process.env['INTEGRATION_ENCRYPTION_KEY'];
export function seal(value: string) {
  const key = env();
  if (!key)
    throw new HttpError(503, 'Proteção das credenciais ainda não configurada pela plataforma.');
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  const body = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
export function unseal(value: string) {
  const key = env();
  if (!key) throw Error('Encryption unavailable');
  const [iv, tag, body] = value.split('.').map((x) => Buffer.from(x, 'base64url'));
  const c = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  c.setAuthTag(tag);
  return Buffer.concat([c.update(body), c.final()]).toString('utf8');
}
export async function checked(q: any) {
  const { data, error } = await q;
  if (error) throw new HttpError(503, 'Não foi possível consultar ou salvar os dados.');
  return data;
}
export async function credentials(db: any, tenant: string) {
  return (await checked(db.rpc('integration_secret', { p_tenant: tenant, p_patch: null }))) || {};
}
export function focusBase(environment: string) {
  return environment === 'production'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
}
export async function focusRequest(
  config: any,
  secret: string,
  path: string,
  method = 'GET',
  body?: any,
) {
  const r = await fetch(focusBase(config.fiscal_environment) + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw Error('Provider response unavailable');
  }
  return { ok: r.ok, status: r.status, data };
}
export function safeFiscalUrl(raw: unknown, environment: string) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw, focusBase(environment));
    return u.protocol === 'https:' &&
      ['api.focusnfe.com.br', 'homologacao.focusnfe.com.br'].includes(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function fiscalPatch(data: any, environment: string) {
  const status = String(data.status || '');
  return {
    provider_status: status,
    status:
      status === 'autorizado'
        ? 'authorized'
        : status === 'cancelado'
          ? 'cancelled'
          : status === 'erro_autorizacao'
            ? 'rejected'
            : 'processing',
    error:
      status === 'erro_autorizacao'
        ? 'O emissor recusou a nota. Confira o cadastro e os dados fiscais.'
        : null,
    pdf_url: safeFiscalUrl(data.url_danfse || data.caminho_danfe, environment),
    xml_url: safeFiscalUrl(data.caminho_xml_nota_fiscal || data.caminho_xml, environment),
    updated_at: new Date().toISOString(),
  };
}
export async function integrationsHandler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = String(req.query['action']);
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const tenant = req.body?.estabelecimentoId,
      db = await authorizeTenant(req, tenant),
      user = await authenticate(db, req.headers.authorization);
    await ownedEstablishment(db, tenant, user.id);
    if (action === 'integration-info') {
      const config = await checked(
        db.from('tenant_integrations').select('*').eq('estabelecimento_id', tenant).maybeSingle(),
      );
      const secrets = await credentials(db, tenant);
      return res.status(200).json({
        config,
        credentials: {
          whatsapp: !!secrets.whatsapp_token,
          fiscal: !!secrets.fiscal_token,
          encryption: !!env(),
          webhook: !!process.env['WHATSAPP_APP_SECRET'] && !!process.env['WHATSAPP_VERIFY_TOKEN'],
        },
        deliveries: await checked(
          db
            .from('whatsapp_deliveries')
            .select('id,kind,status,error,created_at')
            .eq('estabelecimento_id', tenant)
            .order('created_at', { ascending: false })
            .limit(50),
        ),
        documents: await checked(
          db
            .from('fiscal_documents')
            .select('id,receipt_id,kind,environment,status,error,pdf_url,xml_url,created_at')
            .eq('estabelecimento_id', tenant)
            .order('created_at', { ascending: false })
            .limit(50),
        ),
      });
    }
    if (action === 'integration-save') {
      const d = req.body?.config || {},
        old = await checked(
          db.from('tenant_integrations').select('*').eq('estabelecimento_id', tenant).maybeSingle(),
        ),
        secrets = await credentials(db, tenant),
        patch: any = {};
      for (const [input, column] of [
        ['whatsappToken', 'whatsapp_token'],
        ['fiscalToken', 'fiscal_token'],
      ]) {
        const val = req.body?.[input];
        if (val) {
          if (typeof val !== 'string' || val.length < 10 || val.length > 4096)
            throw new HttpError(400, 'Credencial inválida.');
          patch[column] = seal(val);
        }
      }
      const phone = String(d.whatsapp_phone_id || ''),
        template = String(d.whatsapp_template || '');
      if (
        d.whatsapp_enabled &&
        (!/^\d{5,30}$/.test(phone) ||
          !/^[a-z0-9_]{2,100}$/.test(template) ||
          !(patch.whatsapp_token || secrets.whatsapp_token) ||
          !process.env['WHATSAPP_APP_SECRET'] ||
          !process.env['WHATSAPP_VERIFY_TOKEN'])
      )
        throw new HttpError(
          400,
          'Configure o número, o token, o modelo aprovado e o webhook Meta antes de ativar.',
        );
      if (d.whatsapp_enabled && req.body?.whatsappConfirmed !== true)
        throw new HttpError(
          400,
          'Confirme que o modelo foi aprovado com os quatro campos indicados.',
        );
      if (
        d.fiscal_enabled &&
        (!/^\d{14}$/.test(String(d.fiscal_cnpj)) || !(patch.fiscal_token || secrets.fiscal_token))
      )
        throw new HttpError(400, 'Informe CNPJ e token do emissor.');
      if (
        !['homologation', 'production'].includes(d.fiscal_environment) ||
        !['nfse', 'nfce'].includes(d.fiscal_kind)
      )
        throw new HttpError(400, 'Ambiente ou tipo fiscal inválido.');
      if (
        d.fiscal_environment === 'production' &&
        old?.fiscal_environment !== 'production' &&
        req.body?.productionConfirmed !== true
      )
        throw new HttpError(400, 'Confirme a homologação e a configuração fiscal com o contador.');
      if (d.pix_enabled === true && !old?.pix_enabled) {
        const account = await checked(
          db
            .from('connect_accounts')
            .select('account_id,enabled')
            .eq('estabelecimento_id', tenant)
            .maybeSingle(),
        );
        if (!account?.enabled)
          throw new HttpError(409, 'Vincule e ative sua conta Stripe antes de oferecer Pix.');
        try {
          const a = await billingClients().stripe.accounts.retrieve(
            account.account_id,
            {},
            { timeout: 8000, maxNetworkRetries: 0 },
          );
          if (!a.charges_enabled || a.capabilities?.pix_payments !== 'active')
            throw Error('Unavailable');
        } catch {
          throw new HttpError(
            409,
            'A Stripe ainda não confirmou Pix ativo nesta conta. Habilite Pix no painel da conta vinculada e tente novamente.',
          );
        }
      }
      const profile = d.fiscal_profile || {};
      if (
        typeof profile !== 'object' ||
        Array.isArray(profile) ||
        JSON.stringify(profile).length > 40000
      )
        throw new HttpError(400, 'Perfil fiscal inválido.');
      if (Object.keys(patch).length)
        await checked(db.rpc('integration_secret', { p_tenant: tenant, p_patch: patch }));
      await checked(
        db.from('tenant_integrations').upsert({
          estabelecimento_id: tenant,
          whatsapp_enabled: d.whatsapp_enabled === true,
          whatsapp_phone_id: phone,
          whatsapp_template: template,
          whatsapp_language: 'pt_BR',
          pix_enabled: d.pix_enabled === true,
          fiscal_enabled: d.fiscal_enabled === true,
          fiscal_environment: d.fiscal_environment,
          fiscal_kind: d.fiscal_kind,
          fiscal_cnpj: String(d.fiscal_cnpj || ''),
          fiscal_profile: profile,
          updated_at: new Date().toISOString(),
        }),
      );
      return res.status(200).json({ saved: true });
    }
    if (action.startsWith('fiscal-')) return fiscalAction(req, res, db, tenant, action);
    throw new HttpError(400, 'Ação inválida.');
  } catch (e) {
    return handleError(res, e);
  }
}
export async function fiscalAction(
  req: VercelRequest,
  res: VercelResponse,
  db: any,
  tenant: string,
  action: string,
) {
  const config = await checked(
    db.from('tenant_integrations').select('*').eq('estabelecimento_id', tenant).single(),
  );
  if (!config?.fiscal_enabled) throw new HttpError(409, 'Configure e ative o emissor fiscal.');
  const secrets = await credentials(db, tenant);
  if (!secrets.fiscal_token) throw new HttpError(409, 'Token do emissor indisponível.');
  if (action === 'fiscal-draft') {
    const receiptId = req.body?.receipt;
    if (!isUuid(receiptId)) throw new HttpError(400, 'Selecione uma venda paga.');
    const receipt = await checked(
      db
        .from('caixa_itens')
        .select('*')
        .eq('id', receiptId)
        .eq('estabelecimento_id', tenant)
        .single(),
    );
    if (
      receipt.status_caixa !== 'pago' ||
      Number(receipt.valor_total) <= 0 ||
      ['sinal', 'resgate', 'clube', 'pacote'].includes(receipt.origem) ||
      Number(receipt.prepaid_amount) > 0
    )
      throw new HttpError(
        400,
        'Este fluxo emite notas de vendas avulsas pagas, sem sinal ou pacote. Solicite ao contador o tratamento das demais operações.',
      );
    const products = await checked(
      db
        .from('caixa_produtos')
        .select('produto_id,quantidade,valor_unitario')
        .eq('caixa_item_id', receiptId),
    );
    const p = config.fiscal_profile || {},
      total = Number(receipt.valor_total);
    let payload: any;
    if (config.fiscal_kind === 'nfse') {
      if (products?.length)
        throw new HttpError(400, 'Separe serviços e produtos antes de emitir uma NFS-e.');
      if (
        !/^\d{7}$/.test(p.municipality || '') ||
        !p.serviceCode ||
        !p.registration ||
        !Number.isFinite(Number(p.issRate)) ||
        Number(p.issRate) < 0 ||
        Number(p.issRate) > 100
      )
        throw new HttpError(
          400,
          'Complete inscrição municipal, município, item da lista de serviços e alíquota com seu contador.',
        );
      const document = String(req.body?.customerDocument || '').replace(/\D/g, '');
      if (![11, 14].includes(document.length))
        throw new HttpError(400, 'Informe o CPF ou CNPJ do tomador.');
      payload = {
        data_emissao: new Date().toISOString(),
        natureza_operacao: '1',
        optante_simples_nacional: p.simple === true,
        prestador: {
          cnpj: config.fiscal_cnpj,
          inscricao_municipal: p.registration,
          codigo_municipio: p.municipality,
        },
        tomador: {
          [document.length === 11 ? 'cpf' : 'cnpj']: document,
          razao_social: receipt.cliente_nome,
        },
        servico: {
          discriminacao: (receipt.servicos || [])
            .map((s: any) => s.titulo || s.nome || 'Serviço')
            .join('; ')
            .slice(0, 2000),
          valor_servicos: total,
          iss_retido: false,
          item_lista_servico: p.serviceCode,
          codigo_tributario_municipio: p.taxCode || undefined,
          aliquota: Number(p.issRate),
        },
      };
    } else {
      const sum = (products || []).reduce(
        (n: number, x: any) => n + Number(x.quantidade) * Number(x.valor_unitario),
        0,
      );
      if (!products?.length || Math.abs(sum - total) > 0.01 || Number(receipt.desconto) > 0)
        throw new HttpError(
          400,
          'NFC-e disponível para vendas somente de produtos, sem descontos. Separe serviços e descontos antes da emissão.',
        );
      if (
        !p.issuer?.nome_emitente ||
        !p.issuer?.inscricao_estadual_emitente ||
        !p.issuer?.codigo_municipio_emitente
      )
        throw new HttpError(
          400,
          'Complete o cadastro estadual e endereço fiscal do emitente com seu contador.',
        );
      const items = products.map((x: any, index: number) => {
        const tax = p.products?.[x.produto_id];
        if (
          !tax?.ncm ||
          !tax?.cfop ||
          !tax?.icms_situacao_tributaria ||
          !tax?.pis_situacao_tributaria ||
          !tax?.cofins_situacao_tributaria ||
          !tax?.icms_origem
        )
          throw new HttpError(400, 'Complete a tributação de cada produto no cadastro fiscal.');
        return {
          ...tax,
          numero_item: index + 1,
          codigo_produto: x.produto_id,
          quantidade_comercial: x.quantidade,
          valor_unitario_comercial: x.valor_unitario,
          valor_bruto: Number(x.quantidade) * Number(x.valor_unitario),
          unidade_comercial: tax.unidade_comercial || 'UN',
          quantidade_tributavel: x.quantidade,
          valor_unitario_tributavel: x.valor_unitario,
          unidade_tributavel: tax.unidade_comercial || 'UN',
          inclui_no_total: 1,
        };
      });
      const payment: Record<string, string> = {
        dinheiro: '01',
        cartao_credito: '03',
        cartao_debito: '04',
        pix: '17',
      };
      if (
        !payment[receipt.forma_pagamento] ||
        ['03', '04'].includes(payment[receipt.forma_pagamento])
      )
        throw new HttpError(
          400,
          'Este fluxo exige venda paga em dinheiro ou Pix. Dados da credenciadora são necessários para cartões.',
        );
      payload = {
        ...p.issuer,
        cnpj_emitente: config.fiscal_cnpj,
        data_emissao: new Date().toISOString(),
        natureza_operacao: 'Venda',
        tipo_documento: 1,
        finalidade_emissao: 1,
        local_destino: 1,
        presenca_comprador: 1,
        consumidor_final: 1,
        modalidade_frete: 9,
        indicador_inscricao_estadual_destinatario: 9,
        items,
        formas_pagamento: [
          { forma_pagamento: payment[receipt.forma_pagamento], valor_pagamento: total },
        ],
        valor_produtos: total,
        valor_total: total,
      };
    }
    const doc = await checked(
      db.from('fiscal_documents').upsert(
        {
          estabelecimento_id: tenant,
          receipt_id: receiptId,
          kind: config.fiscal_kind,
          environment: config.fiscal_environment,
          payload,
        },
        { onConflict: 'receipt_id,kind,environment', ignoreDuplicates: true },
      ),
    );
    const existing = await checked(
      db
        .from('fiscal_documents')
        .select('id,status')
        .eq('receipt_id', receiptId)
        .eq('kind', config.fiscal_kind)
        .eq('environment', config.fiscal_environment)
        .single(),
    );
    if (!['draft', 'rejected'].includes(existing.status))
      throw new HttpError(409, 'Esta venda já tem uma nota enviada. Consulte o andamento.');
    await checked(
      db
        .from('fiscal_documents')
        .update({ payload, status: 'draft', error: null, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .in('status', ['draft', 'rejected']),
    );
    return res.status(200).json({ draft: true });
  }
  const doc = await checked(
    db
      .from('fiscal_documents')
      .select('*')
      .eq('id', req.body?.document)
      .eq('estabelecimento_id', tenant)
      .single(),
  );
  // Each document keeps its original provider environment even if settings subsequently change.
  const scoped = { ...config, fiscal_environment: doc.environment },
    path = '/v2/' + doc.kind + '/' + doc.id;
  if (action === 'fiscal-send') {
    if (req.body?.confirmed !== true)
      throw new HttpError(400, 'Revise e confirme os dados antes de emitir.');
    const sale = await checked(
      db
        .from('caixa_itens')
        .select('status_caixa,valor_total')
        .eq('id', doc.receipt_id)
        .eq('estabelecimento_id', tenant)
        .single(),
    );
    const expected = Number(doc.payload?.servico?.valor_servicos ?? doc.payload?.valor_total);
    if (
      sale.status_caixa !== 'pago' ||
      !Number.isFinite(expected) ||
      Math.abs(Number(sale.valor_total) - expected) > 0.01
    )
      throw new HttpError(
        409,
        'A venda mudou ou foi estornada. Revise a operação antes de emitir.',
      );
    const emissionPayload = { ...doc.payload, data_emissao: new Date().toISOString() };
    const claimed = await checked(
      db
        .from('fiscal_documents')
        .update({
          status: 'sending',
          payload: emissionPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle(),
    );
    if (!claimed)
      throw new HttpError(409, 'Documento já enviado. Consulte o andamento antes de repetir.');
    try {
      const r = await focusRequest(
        scoped,
        unseal(secrets.fiscal_token),
        '/v2/' + doc.kind + '?ref=' + encodeURIComponent(doc.id),
        'POST',
        emissionPayload,
      );
      await checked(
        db
          .from('fiscal_documents')
          .update(
            r.ok
              ? fiscalPatch(r.data, doc.environment)
              : {
                  status: [401, 403, 415].includes(r.status) ? 'rejected' : 'review',
                  error: 'O emissor recusou os dados fiscais. Confira o cadastro com o contador.',
                  updated_at: new Date().toISOString(),
                },
          )
          .eq('id', doc.id),
      );
    } catch {
      await checked(
        db
          .from('fiscal_documents')
          .update({
            status: 'review',
            error: 'Resultado incerto. Consulte o emissor antes de qualquer novo envio.',
          })
          .eq('id', doc.id),
      );
      throw new HttpError(
        503,
        'Envio sem confirmação. Consulte o andamento; não repita a emissão.',
      );
    }
  } else if (action === 'fiscal-sync') {
    const r = await focusRequest(scoped, unseal(secrets.fiscal_token), path);
    if (!r.ok)
      throw new HttpError(
        502,
        'O emissor não confirmou este documento. Confira a referência no painel Focus NFe.',
      );
    await checked(
      db.from('fiscal_documents').update(fiscalPatch(r.data, doc.environment)).eq('id', doc.id),
    );
  } else if (action === 'fiscal-preview') {
    return res.status(200).json({ payload: doc.payload });
  } else throw new HttpError(400, 'Ação fiscal inválida.');
  return res.status(200).json({ updated: true });
}
export async function maintainFiscal(db: any = adminClient()) {
  if (!env()) return { configured: false };
  const docs = await checked(
    db
      .from('fiscal_documents')
      .select('*')
      .in('status', ['sending', 'processing', 'review'])
      .lt('updated_at', new Date(Date.now() - 60000).toISOString())
      .order('updated_at')
      .limit(3),
  );
  let checkedCount = 0;
  const started = Date.now();
  for (const doc of docs || []) {
    if (Date.now() - started > 18000) break;
    const config = await checked(
      db
        .from('tenant_integrations')
        .select('*')
        .eq('estabelecimento_id', doc.estabelecimento_id)
        .maybeSingle(),
    );
    if (!config?.fiscal_enabled) continue;
    const secret = await credentials(db, doc.estabelecimento_id);
    if (!secret.fiscal_token) continue;
    try {
      const r = await focusRequest(
        { ...config, fiscal_environment: doc.environment },
        unseal(secret.fiscal_token),
        '/v2/' + doc.kind + '/' + doc.id,
      );
      if (r.ok) {
        await checked(
          db.from('fiscal_documents').update(fiscalPatch(r.data, doc.environment)).eq('id', doc.id),
        );
        checkedCount++;
      }
    } catch {
      /* Keep uncertain submissions for provider reconciliation; never resubmit. */
    }
  }
  return { configured: true, checked: checkedCount };
}
