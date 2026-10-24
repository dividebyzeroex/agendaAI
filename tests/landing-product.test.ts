import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../src/app/pages/landing/landing.html',import.meta.url),'utf8');
const component=readFileSync(new URL('../src/app/pages/landing/landing.ts',import.meta.url),'utf8');
const stylesheet=readFileSync(new URL('../src/app/pages/landing/landing.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');

describe('AgendaAI product story and conversion experience',()=>{
  it('makes payments discoverable without claiming an official Stripe partnership',()=>{
    expect(html).toContain('id="pay-express"');
    expect(html).toContain('Stripe Connect');
    expect(html).toContain('sem digitar dados de cartão no balcão');
    expect(html).not.toMatch(/parceir[ao] oficial da Stripe/i);
    expect(component).toContain('Stripe Connect');
  });
  it('clearly labels the interactive checkout as a simulation with no real charges',()=>{
    expect(html).toContain('SIMULAÇÃO INTERATIVA');
    expect(html).toContain('Nenhum pagamento é gerado aqui');
    expect(html).toContain('Aguardando pagamento');
    expect(html).toContain('depois que o sistema valida');
    expect(html).toContain('Não escaneável');
    expect(component).toContain("checkoutScene: 'cart' | 'payment' | 'success'");
    expect(component).toContain('setCheckoutScene(');
  });
  it('represents a parallel and sequential multi-professional visit as a single receipt',()=>{
    expect(html).toContain('id="multi-service"');
    expect(html).toContain('MULTISSERVIÇOS · JÁ DISPONÍVEL');
    expect(html).toContain('combine até oito serviços por atendimento');
    expect(html).toContain('Experimentar multisserviços');
    expect(html).not.toMatch(/em preparação|em fase de liberação/i);
    expect(html).toContain('14:00–14:40');
    expect(html).toContain('14:40–15:00');
    expect(html).toContain('14:00–14:45');
    expect(html).toContain('Uma única comanda');
    expect(component).toContain("note:'Disponível no painel'");
    expect(component).toContain('Cada serviço da comanda mantém seu profissional responsável');
    expect(component).not.toMatch(/multisserviços em preparação|está em preparação para liberação/i);
  });
  it('allows exploring capabilities by operational area',()=>{
    expect(html).toContain("selectCapabilityPillar(pillar.id)");
    expect(html).toContain('visibleCapabilities');
    expect(html).toContain('aria-pressed');
    for(const pillar of ['attendance','payments','growth','management'])
      expect(component).toContain("pillar:'"+pillar+"'");
    expect(stylesheet).toContain('.capability-filters button:focus-visible');
  });
  it('preserves real conversion flows, pricing and clear trial conditions',()=>{
    expect(html).toContain('goToLogin()');
    expect(html).toContain('goToDemo()');
    expect(html).toContain('requestPilot()');
    expect(html).toContain('AgendaAI Agenda');
    expect(html).toContain('AgendaAI Gestão');
    expect(html).toContain('Growth e adicionais ainda não estão disponíveis');
    expect(html).toContain('30 dias');
    expect(index).toContain('name="description"');
    expect(index).toContain('rel="canonical"');
    expect(index).toContain('Stripe Connect');
  });
});
