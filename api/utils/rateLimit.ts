/**
 * api/utils/rateLimit.ts
 *
 * Rate limiting por plano de assinatura.
 * Verifica usage_quotas no Supabase antes de executar ações pagas.
 *
 * Planos:
 *   starter:  100 agendamentos/mês, 50 SMS/mês
 *   pro:      500 agendamentos/mês, 300 SMS/mês
 *   business: ilimitado
 */

import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'starter' | 'pro' | 'business';
export type QuotaResource = 'agendamentos' | 'sms' | 'automacoes';

const PLAN_LIMITS: Record<PlanTier, Record<QuotaResource, number>> = {
  starter:  { agendamentos: 100,  sms: 50,  automacoes: 5   },
  pro:      { agendamentos: 500,  sms: 300, automacoes: 20  },
  business: { agendamentos: -1,   sms: -1,  automacoes: -1  }, // -1 = ilimitado
};

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: PlanTier;
  resource: QuotaResource;
  resetAt: string; // ISO date — primeiro dia do próximo mês
}

function getSupabase() {
  const url  = process.env['NEXT_PUBLIC_SUPABASE_URL']!;
  const key  = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY']!;
  return createClient(url, key);
}

function firstDayNextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Verifica e incrementa o uso de um recurso para um estabelecimento.
 * @returns RateLimitResult com `allowed: false` se o limite foi atingido.
 */
export async function checkAndIncrement(
  estabelecimentoId: string,
  resource: QuotaResource,
): Promise<RateLimitResult> {
  const supabase = getSupabase();
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-04"

  // Busca plano do estabelecimento (campo `plano` na tabela estabelecimento)
  const { data: estab } = await supabase
    .from('estabelecimento')
    .select('plano')
    .eq('id', estabelecimentoId)
    .maybeSingle();

  const plan: PlanTier = (estab?.plano as PlanTier) ?? 'starter';
  const limit = PLAN_LIMITS[plan][resource];

  // Ilimitado — passe direto
  if (limit === -1) {
    return { allowed: true, current: 0, limit: -1, plan, resource, resetAt: firstDayNextMonth() };
  }

  // Upsert + counter atômico
  const { data, error } = await supabase.rpc('increment_usage_quota', {
    p_estabelecimento_id: estabelecimentoId,
    p_resource: resource,
    p_month: monthKey,
  });

  if (error) {
    console.error('[RateLimit] Erro ao verificar quota:', error.message);
    // Em caso de erro no banco, permite a ação (fail-open) para não quebrar o fluxo
    return { allowed: true, current: 0, limit, plan, resource, resetAt: firstDayNextMonth() };
  }

  const current: number = data ?? 0;

  return {
    allowed: current <= limit,
    current,
    limit,
    plan,
    resource,
    resetAt: firstDayNextMonth(),
  };
}

/**
 * Lê o uso atual sem incrementar (para exibir no painel).
 */
export async function getUsage(
  estabelecimentoId: string,
  resource: QuotaResource,
): Promise<{ current: number; limit: number; plan: PlanTier }> {
  const supabase = getSupabase();
  const monthKey = new Date().toISOString().slice(0, 7);

  const { data: estab } = await supabase
    .from('estabelecimento')
    .select('plano')
    .eq('id', estabelecimentoId)
    .maybeSingle();

  const plan: PlanTier = (estab?.plano as PlanTier) ?? 'starter';
  const limit = PLAN_LIMITS[plan][resource];

  const { data } = await supabase
    .from('usage_quotas')
    .select('count')
    .eq('estabelecimento_id', estabelecimentoId)
    .eq('resource', resource)
    .eq('month', monthKey)
    .maybeSingle();

  return { current: (data?.count as number) ?? 0, limit, plan };
}
