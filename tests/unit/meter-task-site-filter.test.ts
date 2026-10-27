import {describe,it,expect} from 'vitest';
import {meterSiteTaskOptions,filterMeterTasksBySite,sortMeterTasks,type MeterAction} from '../../src/lib/meter-actions';
import {filteredMeterActionCsv} from '../../src/lib/meter-action-export';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';

const rows=[
 {stayId:'stay-old',siteId:'site-a',siteLabel:'Space 2',period:{startsOn:'2026-10-01',endsOn:'2026-10-12'},customerId:'private-old'},
 {stayId:'stay-new',siteId:'site-a',siteLabel:'Space 2',period:{startsOn:'2026-10-12',endsOn:'2026-11-01'},customerId:'private-new'},
 {stayId:'stay-other',siteId:'site-b',siteLabel:'Space 10',period:{startsOn:'2026-10-01',endsOn:'2026-11-01'},customerId:'private-other'},
 {stayId:'stay-same-label',siteId:'site-c',siteLabel:'Space 2',period:{startsOn:'2026-10-01',endsOn:'2026-11-01'},customerId:'private-same-label'},
] as MonthlyRunRow[];
const tasks:MeterAction[]=[
 {key:'stay-other:water boundary readings:0',siteLabel:'Space 10',utility:'water',kind:'review',detail:'closing reading 2026-11-01: requires accepted review'},
 {key:'stay-old:electric boundary readings:0',siteLabel:'Space 2',utility:'electric',kind:'capture',detail:'opening reading 2026-10-01: missing capture'},
 {key:'stay-new:gas boundary readings:0',siteLabel:'Space 2',utility:'gas',kind:'capture',detail:'closing reading 2026-11-01: missing capture'},
 {key:'stay-same-label:water boundary readings:0',siteLabel:'Space 2',utility:'water',kind:'inspect',detail:'Meter evidence unavailable'},
];

describe('site-scoped monthly meter worklist',()=>{
 it('groups two stays from one physical site and treats distinct sites with equal labels separately',()=>{
  expect(meterSiteTaskOptions(tasks,rows)).toEqual([
   {siteId:'site-a',label:'Space 2',count:2},
   {siteId:'site-c',label:'Space 2',count:1},
   {siteId:'site-b',label:'Space 10',count:1},
  ]);
  expect(filterMeterTasksBySite(tasks,rows,'site-a').map(task=>task.key)).toEqual([
   'stay-old:electric boundary readings:0','stay-new:gas boundary readings:0',
  ]);
 });
 it('includes all tasks without changing source data when site filter is reset',()=>{
  const all=filterMeterTasksBySite(tasks,rows,'all');
  expect(all).toEqual(tasks);
  expect(all).not.toBe(tasks);
  expect(filterMeterTasksBySite(tasks,rows,'site-not-present')).toEqual([]);
  expect(tasks[0].siteLabel).toBe('Space 10');
 });
 it('respects prior utility/action filtering and never adds other sites to the worklist',()=>{
  const captures=tasks.filter(task=>task.kind==='capture');
  expect(meterSiteTaskOptions(captures,rows)).toEqual([{siteId:'site-a',label:'Space 2',count:2}]);
  expect(filterMeterTasksBySite(captures,rows,'site-a')).toHaveLength(2);
 });
 it('exports only the selected site rows in exactly the on-screen order, without private customer IDs',()=>{
  const displayed=sortMeterTasks(filterMeterTasksBySite(tasks,rows,'site-a'),'boundary');
  const csv=filteredMeterActionCsv('Test Park','2026-10',displayed,rows);
  expect(csv).toContain('Space 2');
  expect(csv).not.toContain('Space 10');
  expect(csv).not.toContain('Meter evidence unavailable');
  expect(csv).not.toContain('private-old');
  expect(csv).not.toContain('private-new');
  expect(csv.indexOf('2026-10-01')).toBeLessThan(csv.indexOf('2026-11-01'));
 });
 it('ignores actions without a matching stay for site options',()=>{
  const unknown:MeterAction={key:'unknown:water:0',siteLabel:'Phantom',utility:'water',kind:'inspect',detail:'unknown'};
  expect(meterSiteTaskOptions([unknown],rows)).toEqual([]);
  expect(filterMeterTasksBySite([unknown],rows,'site-a')).toEqual([]);
 });
});
