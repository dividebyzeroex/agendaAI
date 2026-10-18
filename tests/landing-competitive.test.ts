import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { competitorMonthlyComparison, agendaAiMonthlyComparison } from '../src/app/pages/landing/plan-comparison';

const html = readFileSync(new URL('../src/app/pages/landing/landing.html',import.meta.url),'utf8');
const ts = readFileSync(new URL('../src/app/pages/landing/landing.ts',import.meta.url),'utf8');
const moduleCode = readFileSync(new URL('../src/app/pages/landing/plan-comparison.ts',import.meta.url),'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261018200000_remove_professional_calendar_cap.sql',import.meta.url),'utf8');

describe('Página de vendas — modelo de concorrente anônimo',()=>{
 it('simula preço por profissional sem apresentar valores como cotação',()=>{
   expect(competitorMonthlyComparison(1)).toBe(99.99);
   expect(competitorMonthlyComparison(5)).toBe(179.99);
   expect(competitorMonthlyComparison(10)).toBe(279.99);
   expect(competitorMonthlyComparison(0)).toBe(99.99);
   expect(agendaAiMonthlyComparison).toBe(97);
 });
 it('usa apenas a designação concorrente e não envia visitantes a sites externos',()=>{
   expect(html).toContain('id="comparativo"');
   expect(html).toContain('[(ngModel)]="comparisonTeamSize"');
   expect(html).toContain('Concorrente');
   expect(html).toContain('não representa todo o mercado');
   expect(html).toContain('Não representa todos os concorrentes');
   const priceSection = html.split('id="comparativo"')[1].split('<!-- PAY EXPRESS')[0];
   expect(priceSection).not.toMatch(/href="https?:\/\//);
   expect(priceSection).not.toContain('target="_blank"');
   // Verify no direct brand names in user-facing HTML/FAQ or comparison module.
   for(const forbidden of ['boo'+'ksy','tri'+'nks','av'+'ec']){
     for(const content of [html,ts,moduleCode]) expect(content.toLowerCase()).not.toContain(forbidden);
   }
 });
 it('mostra módulos adicionais com preços propostos, sem checkout falso',()=>{
   const addons=html.split('id="modulos"')[1].split('id="piloto"')[0];
   for (const name of ['Social Studio Pro','Growth Automations','Retenção Premium','Inteligência Financeira','Multiunidades e Franquias','Concierge Plus']) expect(addons).toContain(name);
   for (const price of ['R$ 79','R$ 49','R$ 39']) expect(addons).toContain(price);
   // Add-ons are additional charges on top of the R$ 97 base, never standalone plans.
   expect(addons).toContain('R$ 97/mês do Essencial');
   for(const total of ['R$ 176/mês','R$ 146/mês','R$ 136/mês']) expect(addons).toContain(total);
   for(const formula of ['R$ 97 + R$ 79','R$ 97 + R$ 49','R$ 97 + R$ 39']) expect(addons).toContain(formula);
   expect(addons).toContain('somados aos R$ 97/mês do Essencial');
   expect(addons).toContain('taxa única sob orçamento');
   expect(addons).toContain('consumo');
   expect(ts).toContain('Como funciona a cobrança dos módulos adicionais?');

   expect(addons).toContain('Preços em estudo, ainda não disponíveis para contratação.');
   expect(addons).not.toContain('Comprar agora');
   expect(addons).not.toContain('href="http');
   expect(html).toContain('sem cobrança por agenda ou profissional adicional');
 });
 it('mantém preço básico e exclusão de limite por agenda',()=>{
   expect(html).not.toContain('Até 5 profissionais ativos');
   expect(ts).not.toContain('até cinco profissionais ativos');
   expect(migration).toContain('drop trigger if exists enforce_professional_limit');
   expect(html).toContain('Sem taxa por agenda ou profissional adicional');
 });
 it('mantém CTAs e transparência de custos',()=>{
   expect(html).toContain('goToLogin()');
   expect(html).toContain('goToDemo()');
   expect(html).toContain('30 dias grátis');
   expect(html).toContain('impostos');
   expect(html).toContain('tarifas extras');
   expect(html).toContain('checkout');
 });
});
