import {describe,it,expect} from 'vitest';
import {sortMeterTasks,meterTaskBoundaryDate,type MeterAction} from '../../src/lib/meter-actions';
import {filteredMeterActionCsv} from '../../src/lib/meter-action-export';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';
const actions:MeterAction[]=[
 {key:'s10:water:1',siteLabel:'Space 10',utility:'water',kind:'review',detail:'closing reading 2026-11-01: requires accepted review'},
 {key:'s2:gas:1',siteLabel:'Space 2',utility:'gas',kind:'capture',detail:'opening reading 2026-10-01: missing capture'},
 {key:'s10:electric:1',siteLabel:'Space 10',utility:'electric',kind:'inspect',detail:'Meter evidence unavailable'},
];
describe('meter task ordering',()=>{
 it('sorts naturally by site number without mutating source tasks',()=>{
  const ordered=sortMeterTasks(actions,'site');
  expect(ordered.map(a=>a.key)).toEqual(['s2:gas:1','s10:electric:1','s10:water:1']);
  expect(actions[0].key).toBe('s10:water:1');
 });
 it('puts known boundary dates first and unknown evidence last',()=>{
  expect(sortMeterTasks(actions,'boundary').map(a=>a.key)).toEqual(['s2:gas:1','s10:water:1','s10:electric:1']);
  expect(meterTaskBoundaryDate(actions[2])).toBeUndefined();
 });
 it('sorts by utility and action with stable tie breaks',()=>{
  expect(sortMeterTasks(actions,'utility').map(a=>a.utility)).toEqual(['electric','gas','water']);
  expect(sortMeterTasks(actions,'action').map(a=>a.kind)).toEqual(['capture','inspect','review']);
 });
 it('keeps CSV order identical to the displayed, sorted meter task list without private IDs',()=>{
  const sorted=sortMeterTasks(actions,'site');
  const rows=[{stayId:'s2',period:{startsOn:'2026-10-01',endsOn:'2026-11-01'}},
    {stayId:'s10',period:{startsOn:'2026-10-01',endsOn:'2026-11-01'}}] as MonthlyRunRow[];
  const csv=filteredMeterActionCsv('Park','2026-10',sorted,rows);
  expect(csv.indexOf('Space 2')).toBeLessThan(csv.indexOf('Space 10'));
  expect(csv).not.toContain('s10:water:1');
 });
});
