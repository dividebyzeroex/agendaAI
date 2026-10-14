// @vitest-environment jsdom
import '@angular/compiler';
import {readFileSync} from 'node:fs';
import {TestBed} from '@angular/core/testing';
import {ɵresolveComponentResources} from '@angular/core';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {provideRouter,Router} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {ActivationSummaryComponent} from '../src/app/components/activation-summary/activation-summary';
import {EstabelecimentoService} from '../src/app/services/estabelecimento.service';
import {SupabaseService} from '../src/app/services/supabase.service';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
let tenant:BehaviorSubject<any>,rpc:ReturnType<typeof vi.fn>;
const summary={period_start:'2026-10-01',period_end:'2026-10-11',during_trial:true,services_ready:false,staff_ready:false,schedule_ready:false,first_booking:false,appointments:0,completed:0,public_bookings:0,clients:0,cash_records:0};
beforeEach(async()=>{
 await ɵresolveComponentResources(url=>Promise.resolve(readFileSync((url.includes("quick-start")?"src/app/components/quick-start/":"src/app/components/activation-summary/")+url.replace(/^\.\//,""),"utf8")));
 TestBed.resetTestingModule();tenant=new BehaviorSubject<any>({id:'a',nome:'Studio de teste',slug:'studio-teste'});rpc=vi.fn().mockResolvedValue({data:summary,error:null});
 TestBed.configureTestingModule({imports:[ActivationSummaryComponent],providers:[provideRouter([]),{provide:EstabelecimentoService,useValue:{estabelecimento$:tenant}},{provide:SupabaseService,useValue:{client:{rpc}}}]});
 TestBed.overrideComponent(ActivationSummaryComponent,{set:{template:readFileSync('src/app/components/activation-summary/activation-summary.html','utf8'),styles:[],styleUrls:[]}});
});
it('opens services directly from the first pending step and updates after saved configuration',async()=>{
 const f=TestBed.createComponent(ActivationSummaryComponent);f.detectChanges();await f.whenStable();f.detectChanges();
 expect(f.nativeElement.textContent).toContain('0 de 4');
 expect(f.nativeElement.querySelector('.primary').getAttribute('href')).toBe('/admin/configuracoes?tab=servicos');
 const router=TestBed.inject(Router);const navigate=vi.spyOn(router,'navigateByUrl').mockResolvedValue(true);
 f.nativeElement.querySelector('.primary').click();expect(navigate).toHaveBeenCalled();
 rpc.mockResolvedValue({data:{...summary,services_ready:true,staff_ready:true,schedule_ready:true,first_booking:true,appointments:5,completed:2,public_bookings:3,clients:4,cash_records:2},error:null});
 f.nativeElement.querySelector('button').click();await f.whenStable();f.detectChanges();
 expect(f.nativeElement.textContent).toContain('4 de 4');expect(f.nativeElement.querySelector('.primary')).toBeNull();
 expect(f.nativeElement.querySelectorAll('.metrics strong')[0].textContent).toBe('5');
 expect(f.nativeElement.querySelector('[target="_blank"]').getAttribute('href')).toBe('/agendar/studio-teste');f.destroy();
});
it('shows a recoverable error instead of reporting zero usage when the request fails',async()=>{
 rpc.mockResolvedValue({error:{message:'network'}});const f=TestBed.createComponent(ActivationSummaryComponent);f.detectChanges();await f.whenStable();f.detectChanges();
 expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();expect(f.nativeElement.querySelector('.metrics')).toBeNull();
 rpc.mockResolvedValue({data:summary});f.nativeElement.querySelector('button').click();await f.whenStable();f.detectChanges();expect(f.nativeElement.querySelector('.metrics')).not.toBeNull();f.destroy();
});
it('discards a previous tenant response after account context changes',async()=>{
 let resolveA:(x:any)=>void=()=>{};rpc.mockImplementation(()=>new Promise(r=>{resolveA=r;}));
 const f=TestBed.createComponent(ActivationSummaryComponent);f.detectChanges();
 rpc.mockResolvedValue({data:{...summary,clients:9}});tenant.next({id:'b',nome:'Outro negócio'});
 await f.whenStable();resolveA({data:{...summary,clients:100}});await f.whenStable();f.detectChanges();
 expect(f.componentInstance.summary?.clients).toBe(9);expect(rpc).toHaveBeenLastCalledWith('tenant_activation_summary',{p_estabelecimento_id:'b'});f.destroy();
});
