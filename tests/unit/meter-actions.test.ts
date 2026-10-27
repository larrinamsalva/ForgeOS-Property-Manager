import {describe,it,expect} from 'vitest';
import {meterActions,filterMeterActionsByUtility} from '../../src/lib/meter-actions';
import type {MonthlyRunRow} from '../../src/lib/monthly-billing-run';
describe('meter action counts',()=>{
 it('limits the displayed action list to the selected utility without changing the original list',()=>{
  const actions=[{key:'1',siteLabel:'Site 1',utility:'water',kind:'capture' as const,detail:'Missing'},{key:'2',siteLabel:'Site 2',utility:'electric',kind:'review' as const,detail:'Review'}];
  expect(filterMeterActionsByUtility(actions,'water').map(item=>item.key)).toEqual(['1']);
  expect(filterMeterActionsByUtility(actions,'all')).toEqual(actions);
  expect(actions).toHaveLength(2);
 });
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