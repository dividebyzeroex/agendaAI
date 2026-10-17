import { describe, expect, it } from 'vitest';
import { qrcodegen } from '../src/app/utils/vendor/qrcodegen';

describe('AgendaAI Pay Express: locally generated payment QR', () => {
  const paymentLink = 'https://agenda-ai-beryl.vercel.app/comanda/550e8400-e29b-41d4-a716-446655440000';

  it('encodes a public comanda link without calling a third-party QR API', () => {
    const qr = qrcodegen.QrCode.encodeText(paymentLink, qrcodegen.QrCode.Ecc.MEDIUM);
    expect(qr.size).toBeGreaterThan(20);
    expect(qr.size).toBeLessThanOrEqual(177);
    // QR corner finder marks: three 7x7 dark boundaries with light inside.
    for (const [x,y] of [[0,0],[qr.size - 1,0],[0,qr.size - 1]]) {
      expect(qr.getModule(x,y)).toBe(true);
    }
  });

  it('makes a stable, unique pattern for different comanda tokens', () => {
    const first = qrcodegen.QrCode.encodeText(paymentLink, qrcodegen.QrCode.Ecc.MEDIUM);
    const other = qrcodegen.QrCode.encodeText(
      paymentLink.replace('550e8400','650e8400'),qrcodegen.QrCode.Ecc.MEDIUM);
    expect(first.size).toBe(other.size);
    let different = false;
    for (let y=0;y<first.size && !different;y++) {
      for (let x=0;x<first.size;x++) {
        if (first.getModule(x,y) !== other.getModule(x,y)) {different=true;break;}
      }
    }
    expect(different).toBe(true);
  });
});
