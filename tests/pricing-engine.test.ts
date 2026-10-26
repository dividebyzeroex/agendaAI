import { describe, expect, it } from 'vitest';
import { PRICING_CATALOG, isSellablePlan, pricingQuote, estimateContribution } from '../src/app/core/pricing-catalog.js';
import { readFileSync } from 'node:fs';
const api=readFileSync(new URL('../api/billing.ts', import.meta.url),'utf8');
const billing=readFileSync(new URL('../src/app/services/billing.service.ts', import.meta.url),'utf8');
const owner=readFileSync(new URL('../src/app/pages/owner-console/owner-console.html', import.meta.url),'utf8');
describe('Pricing Engine launch safety',()=>{
 it('has two live pilot plans and preserves legacy subscriptions',()=>{
  expect(PRICING_CATALOG.agenda.monthlyCents).toBe(7900);
  expect(PRICING_CATALOG.gestao.monthlyCents).toBe(11900);
  expect(PRICING_CATALOG.growth.status).toBe('preview');
  expect(PRICING_CATALOG.basico.monthlyCents).toBe(9700);
  expect(isSellablePlan('agenda')).toBe(true);
  expect(isSellablePlan('gestao')).toBe(true);
  expect(isSellablePlan('growth')).toBe(false);
  expect(isSellablePlan('basico')).toBe(false);
  expect(api).toContain('isSellablePlan(req.body?.planId)');
  expect(billing).toContain('this.legacyPlans');
 });
 it('quotes the same prices for all checkout cycles using integer cents',()=>{
  expect(pricingQuote('agenda',1).amount).toBe(7900);
  expect(pricingQuote('gestao',3).amount).toBe(33915);
  expect(pricingQuote('gestao',12).amount).toBe(114240);
  for (const bad of ['__proto__','toString','unknown']) expect(()=>pricingQuote(bad,1)).toThrow();
  expect(()=>pricingQuote('agenda','12')).toThrow();
 });
 it('estimates contribution but rejects nonsensical assumptions',()=>{
  expect(estimateContribution(119,15,0.06)).toBe(90.89);
  expect(estimateContribution(0,15,0.06)).toBeNull();
  expect(estimateContribution(119,15,-1)).toBeNull();
  expect(owner).toContain('PRICING INTELLIGENCE');
  expect(owner).toContain('não alteração automática de preços');
 });
});
