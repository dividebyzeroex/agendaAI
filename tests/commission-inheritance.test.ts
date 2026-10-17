import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  new URL('../supabase/migrations/20261017210900_commission_rate_inheritance.sql', import.meta.url),
  'utf8'
);

describe('Commission policy uses the registered professional default',()=>{
  it('does not silently create zero-percent overrides for service links',()=>{
    expect(migration).toContain('ALTER COLUMN taxa_comissao DROP DEFAULT');
    expect(migration).toContain('taxa_comissao = NULL');
    expect(migration).toContain('NULL = comissão padrão do profissional');
  });
  it('uses inheritance for cash sales, Connect orders and bundle redemptions',()=>{
    expect(migration).toContain('coalesce(rule.taxa_comissao,default_rate,0)');
    expect(migration).toContain('coalesce(r.taxa_comissao,p.comissao_padrao,0)');
    expect(migration).toContain('coalesce(rule.taxa_comissao,pro.comissao_padrao,0)');
  });
  it('preserves explicit zero override and fixed commission priority',()=>{
    expect(migration).toContain("rule.tipo_comissao='fixo' and rule.taxa_comissao is not null");
    expect(migration).toContain("r.tipo_comissao='fixo' and r.taxa_comissao is not null");
    expect(Number((70*13/100).toFixed(2))).toBe(9.10);
  });
  it('repairs only unpaid historical commission items for JP, never estornado or paid',()=>{
    expect(migration).toContain("c.status='pendente'");
    expect(migration).toContain("c.taxa_aplicada=0 AND c.valor_comissao=0");
    expect(migration).toContain("p.comissao_padrao=13");
    expect(migration).toContain("COMMIT;");
  });
});