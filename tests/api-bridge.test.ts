import {describe, it, expect} from 'vitest';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import bridge from '../api/bridge.js';

const endpoints: Record<string, string> = {
  '/api/ping': 'ping',
  '/api/hotmart-activate': 'hotmart-activate',
  '/api/public-booking': 'public-booking',
  '/api/respond-appointment': 'respond-appointment',
  '/api/send-comanda': 'send-comanda',
  '/api/trigger-workflow': 'trigger-workflow',
  '/api/sms/send': 'sms-send',
  '/api/cron/bot-recepcao': 'bot-recepcao',
};
const apiDir = join(process.cwd(), 'api');

function files(dir: string): string[] {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path)
      : entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

async function invoke(route: string, method = 'GET') {
  let status = 200;
  let payload: any = null;
  const response = {
    setHeader() {return this;},
    status(code: number) {status = code; return this;},
    json(data: unknown) {payload = data; return this;},
    send(data: unknown) {payload = data; return this;},
    end() {return this;}
  };
  await bridge({method,query:{__handler:route},body:{},headers:{}} as any,response as any);
  return {status,payload};
}

describe('Vercel Hobby routing budget', () => {
  const config = JSON.parse(readFileSync('vercel.json','utf8'));
  it('keeps the total number of serverless entrypoints at or below the Hobby limit', () => {
    expect(files(apiDir).length).toBeLessThanOrEqual(12);
  });
  it('forwards all historical endpoint URLs to the consolidated bridge', () => {
    for (const [path, id] of Object.entries(endpoints)) {
      expect(config.rewrites).toContainEqual({source:path,destination:'/api/bridge?__handler='+id});
      expect(existsSync(join(process.cwd(), path.slice(1)+'.ts'))).toBe(false);
    }
  });
  it('preserves all original method constraints', async () => {
    expect((await invoke('hotmart-activate','GET')).status).toBe(405);
    expect((await invoke('public-booking','GET')).status).toBe(405);
    expect((await invoke('send-comanda','GET')).status).toBe(405);
    expect((await invoke('trigger-workflow','GET')).status).toBe(405);
    expect((await invoke('sms-send','GET')).status).toBe(405);
    expect((await invoke('bot-recepcao','POST')).status).toBe(405);
    expect((await invoke('respond-appointment','PATCH')).status).toBe(405);
  });
  it('still serves the health endpoint and rejects unknown routes', async () => {
    const health = await invoke('ping');
    expect(health.status).toBe(200);
    expect(health.payload?.status).toBe('ok');
    expect((await invoke('unknown')).status).toBe(404);
  });
});
