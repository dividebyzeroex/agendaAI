// @vitest-environment jsdom
import '@angular/compiler';
import { afterAll, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../src/app/app.routes';
TestBed.initTestEnvironment(BrowserTestingModule,platformBrowserTesting());
afterAll(()=>TestBed.resetTestEnvironment());
it('initializes the router with every public and protected route',()=>{
 TestBed.configureTestingModule({providers:[provideRouter(routes)]});
 expect(()=>TestBed.inject(Router)).not.toThrow();
 expect(TestBed.inject(Router).config.some(r=>r.path==='platform-admin')).toBe(true);
});
