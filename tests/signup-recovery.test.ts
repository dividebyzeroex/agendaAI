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
async function setup(){const f=TestBed.createComponent(Login);f.detectChanges();await f.whenStable();const c=f.componentInstance;c.isSignupMode=true;c.email='jp@example.com';c.password='ExamplePassword123';c.termsAccepted=true;await c.submitEmail();c.form.nome='Studio Teste';c.form.slug='studio-teste';f.detectChanges();return f;}
it('renders confirmation in the active card after signup without a session',async()=>{const f=await setup();await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.textContent).toContain('jp@example.com');expect(f.nativeElement.textContent).toContain('Abra o link de confirmação');expect(f.nativeElement.querySelector('.on-front')).toBeNull();expect(f.nativeElement.querySelector('.on-card-3d').style.transform).toBe('');expect(auth.redirectAfterLogin).not.toHaveBeenCalled();f.destroy();});
it('shows an in-flight status and prevents duplicate submissions',async()=>{const f=await setup();let resolve:any;auth.signUpWithPassword.mockReturnValue(new Promise(r=>resolve=r));const pending=f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.textContent).toContain('Preparando seu cadastro');await f.componentInstance.finalizarOnboarding();expect(auth.signUpWithPassword).toHaveBeenCalledTimes(1);resolve({session:null});await pending;f.destroy();});
it('shows signup failure with preserved fields and allows retry',async()=>{const f=await setup();auth.signUpWithPassword.mockRejectedValueOnce({code:'over_request_rate_limit',message:'Rate limit exceeded'});await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('Aguarde');expect(f.componentInstance.form.nome).toBe('Studio Teste');expect(f.nativeElement.querySelector('.on-front')).not.toBeNull();await f.componentInstance.finalizarOnboarding();expect(auth.signUpWithPassword).toHaveBeenCalledTimes(2);f.destroy();});
it('redirects only when signup returns an authenticated session',async()=>{const f=await setup();auth.signUpWithPassword.mockResolvedValue({session:{user:{id:'test'}}});await f.componentInstance.finalizarOnboarding();expect(auth.redirectAfterLogin).toHaveBeenCalledTimes(1);f.destroy();});
it('resets the password step when switching from login to registration',async()=>{const f=await setup();const c=f.componentInstance;c.returnToLogin();c.step='auth';c.toggleMode();f.detectChanges();expect(c.step).toBe('email');expect(f.nativeElement.querySelector('#email')).not.toBeNull();expect(f.nativeElement.querySelector('#new_password')).not.toBeNull();f.destroy();});
it('keeps a visible recovery path when navigation fails after account creation',async()=>{const f=await setup();auth.signUpWithPassword.mockResolvedValue({user:{id:'test'},session:{user:{id:'test'}}});auth.redirectAfterLogin.mockRejectedValue(new Error('Não foi possível abrir o painel. Tente entrar novamente.'));await f.componentInstance.finalizarOnboarding();f.detectChanges();expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sua conta foi criada');expect(f.componentInstance.isLoading).toBe(false);f.destroy();});

it('rejects weak passwords on the first signup screen before showing the company form',async()=>{
 const f=TestBed.createComponent(Login);f.detectChanges();await f.whenStable();
 const c=f.componentInstance;c.isSignupMode=true;c.email='test@example.com';c.termsAccepted=true;
 c.password='apenasminusculas';
 await c.submitEmail();
 f.detectChanges();
 expect(c.isDoingOnboarding).toBe(false);
 expect(c.errorMessage).toContain('maiúscula e número');
 expect(f.nativeElement.querySelector('#new_password')).not.toBeNull();
 expect(f.nativeElement.querySelectorAll('.signup-password-hints li.met')).toHaveLength(2);
 expect(auth.signUpWithPassword).not.toHaveBeenCalled();
 f.destroy();
});
it('shows an actionable Portuguese password error and preserves the company name after provider policy rejects signup',async()=>{
 const f=await setup();
 auth.signUpWithPassword.mockRejectedValueOnce({
   code:'weak_password',message:'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.'
 });
 await f.componentInstance.finalizarOnboarding();f.detectChanges();
 expect(f.componentInstance.isDoingOnboarding).toBe(false);
 expect(f.nativeElement.querySelector('#new_password')).not.toBeNull();
 expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('maiúscula e número');
 expect(f.nativeElement.textContent).not.toContain('Password should contain');
 expect(f.componentInstance.form.nome).toBe('Studio Teste');
 f.componentInstance.password='NewExample123';
 await f.componentInstance.submitEmail();
 expect(f.componentInstance.form.nome).toBe('Studio Teste');
 f.destroy();
});
it('offers password-free email recovery without duplicate password-based registration',async()=>{
 const f=await setup();
 const c=f.componentInstance;
 c.password='invalida';
 c.backStep();
 await c.solicitarLinkDeAcesso();f.detectChanges();
 expect(auth.signInWithOtp).toHaveBeenCalledWith('jp@example.com',expect.objectContaining({termsAccepted:true}));
 expect(auth.signUpWithPassword).not.toHaveBeenCalled();
 expect(c.onStep).toBe('conclusao');
 expect(f.nativeElement.textContent).toContain('Abra-o para continuar');
 f.destroy();
});
it('never retries auth registration after a confirmed user account when navigation fails',async()=>{
 const f=await setup();
 auth.signUpWithPassword.mockResolvedValue({user:{id:'already-created'},session:{user:{id:'already-created'}}});
 auth.redirectAfterLogin.mockRejectedValueOnce(new Error('UI error'));
 const c=f.componentInstance;
 await c.finalizarOnboarding();f.detectChanges();
 expect(c.accountCreated).toBe(true);
 expect(c.onStep).toBe('conclusao');
 expect(c.isDoingOnboarding).toBe(true);
 expect(f.nativeElement.textContent).toContain('Abrir meu painel');
 await c.finalizarOnboarding();
 expect(auth.signUpWithPassword).toHaveBeenCalledTimes(1);
 auth.redirectAfterLogin.mockResolvedValueOnce(undefined);
 await c.continuarCadastroCriado();
 expect(auth.signUpWithPassword).toHaveBeenCalledTimes(1);
 expect(auth.redirectAfterLogin).toHaveBeenCalledTimes(3);
 f.destroy();
});
it('continues using the actual checked consent even when localStorage writes are blocked',async()=>{
 const f=TestBed.createComponent(Login);f.detectChanges();await f.whenStable();
 const c=f.componentInstance;c.isSignupMode=true;c.email='test@example.com';
 c.password='ValidPassword123';c.termsAccepted=true;
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Private mode');});
 await c.submitEmail();c.form.nome='Studio';c.form.slug='studio';
 await c.finalizarOnboarding();
 expect(auth.signUpWithPassword).toHaveBeenCalledWith('test@example.com','ValidPassword123',
   {termsAccepted:true,marketingConsent:false});
 storage.mockRestore();f.destroy();
});
