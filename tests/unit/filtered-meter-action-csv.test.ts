import {describe,it,expect} from 'vitest';
import {filteredMeterActionCsv} from '../../src/lib/meter-action-export';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';
import type {MeterAction} from '../../src/lib/meter-actions';
describe('filtered meter action CSV',()=>{
 it('includes only selected task rows and period without private customer details',()=>{
  const row={stayId:'stay-a',siteLabel:'Space 88',customerId:'private-customer',period:{startsOn:'2026-09-01',endsOn:'2026-10-01'}} as MonthlyRunRow;
  const tasks=[{key:'stay-a:water boundary readings:0',siteLabel:'Space 88',utility:'water',kind:'capture',detail:'opening reading 2026-09-01: missing capture'}] as MeterAction[];
  const result=filteredMeterActionCsv('Test Park','2026-09',tasks,[row]);
  expect(result).toContain('Space 88');
  expect(result).toContain('Capture reading');
  expect(result).toContain('2026-09-01');
  expect(result).not.toContain('private-customer');
  expect(result).not.toContain('Review approval');
 });
 it('exports headings only when no tasks match the filters',()=>{
  const csv=filteredMeterActionCsv('Test Park','2026-09',[],[]);
  expect(csv).toContain('Boundary date');
  expect(csv).not.toContain('Space 88');
 });
});