import {describe,it,expect,vi,beforeEach} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc})}));
vi.mock('../server/billing.js',async original=>({...await original<any>(),operationalBillingReadiness:vi.fn().mockResolvedValue({ready:true,mode:'live'})}));
import {validateOwnerTest,recordOwnerTest,ownerPaymentTest} from '../server/owner-payment-test.js';
import {operationalBillingReadiness} from '../server/billing.js';
const session=(patch:object={})=>({id:'cs_live_fixture',mode:'payment',livemode:true,currency:'brl',amount_total:100,client_reference_id:'owner-a',metadata:{purpose:'owner_live_test',ownerUserId:'owner-a'},payment_status:'paid',status:'complete',payment_intent:'pi_fixture',url:'https://checkout.stripe.com/c/fixture',...patch}) as any;
beforeEach(()=>{rpc.mockResolvedValue({data:true,error:null});vi.mocked(operationalBillingReadiness).mockResolvedValue({ready:true,mode:'live',reason:null});process.env['PROJECT_URL']='https://example.test';});
describe('Owner live payment test',()=>{
 it('requires exact purpose, owner, live currency and one real',()=>{
  expect(validateOwnerTest(session(),'owner-a')).toBe('owner-a');
  for(const patch of [{mode:'subscription'},{livemode:false},{amount_total:9700},{currency:'usd'},{metadata:{purpose:'other',ownerUserId:'owner-a'}},{client_reference_id:'other'}])expect(()=>validateOwnerTest(session(patch),'owner-a')).toThrow();
  expect(()=>validateOwnerTest(session(),'another-owner')).toThrow();
 });
 it('never records unpaid checkout as paid',async()=>{const db={from:vi.fn()} as any;expect(await recordOwnerTest(db,session({payment_status:'unpaid'}),'evt_fixture')).toBe(false);expect(db.from).not.toHaveBeenCalled();});
 it('verification cannot fake signed webhook delivery or touch subscription revenue',async()=>{
  const q={update:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),select:vi.fn().mockResolvedValue({data:[{id:'cs_live_fixture'}],error:null})};const db={from:vi.fn(()=>q)} as any;
  await recordOwnerTest(db,session());expect(db.from).toHaveBeenCalledWith('owner_payment_tests');expect(q.update.mock.calls[0][0]).toMatchObject({status:'paid',payment_intent_id:'pi_fixture',verified_at:expect.any(String)});expect(q.update.mock.calls[0][0].webhook_at).toBeUndefined();
  await recordOwnerTest(db,session(),'evt_fixture');expect(q.update.mock.calls[1][0]).toMatchObject({webhook_event_id:'evt_fixture',webhook_at:expect.any(String)});expect(q.update.mock.calls[1][0].verified_at).toBeUndefined();
 });
 it('fails when persistence does not confirm a matching test',async()=>{const q={update:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),select:vi.fn().mockResolvedValue({data:[],error:null})};await expect(recordOwnerTest({from:()=>q} as any,session(),'evt_fixture')).rejects.toMatchObject({status:503});});
 it('rejects non-owner before creating a charge',async()=>{rpc.mockResolvedValue({data:false,error:null});const stripe={checkout:{sessions:{create:vi.fn()}}} as any;await expect(ownerPaymentTest({query:{action:'owner-test-checkout'},headers:{authorization:'Bearer fixture'},body:{confirmed:true}} as any,{} as any,{} as any,stripe,{id:'owner-a'})).rejects.toMatchObject({status:403});expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();});
 it('creates only fixed R$1 one-time checkout after explicit confirmation',async()=>{
  const create=vi.fn().mockResolvedValue(session());const upsert=vi.fn().mockResolvedValue({error:null});const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
  await ownerPaymentTest({query:{action:'owner-test-checkout'},headers:{authorization:'Bearer fixture'},body:{confirmed:true,amount:99999,requestId:'11111111-1111-4111-8111-111111111111'}} as any,res as any,{from:()=>({upsert})} as any,{checkout:{sessions:{create}}} as any,{id:'owner-a'});
  expect(create.mock.calls[0][0]).toMatchObject({mode:'payment',line_items:[{quantity:1,price_data:{currency:'brl',unit_amount:100}}],metadata:{purpose:'owner_live_test'}});expect(create.mock.calls[0][0].subscription_data).toBeUndefined();expect(upsert).toHaveBeenCalled();
 });
 it('blocks test mode and missing explicit confirmation',async()=>{
  const req={query:{action:'owner-test-checkout'},headers:{authorization:'Bearer fixture'},body:{confirmed:false,requestId:'11111111-1111-4111-8111-111111111111'}} as any;
  await expect(ownerPaymentTest(req,{} as any,{} as any,{} as any,{id:'owner-a'})).rejects.toMatchObject({status:400});
  req.body.confirmed=true;vi.mocked(operationalBillingReadiness).mockResolvedValue({ready:true,mode:'test',reason:null});await expect(ownerPaymentTest(req,{} as any,{} as any,{} as any,{id:'owner-a'})).rejects.toMatchObject({status:503});
 });
});
