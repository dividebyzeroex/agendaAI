import { describe, expect, it } from 'vitest';
import { intelligenceTier,intelligenceLimit,metricsFromEvidence,insightsFromEvidence } from '../server/intelligence-core.js';
import { readFileSync } from 'node:fs';
const api=readFileSync(new URL('../api/billing.ts',import.meta.url),'utf8');
const server=readFileSync(new URL('../server/intelligence.ts',import.meta.url),'utf8');
const assistant=readFileSync(new URL('../src/app/layouts/ai-assistant/ai-assistant.component.ts',import.meta.url),'utf8');
const old=readFileSync(new URL('../src/app/services/ai-insights.service.ts',import.meta.url),'utf8');
describe('AgendaAI Intelligence — real data and tenant protection',()=>{
 it('enforces tier differences while preserving legacy subscriptions',()=>{
  expect(intelligenceTier('agenda')).toBe('agenda');
  expect(intelligenceTier('gestao')).toBe('gestao');
  expect(intelligenceTier('basico')).toBe('gestao');
  expect(intelligenceTier('growth')).toBe('growth');
  expect(intelligenceTier('agenda',true)).toBe('growth');
  expect(intelligenceLimit('agenda','narrative')).toBe(3);
  expect(intelligenceLimit('agenda','campaign_draft')).toBe(0);
  expect(intelligenceLimit('gestao','campaign_draft')).toBe(0);
  expect(intelligenceLimit('growth','campaign_draft')).toBe(8);
 });
 it('counts true paid amounts after refunds, without inventing data',()=>{
  const e=[
   {start:'2026-10-01',status:'concluido',cliente_id:'x',servico_id:'s'},
   {start:'2026-10-02',status:'noshow',servico_id:'s'},
   {start:'2026-10-03',status:'cancelado',servico_id:'s'},
  ];
  const m=metricsFromEvidence(e,[{start:'2026-10-26',status:'scheduled'}],
   [{valor_total:100,connect_orders:{refunded_cents:2500}},{valor_total:45}], [{id:'s',titulo:'Corte'}]);
  expect(m).toMatchObject({booked30:2,completed30:1,noShows30:1,cancelled30:1,upcoming7:1,paidSales30:2,received30:120,topService:'Corte'});
  expect(metricsFromEvidence([],[],null,[]).received30).toBeNull();
  expect(insightsFromEvidence(m,'agenda').some(i=>i.id==='received')).toBe(false);
 });
 it('rejects cross-tenant contexts and keeps generation separate from actions',()=>{
  expect(server).toContain(".eq('id',tenant).eq('user_id',user.id)");
  expect(server).toContain("ai_reserve_usage");
  expect(server).toContain("growth_open_slots");
  expect(server).toContain("status:'draft'");
  expect(server).toContain("getUser(token)");
  expect(api).toContain("action.startsWith('ai-')");
  expect(assistant).not.toContain("this.agendaService.addEvent(");
  expect(assistant).toContain("Eu não criei nem alterei nenhum agendamento");
  expect(old).not.toContain("Corte Signature");
  expect(server).not.toContain("sending':'");
 });
});
