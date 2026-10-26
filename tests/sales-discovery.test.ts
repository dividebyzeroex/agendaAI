import { describe, it, expect } from 'vitest';
import { discoverSalesNeeds, SALES_STARTERS } from '../src/app/core/consultative-sales.js';
import { pricingQuote } from '../src/app/core/pricing-catalog.js';
import { readFileSync } from 'node:fs';

const landing = readFileSync(new URL('../src/app/pages/landing/landing.html', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/app/pages/landing/landing.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/billing.ts', import.meta.url), 'utf8');
describe('Conversational AgendaAI sales journey', () => {
  it('recognizes common Portuguese needs without sending visitor data to third parties', () => {
    expect(discoverSalesNeeds(['Tenho muitos horários vagos e faltas'])?.planId).toBe('agenda');
    const needs = discoverSalesNeeds(['Quero controlar comissões e recebimentos da equipe']);
    expect(needs?.planId).toBe('gestao');
    expect(needs?.needs.map(x=>x.id)).toEqual(expect.arrayContaining(['equipe','pagamentos']));
    expect(discoverSalesNeeds(['']) ).toBeNull();
  });
  it('never sells Growth IA or a legacy tier through a personalized quote', () => {
    const proposal = discoverSalesNeeds(['Quero atrair novos clientes no Instagram']);
    expect(proposal?.growthPreview).toBe(true);
    expect(proposal?.planId).toBe('agenda');
    expect(proposal?.answer).toContain('não faz parte da contratação atual');
    expect(pricingQuote(proposal?.planId,1).amount).toBe(7900);
  });
  it('supports multi-turn discovery and starter prompts', () => {
    const proposal = discoverSalesNeeds(['Preciso de uma agenda', 'Também quero controlar as comissões']);
    expect(proposal?.planId).toBe('gestao');
    expect(SALES_STARTERS).toHaveLength(4);
    expect(proposal?.needs.map(x=>x.id)).toContain('agenda');
  });
  it('keeps a calm first impression and reveals proof only after discovery', () => {
    expect(landing).toContain('id="hero" [class.has-insight]="salesRecommendation!==null"');
    expect(landing).toContain('*ngIf="salesRecommendation as recommendation"');
    expect(landing).toContain('id="longform" [hidden]="!salesExploreOpen"');
    expect(landing).toContain('discovery-scene');
    expect(landing).toContain('[ngSwitch]="salesShowcase"');
    expect(landing).toContain('DADOS FICTÍCIOS');
    expect(component).toContain('toggleSalesExplore()');
    expect(component).toContain('get salesShowcase()');
  });
  it('uses the authorized server-side catalog and leaves real calendar sync for later', () => {
    expect(api).toContain("action === 'public-quote'");
    expect(api).toContain('isSellablePlan(req.query');
    expect(landing).toContain('id="consultoria"');
    expect(landing).toContain('submitSalesMessage(');
    expect(landing).toContain('Dados da sua agenda não são acessados');
    expect(component).toContain('discoverSalesNeeds(');
    expect(component).toContain("fetch('/api/billing?action=public-quote");
  });
});
