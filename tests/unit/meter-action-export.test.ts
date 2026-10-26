import {describe,it,expect} from 'vitest';
import {meterActionCsv} from '../../src/lib/meter-action-export';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';
describe('meter action export',()=>{
 it('exports only evidence actions for provided filtered stays',()=>{
  const row={siteLabel:'Space 88',period:{startsOn:'2026-09-01',endsOn:'2026-10-01'},
   checklist:[{label:'electric boundary readings',state:'check',note:'opening reading 2026-09-01: missing capture; closing reading 2026-10-01: requires accepted review'},
    {label:'electric rate schedule',state:'check',note:'Missing rates'}]} as MonthlyRunRow;
  const result=meterActionCsv('Example Park','2026-09',[row]);
  expect(result).toContain('Capture reading');
  expect(result).toContain('Approve/review reading');
  expect(result).toContain('2026-10-01');
  expect(result).not.toContain('Missing rates');
  expect(result).not.toContain('resident');
 });
 it('does not include other site records when no filtered rows are supplied',()=>{
  expect(meterActionCsv('Park','2026-09',[])).not.toContain('Space 88');
 });
});