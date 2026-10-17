import {describe,it,expect,vi} from 'vitest';
import {canSubmitCashPayment, requiresReceivedPaymentConfirmation} from '../src/app/core/helpers/cash-payment-confirmation';
import {connectHandler} from '../server/connect.js';

describe('Cashier cannot mark unpaid external payments as settled',()=>{
  it('can generate an unpaid Stripe charge without asserting the customer paid',()=>{
    expect(canSubmitCashPayment('online',false)).toBe(true);
    expect(requiresReceivedPaymentConfirmation('online')).toBe(false);
  });
  it('requires staff confirmation for cash, Pix and terminal payments',()=>{
    for(const method of ['pix','dinheiro','cartao_credito','cartao_debito']){
      expect(requiresReceivedPaymentConfirmation(method)).toBe(true);
      expect(canSubmitCashPayment(method,false)).toBe(false);
      expect(canSubmitCashPayment(method,true)).toBe(true);
    }
    expect(canSubmitCashPayment('',true)).toBe(false);
    expect(canSubmitCashPayment('unknown',true)).toBe(false);
  });
});

function publicReceiptDb(status='pago'){
  const receipt={
    id:'550e8400-e29b-41d4-a716-446655440000',
    token_publico:'650e8400-e29b-41d4-a716-446655440000',
    status_caixa:status,
    forma_pagamento:'cartao_credito',
    pago_em:'2026-10-17T19:13:27.000Z'
  };
  const db:any={from:(table:string)=>({
    select(){return this;},
    eq(){return this;},
    maybeSingle:vi.fn().mockResolvedValue({data:table==='caixa_itens'?receipt:null,error:null})
  })};
  return db;
}
function mockResponse(){
  const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),
    setHeader:vi.fn().mockReturnThis()};
  return res;
}
const token='650e8400-e29b-41d4-a716-446655440000';

describe('Public receipt distinguishes staff-entered payment from Stripe settlement',()=>{
  it('shows recorded method and time for offline receipt, without calling Stripe',async()=>{
    const res=mockResponse();
    await connectHandler({method:'GET',query:{action:'connect-receipt',token}} as any,
      res,publicReceiptDb() as any,{} as any);
    expect(res.json).toHaveBeenCalledWith({
      online:false,status:'pago',paymentMethod:'cartao_credito',
      paidAt:'2026-10-17T19:13:27.000Z',source:'merchant_recorded'});
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
  });
  it('rejects a checkout for a receipt recorded as already paid externally',async()=>{
    const res=mockResponse();
    await expect(connectHandler({method:'POST',query:{action:'connect-pay'},body:{token}} as any,
      res,publicReceiptDb() as any,{} as any)).rejects.toMatchObject({status:409});
  });
  it('does not invent payment for a pending offline receipt',async()=>{
    const res=mockResponse();
    await connectHandler({method:'GET',query:{action:'connect-receipt',token}} as any,
      res,publicReceiptDb('pendente') as any,{} as any);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({online:false,status:'pendente'}));
  });
});
