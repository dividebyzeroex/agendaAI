import { afterEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ account:vi.fn(), endpoints:vi.fn() }));
vi.mock('stripe', () => ({default:class {accounts={retrieve:calls.account};webhookEndpoints={list:calls.endpoints};}}));
import { operationalBillingReadiness } from '../server/billing.js';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
function configure(){
 for(const [k,v] of Object.entries({STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example',CONTRACT_READY:'true',BUSINESS_LEGAL_NAME:'Fornecedor',BUSINESS_TAX_ID:'Documento',BUSINESS_CONTACT_EMAIL:'business@example.test',BUSINESS_ADDRESS:'Endereço',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',PROJECT_URL:'https://example.test'}))vi.stubEnv(k,v);
 calls.account.mockResolvedValue({charges_enabled:true});
 calls.endpoints.mockResolvedValue({data:[{url:'https://example.test/api/webhook',status:'enabled',livemode:true,enabled_events:['*']}]});
}
describe('operational billing checks',()=>{
 it('requires a configured enabled endpoint and a charge-ready live account',async()=>{
  configure();expect((await operationalBillingReadiness()).ready).toBe(true);
  calls.account.mockResolvedValue({charges_enabled:false});expect((await operationalBillingReadiness()).reason).toBe('stripe_account');
 });
 it('rejects an endpoint in the wrong mode or missing events',async()=>{
  configure();calls.endpoints.mockResolvedValue({data:[{url:'https://example.test/api/webhook',status:'enabled',livemode:false,enabled_events:['*']}]});expect((await operationalBillingReadiness()).ready).toBe(false);
  calls.endpoints.mockResolvedValue({data:[{url:'https://example.test/api/webhook',status:'enabled',livemode:true,enabled_events:['invoice.paid']}]});expect((await operationalBillingReadiness()).ready).toBe(false);
 });
 it('fails closed when the provider rejects the credentials',async()=>{
  configure();calls.account.mockRejectedValue(new Error('Unauthorized'));expect((await operationalBillingReadiness()).reason).toBe('stripe_connection');
 });
});
