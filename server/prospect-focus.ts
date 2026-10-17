// Temporary acquisition policy. Existing customers continue receiving assistance.
export const PROSPECT_FOCUS = {
 id: 'small-barbershop-v1',
 label: 'Barbearias independentes, uma unidade, de 1 a 5 profissionais',
 marker: '[icp:small-barbershop-v1]',
} as const;
export function acquisitionInFocus(p: {segment?:string|null;qualification_note?:string|null;status?:string}) {
 if (p.status === 'trial' || p.status === 'won') return true;
 return p.segment?.trim().toLowerCase() === 'barbearia'
  && !!p.qualification_note?.startsWith(PROSPECT_FOCUS.marker);
}
export function discoveryQuery(day: string, locations = '') {
 const regions = locations.split(';').map(s=>s.trim()).filter(Boolean).slice(0,30);
 const defaults = ['São Paulo SP', 'Caçapava SP'];
 const pool = regions.length ? regions : defaults;
 const index = Math.floor(Date.parse(day+'T00:00:00Z')/86400000) % pool.length;
 return `barbearias pequenas independentes em ${pool[index]}`;
}
export function discoveryCandidate(p: {displayName?:{text:string};types?:string[];businessStatus?:string}) {
 return !!p.displayName?.text && p.types?.includes('barber_shop') === true
  && p.businessStatus === 'OPERATIONAL'
  && !/\b(franquias?|franchis\w*|rede de barbearias)\b/i.test(p.displayName.text);
}
