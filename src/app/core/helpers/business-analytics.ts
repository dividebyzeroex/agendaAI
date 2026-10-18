export interface ActivityEvent {
  start: string;
  status?: string;
  cliente_id?: string | null;
  profissional_id?: string | null;
  profissional_nome?: string | null;
}
const businessTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function activitySummary(events: ActivityEvent[]) {
  const heat = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    counts: Array<number>(7).fill(0),
  }));
  const people = new Map<
    string,
    { name: string; scheduled: number; completed: number; noShows: number; cancelled: number }
  >();
  const visits = new Map<string, number>();
  let completed = 0,
    noShows = 0,
    cancelled = 0,
    scheduled = 0;
  for (const event of events) {
    const date = new Date(event.start);
    if (!Number.isFinite(date.getTime())) continue;
    const parts = businessTime.formatToParts(date);
    const day = weekdays.indexOf(parts.find((p) => p.type === 'weekday')!.value);
    const hour = Number(parts.find((p) => p.type === 'hour')!.value);
    const key = event.profissional_id || 'unassigned';
    const person = people.get(key) || {
      name: event.profissional_nome || 'Sem profissional identificado',
      scheduled: 0,
      completed: 0,
      noShows: 0,
      cancelled: 0,
    };
    if (event.status === 'cancelado') {
      cancelled++;
      person.cancelled++;
    } else {
      scheduled++;
      person.scheduled++;
      if (event.status === 'noshow') {
        noShows++;
        person.noShows++;
      } else if (day >= 0 && hour >= 0 && hour < 24) heat[hour].counts[day]++;
      if (event.status === 'concluido') {
        completed++;
        person.completed++;
        if (event.cliente_id) visits.set(event.cliente_id, (visits.get(event.cliente_id) || 0) + 1);
      }
    }
    people.set(key, person);
  }
  const max = Math.max(0, ...heat.flatMap((row) => row.counts));
  // Retain the span between the first and last recorded hour, including quiet gaps.
  const used = heat.filter((row) => row.counts.some(Boolean));
  const visible = used.length ? heat.slice(used[0].hour, used[used.length - 1].hour + 1) : [];
  const returning = [...visits.values()].filter((count) => count > 1).length;
  return {
    heat: visible,
    max,
    completed,
    noShows,
    cancelled,
    scheduled,
    clientsServed: visits.size,
    returning,
    returnRate: visits.size ? (returning / visits.size) * 100 : 0,
    noShowRate: completed + noShows ? (noShows / (completed + noShows)) * 100 : 0,
    professionals: [...people.values()].sort((a, b) => b.completed - a.completed),
  };
}
export function receivedSummary(
  items: Array<{
    valor_total: unknown;
    connect_orders?: { refunded_cents?: unknown } | Array<{ refunded_cents?: unknown }> | null;
  }>,
) {
  const total =
    items.reduce((sum, item) => {
      const order = Array.isArray(item.connect_orders)
        ? item.connect_orders[0]
        : item.connect_orders;
      return (
        sum +
        Math.max(
          0,
          Math.round(Number(item.valor_total || 0) * 100) - Number(order?.refunded_cents || 0),
        )
      );
    }, 0) / 100;
  return { total, ticket: items.length ? total / items.length : 0, count: items.length };
}
/** Neutralize formula-like spreadsheet text without changing ordinary numbers. */
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
