// @vitest-environment jsdom
import '@angular/compiler';
import {TestBed} from '@angular/core/testing';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {Router} from '@angular/router';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {AuthService} from '../src/app/services/auth.service';
import {SupabaseService} from '../src/app/services/supabase.service';
import {SecurityService} from '../src/app/services/security.service';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
let client:any,navigate:any,profile:any;
beforeEach(()=>{
 TestBed.resetTestingModule();profile=null;navigate=vi.fn().mockResolvedValue(true);
 const user={id:'test-user',email:'test@example.com',email_confirmed_at:'2026-10-11'};
 client={auth:{onAuthStateChange:vi.fn(),getSession:vi.fn().mockResolvedValue({data:{session:{user}}}),getUser:vi.fn().mockResolvedValue({data:{user}})},rpc:vi.fn(async(name:string)=>({data:name==='is_platform_owner'?false:profile,error:null}))};
 TestBed.configureTestingModule({providers:[AuthService,{provide:SupabaseService,useValue:{client}},{provide:Router,useValue:{navigate}},{provide:SecurityService,useValue:{logSecurityEvent:vi.fn()}}]});
});
it('refreshes a cached new profile after tenant creation before opening the dashboard',async()=>{
 const service=TestBed.inject(AuthService);await service.checkSession();expect(service.userProfileValue?.role).toBe('new');
 profile={id:'test-user',nome:'Teste',role:'dono',primeiro_acesso:false,onboarding_concluido:true};
 await service.redirectAfterLogin();expect(service.userProfileValue?.role).toBe('dono');expect(navigate).toHaveBeenCalledWith(['/admin/dashboard']);expect(client.auth.getSession).toHaveBeenCalledTimes(2);
});
it('does not grant an owner role when profile refresh fails',async()=>{
 const service=TestBed.inject(AuthService);await service.checkSession();client.rpc.mockResolvedValue({data:null,error:{message:'offline'}});
 await expect(service.redirectAfterLogin()).rejects.toThrow('permissões');expect(navigate).not.toHaveBeenCalled();
});
