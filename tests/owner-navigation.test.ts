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
 TestBed.resetTestingModule();
 TestBed.configureTestingModule({imports:[PlatformLayout],providers:[provideRouter([]),{provide:AuthService,useValue:{profile$:of(null)}}]});
 TestBed.overrideComponent(PlatformLayout,{set:{template:readFileSync('src/app/layouts/platform-layout/platform-layout.html','utf8').replace('[owner]="true"',''),styles:[],styleUrls:[],imports:[CommonModule,RouterModule,SupportStub]}});
});
describe('Owner primary menu',()=>{
 it('renders six direct links to existing protected destinations without intercepting navigation',()=>{
  const fixture=TestBed.createComponent(PlatformLayout);fixture.detectChanges();
  const links=[...fixture.nativeElement.querySelectorAll('nav a')] as HTMLAnchorElement[];
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
  const active=fixture.nativeElement.querySelectorAll('nav a[aria-current="page"]');expect(active).toHaveLength(1);expect(active[0].getAttribute('href')).toBe('/platform-admin/billing');expect(active[0].classList.contains('active')).toBe(true);fixture.destroy();
 });
});
