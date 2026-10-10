import { describe, it, expect } from 'vitest';
import { billingReadiness } from '../server/billing.js';
import { bookingDate, slotOverlaps } from '../src/app/utils/booking-slots';
describe('launch protections', () => {
 it('uses São Paulo date across UTC midnight', () => expect(bookingDate(new Date('2026-10-11T01:00:00Z'))).toBe('2026-10-10'));
 it('blocks partial overlaps, allows adjacent slots and filters professionals', () => {
  const busy=[{start:'2026-10-10T12:15:00Z',end:'2026-10-10T12:45:00Z',profissional_id:'a'}];
  expect(slotOverlaps('2026-10-10','09:00',30,busy,'a')).toBe(true);
  expect(slotOverlaps('2026-10-10','09:45',30,busy,'a')).toBe(false);
  expect(slotOverlaps('2026-10-10','09:00',30,busy,'b')).toBe(false);
  expect(slotOverlaps('2026-10-10','09:00',30,[{...busy[0],profissional_id:null}],'b')).toBe(true);
 });
 it('keeps checkout unavailable without key, webhook and complete supplier', () => {
  const env={STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example',CONTRACT_READY:'true',BUSINESS_LEGAL_NAME:'Fornecedor',BUSINESS_TAX_ID:'Documento',BUSINESS_CONTACT_EMAIL:'business@example.test',BUSINESS_ADDRESS:'Endereço'};
  expect(billingReadiness(env)).toEqual({ready:true,mode:'live'});
  expect(billingReadiness({...env,STRIPE_SECRET_KEY:'invalid'}).ready).toBe(false);
  expect(billingReadiness({...env,STRIPE_WEBHOOK_SECRET:''}).ready).toBe(false);
  expect(billingReadiness({...env,CONTRACT_READY:'false'}).ready).toBe(false);
  expect(billingReadiness({...env,BUSINESS_ADDRESS:''}).ready).toBe(false);
  expect(billingReadiness({...env,STRIPE_SECRET_KEY:'sk_test_example'}).mode).toBe('test');
 });
});
