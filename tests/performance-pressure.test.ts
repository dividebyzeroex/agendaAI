import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runGrowthWorker } from '../server/growth-worker';

afterEach(() => vi.unstubAllEnvs());

function work(nowIso:string, scheduled=true) {
  const now=()=>Date.parse(nowIso);
  const campaigns=vi.fn().mockResolvedValue({sent:0});
  const clubs=vi.fn().mockResolvedValue({attempted:0});
  const holds=vi.fn().mockResolvedValue({checked:0});
  const clubPayments=vi.fn().mockResolvedValue({checked:0});
  const whatsapp=vi.fn().mockResolvedValue({sent:0});
  const fiscal=vi.fn().mockResolvedValue({checked:0});
  return {db:{},scheduled,now,campaigns,clubs,holds,clubPayments,whatsapp,fiscal};
}
it('runs critical payment and customer work at each scheduled interval, skips expensive hourly and fiscal routines', async()=>{
  const deps=work('2026-10-18T12:10:00.000Z');
  const result=await runGrowthWorker(deps);
  expect(result.ok).toBe(true);
  expect(deps.campaigns).toHaveBeenCalledTimes(1);
  expect(deps.holds).toHaveBeenCalledTimes(1);
  expect(deps.clubPayments).toHaveBeenCalledTimes(1);
  expect(deps.whatsapp).toHaveBeenCalledTimes(1);
  expect(deps.clubs).not.toHaveBeenCalled();
  expect(deps.fiscal).not.toHaveBeenCalled();
  expect(result.clubs).toEqual({skipped:'cadence'});
  expect(result.fiscal).toEqual({skipped:'cadence'});
});
it('runs fiscal reconciliation every twenty minutes and club renewal hourly',async()=>{
  const fiscal=work('2026-10-18T12:20:00.000Z');
  await runGrowthWorker(fiscal);
  expect(fiscal.fiscal).toHaveBeenCalledTimes(1);
  expect(fiscal.clubs).not.toHaveBeenCalled();
  const hourly=work('2026-10-18T13:00:00.000Z');
  await runGrowthWorker(hourly);
  expect(hourly.fiscal).toHaveBeenCalledTimes(1);
  expect(hourly.clubs).toHaveBeenCalledTimes(1);
});
it('keeps full maintenance for authorized manual/owner dispatches',async()=>{
  const deps=work('2026-10-18T12:10:00.000Z',false);
  await runGrowthWorker(deps);
  expect(deps.fiscal).toHaveBeenCalledTimes(1);
  expect(deps.clubs).toHaveBeenCalledTimes(1);
});
it('coalesces same-tenant encryption key requests and clears on tenant change',()=>{
  const src=readFileSync(new URL('../src/app/services/security.service.ts',import.meta.url),'utf8');
  expect(src).toContain('this.inFlightKey?.tenant === tenant');
  expect(src).toContain('this.estId !== tenant');
  expect(src).toContain('this.inFlightKey = null');
});
it('limits idle cash polling without delaying pending Stripe checks',()=>{
  const src=readFileSync(new URL('../src/app/pages/admin-caixa/admin-caixa.ts',import.meta.url),'utf8');
  expect(src).toContain('this.onlinePending || this.pendingOnline.length');
  expect(src).toContain('Date.now() - lastIdleCheck < 64000');
  expect(src).toContain('void this.reviewActivePayment()');
});
it('schedules DB background work ten minutes apart and only removes demonstrably broken placeholder jobs',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261018093000_reduce_worker_pressure.sql',import.meta.url),'utf8');
  expect(sql).toContain('*/10 * * * *');
  expect(sql).toContain('agendaai-growth-workers');
  expect(sql).toContain('https://xxx.supabase.co');
  expect(sql).toContain('YOUR_ANON_KEY');
});
