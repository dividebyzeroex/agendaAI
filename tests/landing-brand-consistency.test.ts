import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/app/pages/landing/landing.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../src/app/pages/landing/landing.html',import.meta.url),'utf8');
const index=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
describe('Landing: visual consistency with AgendaAI brand',()=>{
  it('reuses the existing marketing tokens rather than adding an unrelated palette',()=>{
    expect(css).toContain('--brand-violet: #6941c6');
    expect(css).toContain("--font-sans: 'Space Grotesk'");
    expect(css).toContain('--landing-dark: #170f2b');
    expect(css).toContain('.product-pay-section {\n  background: var(--landing-dark);');
    expect(css).toContain('.aa-price-section { background: #faf8ff;');
    expect(index).toContain('Space+Grotesk');
  });
  it('aligns title hierarchy and emphasis across five requested sections',()=>{
    for(const id of ['diferenciais','comparativo','pay-express','multi-service','crescimento'])
      expect(html).toContain('id="'+id+'"');
    for(const name of ['.aa-value-intro h2','.aa-price-header h2','.pay-editorial-header h2','.multi-copy h2','.ag-growth-intro h2'])
      expect(css).toContain(name);
    expect(css).not.toMatch(/font-family:\\s*Georgia/i);
    expect(css).toContain('font-size: clamp(2rem,3.7vw,3rem)');
    expect(css).toContain('color: var(--brand-violet)');
    expect(css).toContain('font-style: normal');
  });
  it('preserves dark-section contrast and semantic payment success styling',()=>{
    expect(css).toContain('.pay-editorial-header h2 { color: #fff; }');
    expect(css).toContain('.pay-editorial-header h2 em { color: var(--landing-lilac); }');
    expect(css).toContain('.pay-success-symbol');
    expect(css).toContain('.pay-cash-action.is-done');
    expect(css).toContain('.multi-slot-nails');
  });
  it('keeps interaction and mobile typography intact',()=>{
    expect(html).toContain('setCheckoutScene(scene.id)');
    expect(html).toContain('id="comparativo"');
    expect(html).toContain('id="modulos"');
    expect(css).toContain('@media(max-width:700px) {');
    expect(css).toContain('font-size: clamp(2rem,8vw,2.8rem)');
    expect(css).toContain('outline: 3px solid var(--brand-violet)');
  });
});
