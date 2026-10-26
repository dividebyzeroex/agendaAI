// @vitest-environment jsdom
import '@angular/compiler';
import {beforeEach,afterAll,expect,it,vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {BehaviorSubject,firstValueFrom} from 'rxjs';
import {BillingService} from '../src/app/services/billing.service';
import {EstabelecimentoService} from '../src/app/services/estabelecimento.service';
import {CostTrackerService} from '../src/app/services/cost-tracker.service';
import {SupabaseService} from '../src/app/services/supabase.service';
import {Agendar} from '../src/app/pages/agendar/agendar';
import {AdminConfiguracoes} from '../src/app/pages/admin-configuracoes/admin-configuracoes';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>{TestBed.resetTestEnvironment();vi.unstubAllGlobals();});
let tenant:BehaviorSubject<any>;
beforeEach(()=>{TestBed.resetTestingModule();tenant=new BehaviorSubject<any>(null);TestBed.configureTestingModule({providers:[BillingService,{provide:EstabelecimentoService,useValue:{estabelecimento$:tenant}},{provide:CostTrackerService,useValue:{}},{provide:SupabaseService,useValue:{client:{auth:{getSession:async()=>({data:{session:{access_token:'test-only'}}})}}}}]});});
it('preserves the actionable server error when checkout fails',async()=>{
 const service=TestBed.inject(BillingService);tenant.next({id:'tenant-a'});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Já existe uma assinatura.'})}));
 await expect(service.processStripeCheckout('agenda',1,true)).rejects.toThrow('Já existe uma assinatura.');
});
it('does not redirect to a malformed checkout URL',async()=>{
 const service=TestBed.inject(BillingService);tenant.next({id:'tenant-a'});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({init_point:'https://evil.example/pay'})}));
 await expect(service.processStripeCheckout('agenda',1,true)).rejects.toThrow('endereço válido');
});
it('keeps a valid trial usable after an old paid period expires',async()=>{
 const service=TestBed.inject(BillingService);tenant.next({plano_expires_at:'2000-01-01',trial_ends_at:'2099-01-01'});
 expect(await firstValueFrom(service.getSubscriptionStatus())).toBe('TRIAL');
});
it('sends an absolute reservation instant instead of browser-local time',()=>{
 const instant=new Date('2026-10-15T09:30:00-03:00');
 expect((Agendar.prototype as any).toLocalISO(instant)).toBe('2026-10-15T12:30:00.000Z');
});
it('shares the stored booking slug even after the business name changes',()=>{
 const getter=Object.getOwnPropertyDescriptor(AdminConfiguracoes.prototype,'publicLink')!.get!;
 expect(getter.call({estabelecimento:{nome:'New Name',slug:'original-link'}})).toBe(window.location.origin+'/agendar/original-link');
});
