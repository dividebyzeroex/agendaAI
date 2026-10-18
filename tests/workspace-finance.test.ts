import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { workspaceOrderColumn } from '../src/app/core/helpers/workspace-table-order';

describe('Contas a pagar e receber — carregamento', () => {
  it('usa a coluna de data correta para cada tabela financeira', () => {
    expect(workspaceOrderColumn('financial_titles')).toBe('created_at');
    expect(workspaceOrderColumn('financial_settlements')).toBe('paid_at');
  });

  it('confere os nomes de colunas contra a migração real, sem depender de dados existentes', () => {
    const sql = readFileSync(
      new URL('../supabase/migrations/20261016131102_business_modules.sql', import.meta.url),
      'utf8',
    );
    const ddl = (table: string) => sql.split('\n').find(
      line => line.startsWith('create table public.' + table + '('),
    ) || '';
    expect(ddl('financial_titles')).toContain('created_at timestamptz');
    expect(ddl('financial_settlements')).toContain('paid_at timestamptz');
    expect(ddl('financial_settlements')).not.toContain('created_at');
  });

  it('não exige cadastros ou agenda para mostrar as contas', () => {
    const workspace = readFileSync(
      new URL('../src/app/pages/business-workspace/business-workspace.ts', import.meta.url),
      'utf8',
    );
    const ledger = workspace.indexOf("if (this.module === 'financeiro')");
    const unnecessary = workspace.indexOf("this.db.rpc('get_clientes_by_estab'");
    expect(ledger).toBeGreaterThan(0);
    expect(unnecessary).toBeGreaterThan(ledger);
    expect(workspace).toContain('q.order(workspaceOrderColumn(table)');
  });
});
