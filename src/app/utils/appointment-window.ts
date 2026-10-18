import { agendaDay } from './agenda-day';
export function appointmentWindow(day: string, time: string, duration: number) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !Number.isFinite(duration) ||
    duration < 1 ||
    duration > 1440
  )
    return null;
  const start = new Date(`${day}T${time}:00-03:00`);
  if (Number.isNaN(start.getTime()) || agendaDay(start) !== day) return null;
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + duration * 60000).toISOString(),
  };
}
export function appointmentTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '09:00'
    : new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
}
