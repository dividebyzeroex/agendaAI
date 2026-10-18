import {describe,it,expect} from 'vitest';
import {agendaDay,shiftAgendaDay} from '../src/app/utils/agenda-day';
describe('agenda daily navigation in São Paulo',()=>{
 it('keeps evening appointments on the previous local day instead of UTC',()=>{expect(agendaDay('2026-10-11T01:30:00Z')).toBe('2026-10-10');});
 it('preserves date-only values and rejects invalid timestamps',()=>{expect(agendaDay('2026-10-10')).toBe('2026-10-10');expect(agendaDay('invalid')).toBe('');});
 it('navigates across month and year boundaries',()=>{expect(shiftAgendaDay('2026-12-31',1)).toBe('2027-01-01');expect(shiftAgendaDay('2026-03-01',-1)).toBe('2026-02-28');});
});
