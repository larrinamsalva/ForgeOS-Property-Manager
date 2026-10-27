import {describe,it,expect} from 'vitest';
import {meterActions} from '../../src/lib/meter-actions';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';
describe('meter action counts',()=>{
 it('separates missing captures, approvals and unavailable evidence on selected rows',()=>{
  const row={stayId:'s1',siteLabel:'Space 88',checklist:[
   {label:'water boundary readings',state:'check',note:'opening reading 2026-09-01: missing capture; closing reading 2026-10-01: requires accepted review'},
   {label:'electric meter readings',state:'check',note:'Meter evidence unavailable; refresh before calculating'},
   {label:'water rate schedule',state:'check',note:'Rate missing'},
  ]} as MonthlyRunRow;
  expect(meterActions([row]).map(t=>t.kind)).toEqual(['capture','review','inspect']);
  expect(meterActions([])).toEqual([]);
 });
});