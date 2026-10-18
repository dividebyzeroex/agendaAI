import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildServiceSlots,serviceSubtotal} from '../src/app/core/multi-service';
const catalog=[
  {id:'hair',duracao_min:40},
  {id:'nails',duracao_min:45},
  {id:'beard',duracao_min:20},
  {id:'brows',duracao_min:15}
];
const base='2026-10-20T17:00:00.000Z';
const booking=readFileSync(new URL('../supabase/migrations/20261017221500_multi_service_schedule.sql',import.meta.url),'utf8');
const checkout=readFileSync(new URL('../supabase/migrations/20261017222000_multi_service_checkout.sql',import.meta.url),'utf8');
describe('multi-service scheduling: parallel and sequential',()=>{
  it('schedules hair and manicure simultaneously with different professionals',()=>{
    const slots=buildServiceSlots(base,[
      {servicoId:'hair',profissionalId:'JP',mode:'sequencial'},
      {servicoId:'nails',profissionalId:'ANA',mode:'paralelo'}
    ],catalog);
    expect(slots[0].start).toBe(slots[1].start);
    expect(Date.parse(slots[0].end)-Date.parse(slots[0].start)).toBe(40*60_000);
    expect(Date.parse(slots[1].end)-Date.parse(slots[1].start)).toBe(45*60_000);
  });
  it('schedules added beard and brows after haircut with the same professional',()=>{
    const slots=buildServiceSlots(base,[
      {servicoId:'hair',profissionalId:'JP',mode:'sequencial'},
      {servicoId:'beard',profissionalId:'JP',mode:'sequencial'},
      {servicoId:'brows',profissionalId:'JP',mode:'sequencial'}
    ],catalog);
    expect(slots[0].end).toBe(slots[1].start);
    expect(slots[1].end).toBe(slots[2].start);
  });
  it('rejects scheduling the same professional on overlapping items',()=>{
    expect(()=>buildServiceSlots(base,[
      {servicoId:'hair',profissionalId:'JP',mode:'sequencial'},
      {servicoId:'beard',profissionalId:'JP',mode:'paralelo'}
    ],catalog)).toThrow('não pode executar dois serviços');
  });
  it('limits service count and validates time and canonical durations',()=>{
    expect(()=>buildServiceSlots(base,[],catalog)).toThrow();
    expect(()=>buildServiceSlots(base,Array.from({length:9},()=>({
      servicoId:'hair',profissionalId:'JP',mode:'sequencial' as const
    })),catalog)).toThrow();
    expect(()=>buildServiceSlots('bad-date',[{servicoId:'hair',profissionalId:'JP',mode:'sequencial'}],catalog)).toThrow();
    expect(serviceSubtotal([{preco:70},{preco:50},{preco:40}])).toBe(160);
  });
});
describe('multi-service financial integrity',()=>{
  it('creates server-side confirmed staff slots, not a client-only note',()=>{
    expect(booking).toContain('create_multi_service_booking');
    expect(booking).toContain('add_attendance_service');
    expect(booking).toContain('remove_attendance_service');
    expect(booking).toContain("metadata->>'parent_event_id'");
    expect(booking).toContain("status_caixa<>'cancelado'");
  });
  it('derives item price from official catalog and stores each commission separately',()=>{
    expect(checkout).toContain('extra_rule.valor_proprio,extra_service.preco');
    expect(checkout).toContain('jsonb_array_elements(submitted_extras)');
    expect(checkout).toContain('commission_lines');
    expect(checkout).toContain("commission_line->>'event'");
    expect(checkout).toContain("update public.connect_orders set commission=commission_lines");
    expect(checkout).toContain("coalesce((commission_line->>'event')::uuid,c.agenda_event_id)");
  });
  it('keeps backwards compatibility for settled Stripe orders created before multiservice',()=>{
    expect(checkout).toContain("case when jsonb_typeof(o.commission)='array'");
    expect(checkout).toContain('else jsonb_build_array(o.commission)');
  });
});
