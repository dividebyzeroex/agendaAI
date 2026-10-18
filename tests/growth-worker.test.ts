import {afterEach,expect,it,vi} from 'vitest';
import {runGrowthWorker} from '../server/growth-worker';
afterEach(()=>vi.unstubAllEnvs());
it('prepares opted-in retention before draining and runs the financial maintenance independently',async()=>{
 vi.stubEnv('RESEND_API_KEY','fixture');vi.stubEnv('RESEND_FROM_EMAIL','fixture@example.test');vi.stubEnv('PROJECT_URL','https://example.test');
 const sequence:string[]=[],rpc=vi.fn(async()=>{sequence.push('prepare');return{data:1,error:null};});
 const result=await runGrowthWorker({db:{rpc},campaigns:async()=>{sequence.push('drain');return{sent:1};},clubs:async()=>({attempted:0}),holds:async()=>({checked:1}),clubPayments:async()=>({checked:1})});
 expect(result.ok).toBe(true);expect(sequence).toEqual(['prepare','drain']);expect(rpc).toHaveBeenCalledWith('prepare_retention_campaigns',{p_limit:10});
});
it('does not hide an email worker failure or prevent payment maintenance',async()=>{
 vi.stubEnv('RESEND_API_KEY','');const clubs=vi.fn().mockResolvedValue({attempted:1}),holds=vi.fn().mockResolvedValue({checked:1});
 const result=await runGrowthWorker({db:{},campaigns:async()=>{throw Error('provider unavailable');},clubs,holds,clubPayments:async()=>({checked:0})});
 expect(result.ok).toBe(false);expect(clubs).toHaveBeenCalledTimes(1);expect(holds).toHaveBeenCalledTimes(1);expect(result.campaigns).toEqual({error:'Rotina indisponível; conferir antes de repetir.'});
});
