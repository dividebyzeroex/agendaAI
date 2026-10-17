export type ServiceMode = 'paralelo' | 'sequencial';
export interface ServiceChoice {
  servicoId: string;
  profissionalId: string;
  mode: ServiceMode;
}
export interface BookingSlot extends ServiceChoice {
  start: string;
  end: string;
}
export interface CatalogDuration { id: string; duracao_min: number; }
export function buildServiceSlots(
  baseStart: string, choices: ServiceChoice[], catalog: CatalogDuration[]
): BookingSlot[] {
  const startMs = Date.parse(baseStart);
  if (!Number.isFinite(startMs) || choices.length < 1 || choices.length > 8)
    throw Error('Escolha de 1 a 8 serviços e um horário válido.');
  const slots: BookingSlot[] = [];
  let previousEnd = startMs;
  for (const [index, choice] of choices.entries()) {
    const service = catalog.find(s => s.id === choice.servicoId);
    const duration = Number(service?.duracao_min);
    if (!choice.profissionalId || !choice.servicoId || !Number.isInteger(duration) ||
      duration < 5 || duration > 480)
      throw Error('Selecione um serviço e um profissional válidos para cada etapa.');
    const start = index === 0 || choice.mode === 'paralelo' ? startMs : previousEnd;
    const end = start + duration * 60000;
    if (end - startMs > 12 * 3600000)
      throw Error('A duração total ultrapassa o máximo permitido.');
    if (slots.some(s => s.profissionalId === choice.profissionalId &&
      Date.parse(s.start) < end && Date.parse(s.end) > start))
      throw Error('O mesmo profissional não pode executar dois serviços ao mesmo tempo.');
    slots.push({...choice,start:new Date(start).toISOString(),end:new Date(end).toISOString()});
    previousEnd = Math.max(previousEnd,end);
  }
  return slots;
}
export function serviceSubtotal(lines: {preco:number}[]): number {
  const cents = lines.reduce((n,line)=>{
    if (!Number.isFinite(line.preco) || line.preco < 0) throw Error('Preço inválido.');
    return n + Math.round(line.preco*100);
  },0);
  return cents/100;
}
