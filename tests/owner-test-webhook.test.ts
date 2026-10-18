import {describe,it,expect,vi,beforeEach} from 'vitest';
import Stripe from 'stripe';
const clients=vi.hoisted(()=>vi.fn());
vi.mock('../server/billing.js',async original=>({...await original<any>(),billingClients:clients}));
import handler from '../api/webhook.js';
const stripe=new Stripe('sk_test_local_fixture');
const secret='whsec_local_fixture';
const event={id:'evt_owner_fixture',type:'checkout.session.completed',data:{object:{id:'cs_live_fixture',metadata:{purpose:'owner_live_test',ownerUserId:'owner-a'},client_reference_id:'owner-a',mode:'payment',livemode:true,currency:'brl',amount_total:100,status:'complete',payment_status:'paid',payment_intent:'pi_fixture'}}};
function response(){const res:any={setHeader:vi.fn(),json:vi.fn(),send:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;}
function request(payload:string,signature:string){return {method:'POST',headers:{'stripe-signature':signature},async *[Symbol.asyncIterator](){yield Buffer.from(payload);}} as any;}
beforeEach(()=>{process.env['STRIPE_WEBHOOK_SECRET']=secret;});
describe('Owner test signed webhook boundary',()=>{
 it('records only authenticated Stripe delivery in the separate test ledger',async()=>{
  const q={update:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),select:vi.fn().mockResolvedValue({data:[{id:'cs_live_fixture'}],error:null})};const from=vi.fn(()=>q);clients.mockReturnValue({stripe,db:{from}});
  const payload=JSON.stringify(event);const res=response();await handler(request(payload,stripe.webhooks.generateTestHeaderString({payload,secret})),res);
  expect(res.status).toHaveBeenCalledWith(200);expect(from).toHaveBeenCalledWith('owner_payment_tests');expect(q.update).toHaveBeenCalledWith(expect.objectContaining({status:'paid',webhook_event_id:'evt_owner_fixture',webhook_at:expect.any(String)}));expect(from).toHaveBeenCalledTimes(1);
 });
 it('rejects invalid signatures without recording a successful test',async()=>{
  const from=vi.fn();clients.mockReturnValue({stripe,db:{from}});const res=response();await handler(request(JSON.stringify(event),'invalid'),res);expect(res.status).toHaveBeenCalledWith(400);expect(from).not.toHaveBeenCalled();
 });
});
