// @vitest-environment jsdom
import '@angular/compiler';
import {readFileSync,globSync} from 'node:fs';
import {CommonModule} from '@angular/common';
import {Component,inject,ɵresolveComponentResources} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {provideRouter,Router,RouterModule,RouterOutlet,ActivatedRoute} from '@angular/router';
import {of} from 'rxjs';
import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {PlatformLayout} from '../src/app/layouts/platform-layout/platform-layout';
import {SupportWidget} from '../src/app/components/support-widget/support-widget';
import {AuthService} from '../src/app/services/auth.service';
import {routes} from '../src/app/app.routes';
@Component({standalone:true,imports:[RouterOutlet],template:'<router-outlet></router-outlet>'})class RootHarness{}
@Component({standalone:true,template:'<h1 data-testid="route-page">{{route.snapshot.data["label"]}}</h1>'})class RoutePage{route=inject(ActivatedRoute);}
@Component({selector:'app-support-widget',standalone:true,template:''})class SupportStub{}
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
beforeEach(async()=>{
 await ɵresolveComponentResources(url=>Promise.resolve(readFileSync(globSync('src/app/**/'+url.replace(/^\.\//,''))[0],'utf8')));
 Object.defineProperty(window,'innerWidth',{value:1200,writable:true,configurable:true});
 TestBed.resetTestingModule();
 TestBed.configureTestingModule({imports:[PlatformLayout,RootHarness],providers:[provideRouter([{path:'platform-admin',component:PlatformLayout,children:[{path:'dashboard',component:RoutePage,data:{label:'Visão geral'}},{path:'control',component:RoutePage,data:{label:'Gestão e ativação'}},{path:'tenants',component:RoutePage,data:{label:'Estabelecimentos'}},{path:'growth',component:RoutePage,data:{label:'Oportunidades'}},{path:'billing',component:RoutePage,data:{label:'Financeiro'}},{path:'settings',component:RoutePage,data:{label:'Configurações'}}]}]),{provide:AuthService,useValue:{profile$:of(null)}}]});
 TestBed.overrideComponent(PlatformLayout,{set:{template:readFileSync('src/app/layouts/platform-layout/platform-layout.html','utf8').replace('[owner]="true"',''),styles:[],styleUrls:[],imports:[CommonModule,RouterModule,SupportStub]}});
});
describe('Owner primary menu',()=>{
 it('renders six links to existing protected destinations',()=>{
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const links=[...fixture.nativeElement.querySelectorAll('.nav-menu a')] as HTMLAnchorElement[];
  expect(links).toHaveLength(6);
  const owner=routes.find(r=>r.path==='platform-admin')!;expect(owner.canActivate?.length).toBeGreaterThan(0);
  for(const link of links){
   const path=link.getAttribute('href')!;expect(path).toMatch(/^\/platform-admin\//);expect(owner.children!.some(r=>r.path===path.split('/').pop()&&r.loadComponent)).toBe(true);

  }
  fixture.destroy();
 });
 it('marks only the current page active, including checkout return query parameters',async()=>{
  const router=TestBed.inject(Router);Object.defineProperty(router,'url',{get:()=>'/platform-admin/billing?owner_test_session=cs_fixture'});
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const active=fixture.nativeElement.querySelectorAll('.nav-menu a[aria-current="page"]');expect(active).toHaveLength(1);expect(active[0].getAttribute('href')).toBe('/platform-admin/billing');expect(active[0].classList.contains('active')).toBe(true);fixture.destroy();
 });
 it('opens and closes the mobile drawer while managing focus and background access',async()=>{
  window.innerWidth=375;
  const fixture=TestBed.createComponent(PlatformLayout);document.body.append(fixture.nativeElement);fixture.detectChanges();
  const aside=fixture.nativeElement.querySelector('#owner-menu');expect(aside.hasAttribute('inert')).toBe(true);
  const opener=fixture.nativeElement.querySelector('.mobile-hamburger') as HTMLButtonElement;opener.focus();opener.click();fixture.detectChanges();
  await new Promise(resolve=>setTimeout(resolve,1));
  expect(aside.hasAttribute('inert')).toBe(false);expect(opener.getAttribute('aria-expanded')).toBe('true');expect(fixture.nativeElement.querySelector('main').hasAttribute('inert')).toBe(true);expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.menu-close'));
  const close=fixture.nativeElement.querySelector('.menu-close');close.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.btn-logout'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();expect(opener.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(opener);expect(fixture.nativeElement.querySelector('main').hasAttribute('inert')).toBe(false);fixture.destroy();
 });
 it('keeps the four mobile shortcuts linked to Owner pages and exposes the complete menu',()=>{
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const shortcuts=[...fixture.nativeElement.querySelectorAll('.mobile-bottom-nav a')] as HTMLAnchorElement[];expect(shortcuts).toHaveLength(4);
  expect(shortcuts.map(a=>a.getAttribute('href'))).toEqual(['/platform-admin/dashboard','/platform-admin/tenants','/platform-admin/growth','/platform-admin/billing']);expect(fixture.nativeElement.querySelector('.mobile-bottom-nav button').getAttribute('aria-controls')).toBe('owner-menu');fixture.destroy();
 });

 it('changes the routed page for all six menu clicks and closes the mobile drawer',async()=>{
  window.innerWidth=375;
  const fixture=TestBed.createComponent(RootHarness);document.body.append(fixture.nativeElement);fixture.detectChanges();
  const router=TestBed.inject(Router);await router.navigateByUrl('/platform-admin/control');await fixture.whenStable();fixture.detectChanges();
  const menuLinks=[...fixture.nativeElement.querySelectorAll('.nav-menu a')] as HTMLAnchorElement[];
  for(const link of menuLinks){
   fixture.nativeElement.querySelector('.mobile-hamburger').click();fixture.detectChanges();
   expect(fixture.nativeElement.querySelector('#owner-menu').hasAttribute('inert')).toBe(false);
   const target=link.getAttribute('href')!;const label=link.querySelector('span')!.textContent!.trim();
   link.click();await fixture.whenStable();fixture.detectChanges();
   expect(router.url).toBe(target);expect(fixture.nativeElement.querySelector('[data-testid="route-page"]').textContent).toBe(label);expect(fixture.nativeElement.querySelector('.sidebar').classList.contains('open')).toBe(false);
  }
  fixture.destroy();
 });
 it('shows a recoverable failure when routing fails instead of silently keeping the old page',async()=>{
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const router=TestBed.inject(Router);const original=router.navigateByUrl;router.navigateByUrl=()=>Promise.reject(new Error('Chunk unavailable'));
  await fixture.componentInstance.navigate(new MouseEvent('click',{button:0,cancelable:true}),'/platform-admin/billing');fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Não foi possível carregar');expect(fixture.nativeElement.querySelector('.navigation-error a').getAttribute('href')).toBe('/platform-admin/billing');router.navigateByUrl=original;fixture.destroy();
 });

});
