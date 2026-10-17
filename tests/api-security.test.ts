import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authorizeTenant, escapeHtml, isUuid } from '../server/security';
import respond from '../api/respond-appointment';
import sms from '../api/sms/send';
import cron from '../api/cron/bot-recepcao';
import { createClient } from '@supabase/supabase-js';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
function response() { const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), send: vi.fn(), end: vi.fn() }; res.status.mockReturnValue(res); return res; }
const tenant = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.clearAllMocks(); process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-only'; process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co'; });
describe('Privileged API protection', () => {
  it('rejects missing bearer credentials before database access', async () => {
    await expect(authorizeTenant({ headers: {} } as any, tenant)).rejects.toMatchObject({ status: 401 });
    expect(createClient).not.toHaveBeenCalled();
  });
  it('rejects valid identity outside target tenant', async () => {
    const q: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
    for (const method of ['select','eq','in']) q[method].mockReturnValue(q);
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'other-user' } } }) }, from: vi.fn().mockReturnValue(q) } as any);
    await expect(authorizeTenant({ headers: { authorization: 'Bearer test' } } as any, tenant)).rejects.toMatchObject({ status: 403 });
  });
  it('SMS cannot bypass authorization by omitting tenant', async () => {
    const res = response();
    await sms({ method: 'POST', headers: {}, body: { to: '+5511999999999', message: 'test' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('cron fails closed when secret absent, including development', async () => {
    delete process.env['CRON_SECRET'];
    const res = response();
    await cron({ method: 'GET', headers: { authorization: 'Bearer undefined' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('GET confirmation renders form without mutating even with action query', async () => {
    const q: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn().mockResolvedValue({ data: { id: tenant, title: '<script>alert(1)</script>', start: new Date(Date.now()+86400000).toISOString(), profissional_id: tenant, status: 'pendente' } }), update: vi.fn() };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q);
    vi.mocked(createClient).mockReturnValue({ from: vi.fn().mockReturnValue(q) } as any);
    const res = response();
    await respond({ method: 'GET', query: { token: tenant, action: 'aceitar' } } as any, res);
    expect(q.update).not.toHaveBeenCalled();
    expect(res.send.mock.calls[0][0]).toContain('method="post"');
    expect(res.send.mock.calls[0][0]).not.toContain('<script>');
  });
  it('validates token shape and escapes HTML', () => {
    expect(isUuid(['token'])).toBe(false);
    expect(isUuid(tenant)).toBe(true);
    expect(escapeHtml('<img src="x">')).toBe('&lt;img src=&quot;x&quot;&gt;');
  });
});
