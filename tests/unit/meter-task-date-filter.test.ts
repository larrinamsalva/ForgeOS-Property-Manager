import {describe,it,expect} from 'vitest';
import {filterMeterTasksByDate,sortMeterTasks,type MeterAction} from '../../src/lib/meter-actions';
import {filteredMeterActionCsv} from '../../src/lib/meter-action-export';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';

const tasks:MeterAction[]=[
 {key:'past:water:0',siteLabel:'Space 2',utility:'water',kind:'capture',detail:'opening reading 2026-10-25: missing capture'},
 {key:'now:electric:0',siteLabel:'Space 4',utility:'electric',kind:'review',detail:'closing reading 2026-10-26: requires accepted review'},
 {key:'future:gas:0',siteLabel:'Space 9',utility:'gas',kind:'capture',detail:'closing reading 2026-11-01: missing capture'},
 {key:'unknown:water:0',siteLabel:'Space 10',utility:'water',kind:'inspect',detail:'Meter evidence unavailable; refresh before calculating'},
];
const today='2026-10-26';

describe('meter worklist boundary-date filters',()=>{
 it('selects before, today, after and undated tasks without dropping other groups',()=>{
  expect(filterMeterTasksByDate(tasks,'before',today).map(t=>t.key)).toEqual(['past:water:0']);
  expect(filterMeterTasksByDate(tasks,'today',today).map(t=>t.key)).toEqual(['now:electric:0']);
  expect(filterMeterTasksByDate(tasks,'after',today).map(t=>t.key)).toEqual(['future:gas:0']);
  expect(filterMeterTasksByDate(tasks,'undated',today).map(t=>t.key)).toEqual(['unknown:water:0']);
  expect(filterMeterTasksByDate(tasks,'all',today)).toEqual(tasks);
 });
 it('preserves source tasks and can sort filtered results',()=>{
  const copy=filterMeterTasksByDate(tasks,'all',today);
  expect(copy).not.toBe(tasks);
  expect(sortMeterTasks(copy,'site').map(t=>t.siteLabel)).toEqual(['Space 2','Space 4','Space 9','Space 10']);
  expect(tasks.map(t=>t.key)).toEqual(['past:water:0','now:electric:0','future:gas:0','unknown:water:0']);
 });
 it('exports exactly the selected date-window tasks and excludes private customer data',()=>{
  const chosen=filterMeterTasksByDate(tasks,'today',today);
  const rows=[{stayId:'now',customerId:'secret-customer',period:{startsOn:'2026-10-01',endsOn:'2026-11-01'}}] as MonthlyRunRow[];
  const csv=filteredMeterActionCsv('Test Park','2026-10',chosen,rows);
  expect(csv).toContain('Space 4');
  expect(csv).toContain('2026-10-26');
  expect(csv).not.toContain('Space 2');
  expect(csv).not.toContain('Space 9');
  expect(csv).not.toContain('secret-customer');
 });
 it('does not treat unknown evidence as before or after the date',()=>{
  expect(filterMeterTasksByDate([tasks[3]],'before',today)).toHaveLength(0);
  expect(filterMeterTasksByDate([tasks[3]],'after',today)).toHaveLength(0);
 });
});
