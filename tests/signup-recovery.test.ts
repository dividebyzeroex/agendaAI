// @vitest-environment jsdom
import '@angular/compiler';
import {readFileSync} from 'node:fs';
import {TestBed} from '@angular/core/testing';
import {ɵresolveComponentResources} from '@angular/core';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {provideRouter} from '@angular/router';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {Login} from '../src/app/pages/login/login';
import {AuthService} from '../src/app/services/auth.service';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
let auth:any;
beforeEach(async()=>{
 await ɵresolveComponentResources(url=>Promise.resolve(readFileSync('src/app/pages/login/'+url.replace(/^\.\//,''),'utf8')));
 TestBed.resetTestingModule();localStorage.clear();
 auth={checkSession:vi.fn().mockResolvedValue(false),signUpWithPassword:vi.fn().mockResolvedValue({session:null}),signInWithOtp:vi.fn().mockResolvedValue({}),redirectAfterLogin:vi.fn().mockResolvedValue(undefined)};
 TestBed.configureTestingModule({imports:[Login],providers:[provideRouter([]),{provide:AuthService,useValue:auth}]});
 TestBed.overrideComponent(Login,{set:{template:readFileSync('src/app/pages/login/login.html','utf8'),styles:[],styleUrls:[]}});
});
async function setup(){const f=TestBed.createComponent(Login);f.detectChanges();await f.whenStable();const c=f.componentInstance;c.isSignupMode=true;c.email='jp@example.com';c.password='example-password';c.termsAccepted=true;await c.submitEmail();c.form.nome='Studio Teste';c.form.slug='studio-teste';f.detectChanges();return f;}
it('renders confirmation in the active card after signup without a session',async()=>{const f=await setup();await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.textContent).toContain('jp@example.com');expect(f.nativeElement.textContent).toContain('Abra o link de confirmação');expect(f.nativeElement.querySelector('.on-front')).toBeNull();expect(f.nativeElement.querySelector('.on-card-3d').style.transform).toBe('');expect(auth.redirectAfterLogin).not.toHaveBeenCalled();f.destroy();});
it('shows an in-flight status and prevents duplicate submissions',async()=>{const f=await setup();let resolve:any;auth.signUpWithPassword.mockReturnValue(new Promise(r=>resolve=r));const pending=f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.textContent).toContain('Preparando seu cadastro');await f.componentInstance.finalizarOnboarding();expect(auth.signUpWithPassword).toHaveBeenCalledTimes(1);resolve({session:null});await pending;f.destroy();});
it('shows signup failure with preserved fields and allows retry',async()=>{const f=await setup();auth.signUpWithPassword.mockRejectedValueOnce(new Error('Limite de tentativas. Tente novamente.'));await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('Limite de tentativas');expect(f.componentInstance.form.nome).toBe('Studio Teste');expect(f.nativeElement.querySelector('.on-front')).not.toBeNull();await f.componentInstance.finalizarOnboarding();expect(auth.signUpWithPassword).toHaveBeenCalledTimes(2);f.destroy();});
it('redirects only when signup returns an authenticated session',async()=>{const f=await setup();auth.signUpWithPassword.mockResolvedValue({session:{user:{id:'test'}}});await f.componentInstance.finalizarOnboarding();expect(auth.redirectAfterLogin).toHaveBeenCalledTimes(1);f.destroy();});
it('resets the password step when switching from login to registration',async()=>{const f=await setup();const c=f.componentInstance;c.returnToLogin();c.step='auth';c.toggleMode();f.detectChanges();expect(c.step).toBe('email');expect(f.nativeElement.querySelector('#email')).not.toBeNull();expect(f.nativeElement.querySelector('#new_password')).not.toBeNull();f.destroy();});
it('keeps a visible recovery path when navigation fails after account creation',async()=>{const f=await setup();auth.signUpWithPassword.mockResolvedValue({session:{user:{id:'test'}}});auth.redirectAfterLogin.mockRejectedValue(new Error('Não foi possível abrir o painel. Tente entrar novamente.'));await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('Não foi possível abrir o painel');expect(f.componentInstance.isLoading).toBe(false);f.destroy();});
