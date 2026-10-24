import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const nav=readFileSync(new URL('../src/app/layouts/admin-layout/admin-layout.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../server/intelligence.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/app/pages/admin-intelligence/admin-intelligence.html',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../supabase/functions/ai-chat-test/index.ts',import.meta.url),'utf8');
describe('Intelligence rollout safeguards',()=>{
 it('keeps only four daily links and puts the hub under management',()=>{
  expect(nav.split('<details class="management-nav"')[0]).not.toContain('routerLink="/admin/intelligence"');
  expect(nav).toContain('routerLink="/admin/intelligence"');
 });
 it('rejects production allowlist upgrades and invented origins',()=>{
  expect(backend).toContain("process.env['VERCEL_ENV']!=='production'");
  expect(backend).not.toContain('https://example.invalid');
  expect(backend).toContain('new URL(configuredOrigin).origin');
 });
 it('uses a stable date minimum and disables the old booking chatbot',()=>{
  expect(page).toContain('[min]="todayDate"');
  expect(legacy).toContain('status:410');
  expect(legacy).not.toContain("from('agenda_events')");
 });
});
