// @vitest-environment jsdom
import '@angular/compiler';
import {TestBed} from '@angular/core/testing';
import {readFileSync,globSync} from 'node:fs';
import {ɵresolveComponentResources} from '@angular/core';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {Router,provideRouter} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
import {PrimeiroAcesso} from '../src/app/pages/primeiro-acesso/primeiro-acesso';
import {AuthService} from '../src/app/services/auth.service';
import {ProfissionaisService} from '../src/app/services/profissionais.service';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());afterAll(()=>TestBed.resetTestEnvironment());
let auth:any,staff:any,navigate:any;
beforeEach(async()=>{await ɵresolveComponentResources(url=>Promise.resolve(readFileSync(globSync('src/app/**/'+url.replace(/^\.\//,''))[0],'utf8')));TestBed.resetTestingModule();const p={id:'user',nome:'João',role:'dono',primeiro_acesso:true,onboarding_concluido:false};auth={userProfile$:new BehaviorSubject(p),userProfileValue:p,updateUserProfileLocal:vi.fn()};staff={atualizarSenha:vi.fn().mockResolvedValue(undefined),atualizarProfissional:vi.fn().mockResolvedValue(undefined),finalizarOnboarding:vi.fn().mockResolvedValue(undefined)};TestBed.configureTestingModule({imports:[PrimeiroAcesso],providers:[provideRouter([]),{provide:AuthService,useValue:auth},{provide:ProfissionaisService,useValue:staff}]});navigate=vi.spyOn(TestBed.inject(Router),'navigateByUrl').mockResolvedValue(true);});
it('keeps required credential validation and opens the application immediately after a successful save',async()=>{const f=TestBed.createComponent(PrimeiroAcesso);f.detectChanges();const c=f.componentInstance;c.pass1='Example-test-password';c.pass2='different';await c.confirmarSenha();expect(staff.atualizarSenha).not.toHaveBeenCalled();expect(c.erro).toContain('não coincidem');c.pass2=c.pass1;await c.confirmarSenha();expect(staff.atualizarSenha).toHaveBeenCalledOnce();expect(staff.finalizarOnboarding).toHaveBeenCalledOnce();expect(navigate).toHaveBeenCalledWith('/admin');expect(c.pass1).toBe('');expect(f.nativeElement.querySelector('.pa-timeline')).toBeNull();f.destroy();});
it('does not finish onboarding or navigate when the password provider rejects the save',async()=>{const f=TestBed.createComponent(PrimeiroAcesso);f.detectChanges();const c=f.componentInstance;c.pass1='Example-test-password';c.pass2=c.pass1;staff.atualizarSenha.mockRejectedValue(new Error('Senha recusada'));await c.confirmarSenha();expect(c.erro).toBe('Senha recusada');expect(staff.atualizarProfissional).not.toHaveBeenCalled();expect(staff.finalizarOnboarding).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();f.destroy();});
