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
