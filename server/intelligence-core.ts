
/** Deterministic policy and evidence functions. Model output can never alter these facts. */
export type IntelligenceTier = 'agenda' | 'gestao' | 'growth';
export type AiFeature = 'narrative' | 'campaign_draft';
export interface EventFact { start: string; status?: string; cliente_id?: string | null; servico_id?: string | null }
export interface Metrics {
  booked30: number; completed30: number; noShows30: number; cancelled30: number;
  upcoming7: number; paidSales30: number | null; received30: number | null;
  topService: string | null; sampleLimited: boolean; periodDays: number;
}
export function intelligenceTier(plan: unknown, pilot = false): IntelligenceTier {
  if (pilot || plan === 'growth') return 'growth';
  if (['gestao','basico','completo','premium'].includes(String(plan))) return 'gestao';
  return 'agenda';
}
export function intelligenceLimit(tier: IntelligenceTier, feature: AiFeature): number {
  if (feature === 'campaign_draft') return tier === 'growth' ? 8 : 0;
  return tier === 'growth' ? 80 : tier === 'gestao' ? 20 : 3;
}
export function metricsFromEvidence(
  past: EventFact[], upcoming: EventFact[],
  receipts: Array<{ valor_total: unknown; connect_orders?: { refunded_cents?: unknown } | Array<{refunded_cents?:unknown}> | null }> | null,
  services: Array<{id:string;titulo:string}>, sampleLimited = false,
): Metrics {
  const canceled = (status: unknown) => status === 'cancelado' || status === 'cancelled' || status === 'canceled';
  const valid = past.filter(e => !canceled(e.status));
  const serviceHits = new Map<string,number>();
  for (const ev of valid) if (ev.servico_id) serviceHits.set(ev.servico_id,(serviceHits.get(ev.servico_id)||0)+1);
  const topId = [...serviceHits].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const topService = topId && services.find(s=>s.id===topId)?.titulo || null;
  let paidSales30:number|null = null, received30:number|null = null;
  if (receipts !== null) {
    paidSales30 = receipts.length;
    received30 = Math.round(receipts.reduce((sum,rec)=>{
      const order=Array.isArray(rec.connect_orders)?rec.connect_orders[0]:rec.connect_orders;
      const total=Math.round(Number(rec.valor_total||0)*100);
      const refunded=Number(order?.refunded_cents||0);
      return sum+Math.max(0,Number.isFinite(total)?total-(Number.isFinite(refunded)?refunded:0):0);
    },0))/100;
  }
  return {
    booked30:valid.length,
    completed30:valid.filter(e=>e.status==='concluido').length,
    noShows30:valid.filter(e=>e.status==='noshow').length,
    cancelled30:past.length-valid.length,
    upcoming7:upcoming.filter(e=>!canceled(e.status)).length,
    paidSales30, received30, topService, sampleLimited, periodDays:30,
  };
}
export interface InsightFact { id:string;title:string;detail:string;kind:'fact'|'opportunity';source:string;destination:string }
export function insightsFromEvidence(m:Metrics,tier:IntelligenceTier,returningEligible=0):InsightFact[]{
  const insights:InsightFact[]=[
    { id:'upcoming',title:'Agenda dos próximos 7 dias',detail:m.upcoming7+' agendamento(s) não cancelado(s) registrados. Confira as reservas e a disponibilidade antes de divulgar horários.',kind:'fact',source:'agenda_events · próximos 7 dias',destination:'/admin/agenda'},
    { id:'activity',title:'Atendimentos registrados',detail:m.booked30+' agendamento(s) não cancelado(s) nos últimos 30 dias; '+m.completed30+' marcado(s) como concluído(s).',kind:'fact',source:'agenda_events · 30 dias',destination:'/admin/analytics'},
  ];
  if (tier!=='agenda') {
    insights.push({
      id:'attendance',title:'Acompanhar faltas e cancelamentos',
      detail:m.noShows30+' falta(s) e '+m.cancelled30+' cancelamento(s) registrados no período. Considere rever lembretes e políticas de confirmação.',
      kind:'opportunity',source:'agenda_events · 30 dias',destination:'/admin/agenda'
    });
    if(m.received30!==null)insights.push({
      id:'received',title:'Recebimentos confirmados',
      detail:'O valor do caixa reflete somente itens marcados como pagos, descontando estornos associados; não é previsão nem receita incremental por IA.',
      kind:'fact',source:'caixa_itens + connect_orders · 30 dias',destination:'/admin/recebimentos'
    });
  }
  if(tier==='growth') {
    if(returningEligible>0)insights.push({
      id:'returning',title:'Clientes que podem ser reativados',
      detail:returningEligible+' cliente(s) com último atendimento anterior a 30 dias e permissão de e-mail registrada. Revise o público antes de qualquer contato.',
      kind:'opportunity',source:'clientes + client_contact_preferences',destination:'/admin/retencao'
    });
    insights.push({id:'opportunity',title:'Transforme uma vaga real em campanha',
      detail:'Escolha serviço, profissional e uma vaga confirmada pela agenda para criar um rascunho; nenhuma mensagem será enviada automaticamente.',
      kind:'opportunity',source:'growth_open_slots · disponibilidade atual',destination:'/admin/crescimento'});
  }
  return insights;
}

/** Explicit cost gate: missing flag, valid model ID or server credential means rules-only mode. */
export function gatewayModelConfig(env:Record<string,string|undefined>):string|null {
  if(env['AI_GATEWAY_ENABLED']!=='true')return null;
  const model=env['AI_GATEWAY_MODEL']||'';
  if(!/^[a-z0-9][a-z0-9._-]{0,31}\/[a-z0-9][a-z0-9._-]{0,95}$/i.test(model))return null;
  if(!env['VERCEL_OIDC_TOKEN']&&!env['AI_GATEWAY_API_KEY'])return null;
  return model;
}
