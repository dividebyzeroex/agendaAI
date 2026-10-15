// @vitest-environment jsdom
import '@angular/compiler';
import {TestBed} from '@angular/core/testing';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {BehaviorSubject} from 'rxjs';
import {beforeEach,afterAll,expect,it,vi} from 'vitest';
import {AgendaEventService} from '../src/app/services/agenda-event.service';
import {SupabaseService} from '../src/app/services/supabase.service';
import {EstabelecimentoService} from '../src/app/services/estabelecimento.service';
import {SecurityService} from '../src/app/services/security.service';
import {NotificationService} from '../src/app/services/notification.service';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
let rpc:ReturnType<typeof vi.fn>,service:AgendaEventService;
const event={title:'Ana — Corte',start:'2026-10-16T12:00:00Z',end:'2026-10-16T12:30:00Z'};
beforeEach(()=>{
 TestBed.resetTestingModule();rpc=vi.fn();const channel:any={on:()=>channel,subscribe:()=>channel};
 TestBed.configureTestingModule({providers:[
 {provide:SupabaseService,useValue:{client:{rpc,channel:()=>channel}}},
 {provide:EstabelecimentoService,useValue:{activeId$:new BehaviorSubject(null),estabelecimento$:new BehaviorSubject({id:'tenant'})}},
 {provide:SecurityService,useValue:{encryptObject:async(v:any)=>v,decryptObject:async(v:any)=>v}},
 {provide:NotificationService,useValue:{}}
 ]});service=TestBed.inject(AgendaEventService);
});
it('keeps a single booking working using the existing RPC when series migration is absent',async()=>{
 rpc.mockResolvedValue({error:{code:'PGRST202',message:'Function missing from schema cache'}});
 const fallback=vi.spyOn(service,'addEvent').mockResolvedValue({...event,id:'saved'});
 expect(await service.addSeries(event,1,14,'key')).toEqual([{...event,id:'saved'}]);expect(fallback).toHaveBeenCalledExactlyOnceWith(event);
});
it('does not create a partial recurring series without the transaction function',async()=>{
 rpc.mockResolvedValue({error:{code:'PGRST202',message:'Function missing'}});const fallback=vi.spyOn(service,'addEvent');
 await expect(service.addSeries(event,3,14,'key')).rejects.toThrow('Escolha uma visita');expect(fallback).not.toHaveBeenCalled();
});
it('does not retry uncertain network or permission failures through a second write path',async()=>{
 const fallback=vi.spyOn(service,'addEvent');
 for(const code of ['42501','FETCH_ERROR']){rpc.mockResolvedValue({error:{code,message:'Failed'}});await expect(service.addSeries(event,1,14,'key')).rejects.toThrow();}
 expect(fallback).not.toHaveBeenCalled();
});
