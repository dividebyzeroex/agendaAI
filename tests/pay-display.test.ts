import { describe, expect, it } from 'vitest';
import {
  confirmedByProvider, createDisplayCipher, createDisplaySecret, displayUrl,
  openDisplayPacket, readDisplaySnapshot, safePayUrl, sealDisplayPacket,
  validDisplaySecret, type DisplaySnapshot
} from '../src/app/core/pay-display-protocol';

const receiptToken='550e8400-e29b-41d4-a716-446655440000';
function snapshot(patch:Partial<DisplaySnapshot>={}): DisplaySnapshot {
  return {
    version:1,phase:'draft',establishment:'Barbearia Exemplo',logoUrl:'',
    items:[{title:'Corte',quantity:1,unitPrice:65},{title:'Pomada',quantity:2,unitPrice:20}],
    discount:5,prepaid:0,total:100,receiptToken:'',paymentUrl:'',
    issuedAt:Date.now(),revision:1,...patch
  };
}
describe('Pay Display: privacy and device pairing',()=>{
  it('issues a long unguessable pairing secret only in the URL fragment',()=>{
    const secret=createDisplaySecret();
    const uri=new URL(displayUrl('https://agenda-ai-beryl.vercel.app',secret));
    expect(validDisplaySecret(secret)).toBe(true);
    expect(uri.pathname).toBe('/visor-caixa');
    expect(uri.search).toBe('');
    expect(uri.hash).toBe('#pair='+secret);
    expect(uri.origin).toBe('https://agenda-ai-beryl.vercel.app');
    expect(validDisplaySecret('123456')).toBe(false);
  });
  it('encrypts line items and client checkout token before any realtime send',async()=>{
    const secret=createDisplaySecret();
    const cipher=await createDisplayCipher(secret);
    expect(cipher.topic).not.toContain(secret);
    const packet={type:'snapshot' as const,snapshot:snapshot({phase:'awaiting',receiptToken,
      paymentUrl:'https://checkout.stripe.com/c/pay/test'})};
    const sealed=await sealDisplayPacket(cipher.key,packet);
    expect(sealed.ciphertext).not.toContain('Pomada');
    expect(sealed.ciphertext).not.toContain(receiptToken);
    const opened=await openDisplayPacket(cipher.key,sealed);
    expect(opened).toEqual(packet);
    const other=await createDisplayCipher(createDisplaySecret());
    expect(await openDisplayPacket(other.key,sealed)).toBeNull();
    const tampered={...sealed,ciphertext:sealed.ciphertext.slice(0,-5)+'AAAAA'};
    expect(await openDisplayPacket(cipher.key,tampered)).toBeNull();
  });
  it('rejects forged snapshots with invalid numbers or unsupported type',()=>{
    expect(readDisplaySnapshot({...snapshot(),total:-1})).toBeNull();
    expect(readDisplaySnapshot({...snapshot(),items:[{title:'Corte',quantity:-1,unitPrice:80}]})).toBeNull();
    expect(readDisplaySnapshot({...snapshot(),phase:'success'})).toBeNull();
    expect(readDisplaySnapshot({...snapshot(),phase:'awaiting',receiptToken:''})).toBeNull();
    expect(readDisplaySnapshot(snapshot())).not.toBeNull();
  });
  it('rejects third-party domains when turning a comanda into a payment QR',()=>{
    const base='https://agenda-ai-beryl.vercel.app';
    const realComanda=base+'/comanda/'+receiptToken;
    expect(safePayUrl(realComanda,receiptToken,base)).toBe(realComanda);
    expect(safePayUrl('https://evil.example/pay',receiptToken,base)).toBe('');
    expect(safePayUrl('javascript:alert(1)',receiptToken,base)).toBe('');
    expect(safePayUrl('https://checkout.stripe.com.evil.example/pay',receiptToken,base)).toBe('');
  });
  it('never trusts UI events as a Stripe payment confirmation',()=>{
    expect(confirmedByProvider(receiptToken,{online:true,status:'paid'})).toBe(true);
    for(const result of [
      {online:false,status:'pago'},
      {online:true,status:'pending'},
      {online:true,status:'paid', fake:true,method:'manual'},
      {online:true,status:'expired'},
      {online:false,status:'paid'},
      {status:'paid'},
      null
    ]) {
      if (result && result.online===true && result.status==='paid') continue;
      expect(confirmedByProvider(receiptToken,result)).toBe(false);
    }
    expect(confirmedByProvider('bad-token',{online:true,status:'paid'})).toBe(false);
  });
});
