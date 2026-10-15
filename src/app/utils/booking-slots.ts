export interface BusyInterval { start: string; end: string; profissional_id?: string | null; }
const zone = 'America/Sao_Paulo';
export function bookingDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function bookingMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour')?.value) * 60 + Number(parts.find(p => p.type === 'minute')?.value);
}
export function slotOverlaps(date: string, time: string, duration: number, busy: BusyInterval[], professionalId?: string): boolean {
  const start = new Date(`${date}T${time}:00-03:00`).getTime();
  const end = start + duration * 60000;
  return busy.some(event => (!professionalId || !event.profissional_id || event.profissional_id === professionalId)
    && start < Date.parse(event.end) && end > Date.parse(event.start));
}

/** Starts the public calendar at a usable business day, without overriding a chosen date. */
export function nextOpeningDate(hours:ReadonlyArray<{dia_semana:number;ativo:boolean;abre:string|null;fecha:string|null}>,duration:number,now=new Date()):string {
 const today=bookingDate(now);const day=new Date(`${today}T12:00:00-03:00`);
 const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
 for(let i=0;i<14;i++){
  const h=hours.find(row=>row.dia_semana===day.getUTCDay()&&row.ativo);
  if(h?.abre&&h.fecha){const opens=minutes(h.abre),closes=minutes(h.fecha);let start=opens;if(i===0&&bookingMinutes(now)>=opens)start=opens+(Math.floor((bookingMinutes(now)-opens)/30)+1)*30;if(start+duration<=closes)return bookingDate(day);}
  day.setUTCDate(day.getUTCDate()+1);
 }
 return today;
}
