// @vitest-environment jsdom
import '@angular/compiler';
import {readFileSync,globSync} from 'node:fs';
import {CommonModule} from '@angular/common';
import {Component,ɵresolveComponentResources} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {BrowserTestingModule,platformBrowserTesting} from '@angular/platform-browser/testing';
import {provideRouter,Router,RouterModule} from '@angular/router';
import {of} from 'rxjs';
import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {PlatformLayout} from '../src/app/layouts/platform-layout/platform-layout';
import {SupportWidget} from '../src/app/components/support-widget/support-widget';
import {AuthService} from '../src/app/services/auth.service';
import {routes} from '../src/app/app.routes';
@Component({selector:'app-support-widget',standalone:true,template:''})class SupportStub{}
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
beforeEach(async()=>{
 await ɵresolveComponentResources(url=>Promise.resolve(readFileSync(globSync('src/app/**/'+url.replace(/^\.\//,''))[0],'utf8')));
 Object.defineProperty(window,'innerWidth',{value:1200,writable:true,configurable:true});
 TestBed.resetTestingModule();
 TestBed.configureTestingModule({imports:[PlatformLayout],providers:[provideRouter([]),{provide:AuthService,useValue:{profile$:of(null)}}]});
 TestBed.overrideComponent(PlatformLayout,{set:{template:readFileSync('src/app/layouts/platform-layout/platform-layout.html','utf8').replace('[owner]="true"',''),styles:[],styleUrls:[],imports:[CommonModule,RouterModule,SupportStub]}});
});
describe('Owner primary menu',()=>{
 it('renders six direct links to existing protected destinations without intercepting navigation',()=>{
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const links=[...fixture.nativeElement.querySelectorAll('.nav-menu a')] as HTMLAnchorElement[];
  expect(links).toHaveLength(6);
  const owner=routes.find(r=>r.path==='platform-admin')!;expect(owner.canActivate?.length).toBeGreaterThan(0);
  for(const link of links){
   const path=link.getAttribute('href')!;expect(path).toMatch(/^\/platform-admin\//);expect(owner.children!.some(r=>r.path===path.split('/').pop()&&r.loadComponent)).toBe(true);
   const click=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});
   // Observe default prevention before stopping jsdom's unsupported document navigation.
   let intercepted=true;const stop=(event:Event)=>{intercepted=event.defaultPrevented;event.preventDefault();};
   document.addEventListener('click',stop,{once:true});document.body.append(fixture.nativeElement);link.dispatchEvent(click);expect(intercepted).toBe(false);
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

});
