import {afterEach,describe,expect,it,vi} from 'vitest';
import {acquisitionInFocus,discoveryCandidate,discoveryQuery,PROSPECT_FOCUS} from '../server/prospect-focus.js';
import {discoverBusinesses} from '../server/discovery.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Temporary small independent barbershop focus',()=>{
 it('requires confirmed size evidence for acquisition, including legacy barber records',()=>{
  expect(acquisitionInFocus({segment:'barbearia',status:'contacted'})).toBe(false);
  expect(acquisitionInFocus({segment:'barbearia',qualification_note:'Porte pendente'})).toBe(false);
  expect(acquisitionInFocus({segment:'barbearia',qualification_note:PROSPECT_FOCUS.marker+' 2 profissionais; uma unidade; fonte verificada'})).toBe(true);
  for(const segment of ['salao','estetica','petshop','beleza']) expect(acquisitionInFocus({segment,qualification_note:PROSPECT_FOCUS.marker})).toBe(false);
 });
 it('preserves customer onboarding and retention across segments',()=>{
  for(const status of ['trial','won'])expect(acquisitionInFocus({segment:'petshop',status})).toBe(true);
 });
 it('rotates locations without allowing an obsolete generic segment query',()=>{
  expect(discoveryQuery('2026-10-15','Caçapava SP')).toBe('barbearias pequenas independentes em Caçapava SP');
  expect(discoveryQuery('2026-10-15')).not.toBe(discoveryQuery('2026-10-16'));
 });
 it('rejects wrong categories, closed shops and explicit franchise names without guessing size',()=>{
  const p={displayName:{text:'Barbearia do bairro'},types:['barber_shop'],businessStatus:'OPERATIONAL'};
  expect(discoveryCandidate(p)).toBe(true);
  expect(discoveryCandidate({...p,types:['beauty_salon']})).toBe(false);
  expect(discoveryCandidate({...p,businessStatus:'CLOSED_PERMANENTLY'})).toBe(false);
  expect(discoveryCandidate({...p,displayName:{text:'Franquia Barber'}})).toBe(false);
 });
 it('persists only barber candidates, pending size confirmation, with strict provider filtering',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','fixture');vi.stubEnv('COMMERCIAL_SEARCH_QUERY','salões e petshops');
  const writes:any[]=[];
  const db={from:(table:string)=>{
   const q:any={select:()=>q,eq:()=>q,gte:()=>Promise.resolve({count:0,error:null}),
    insert:async(row:any)=>{writes.push({table,row});return {error:null};},
    upsert:(row:any)=>{writes.push({table,row});return {select:async()=>({data:[{id:'fixture'}],error:null})};}};
   return q;
  }};
  const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({places:[
   {id:'barber',displayName:{text:'Barbearia local'},types:['barber_shop'],businessStatus:'OPERATIONAL'},
   {id:'salon',displayName:{text:'Salão local'},types:['beauty_salon'],businessStatus:'OPERATIONAL'}]})});
  vi.stubGlobal('fetch',request);
  expect(await discoverBusinesses(db as any)).toEqual({status:'completed',discovered:1});
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body).toMatchObject({includedType:'barber_shop',strictTypeFiltering:true});
  expect(body.textQuery).not.toContain('petshops');
  const saved=writes.filter(w=>w.table==='commercial_prospects');expect(saved).toHaveLength(1);
  expect(saved[0].row).toMatchObject({segment:'barbearia',status:'new'});
  expect(acquisitionInFocus(saved[0].row)).toBe(false);
 });
});
