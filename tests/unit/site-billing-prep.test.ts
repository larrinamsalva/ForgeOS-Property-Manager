import { describe, it, expect } from 'vitest';
import { suggestBillingPeriod, siteBillingChecklist, coversBillingPeriod } from '../../src/lib/site-billing-prep';
import type { Site, Stay } from '../../src/lib/domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';
import type { MeterSnapshot } from '../../src/lib/meter-domain';

const site={id:'site',property_id:'property',electric:true,water:false,gas:false} as Site;
const stay={id:'stay',customer_id:'customer-88',starts_on:'2026-04-05',ends_on:null} as Stay;
const period=suggestBillingPeriod(stay,'2026-10-23');
const billing={
 policies:[{property_id:'property'}], rates:[{property_id:'property',utility:'electric',
  status:'active',starts_on:'2026-01-01',ends_on:null}], invoices:[]
} as unknown as BillingSnapshot;
const meter={
 meters:[{id:'meter',property_id:'property',utility:'electric'}],
 assignments:[{id:'assignment',meter_id:'meter',site_id:'site',property_id:'property',
  starts_at:'2026-01-01T00:00:00Z',ends_at:null}],
 readings:[
  {id:'open',meter_id:'meter',assignment_id:'assignment',value:'100'},
  {id:'close',meter_id:'meter',assignment_id:'assignment',value:'150'}
 ],
 occupancy:[
  {reading_id:'open',site_id:'site',stay_id:'stay',captured_on:'2026-09-01'},
  {reading_id:'close',site_id:'site',stay_id:'stay',captured_on:'2026-10-01'}
 ],
 reviews:[
  {id:'r1',reading_id:'open',decision:'accepted',created_at:'2026-09-01T00:00:00Z'},
  {id:'r2',reading_id:'close',decision:'accepted',created_at:'2026-10-01T00:00:00Z'}
 ]
} as unknown as MeterSnapshot;
describe('site-focused monthly billing preparation',()=>{
 it('defaults to the last completed calendar month with policy-based due date',()=>{
  expect(period).toEqual({startsOn:'2026-09-01',endsOn:'2026-10-01',dueOn:'2026-10-16',isFutureClosing:false});
 });
 it('shows future close if the resident moved in this month, not a fabricated utility bill',()=>{
  expect(suggestBillingPeriod({...stay,starts_on:'2026-10-09'},'2026-10-23')).toMatchObject({
   startsOn:'2026-10-09',endsOn:'2026-11-01',isFutureClosing:true
  });
 });
 it('includes property policy, per-utility rate, period and approved boundary evidence',()=>{
  expect(siteBillingChecklist(site,stay,period,billing,meter)
    .filter(i=>i.state==='check')).toHaveLength(0);
 });
 it('rejects previous occupant readings and unapproved close, without inventing billing totals',()=>{
  const wrong = {...meter,occupancy:meter.occupancy.map(o=>o.reading_id==='open'?
   {...o,stay_id:'former'}:o)};
  const wrongItem=siteBillingChecklist(site,stay,period,billing,wrong)
    .find(i=>i.label==='electric boundary readings');
  expect(wrongItem?.state).toBe('check');
  expect(wrongItem?.note).toContain('opening reading 2026-09-01: missing capture');
  const pending={...meter,reviews:meter.reviews.slice(0,1)};
  const pendingItem=siteBillingChecklist(site,stay,period,billing,pending)
    .find(i=>i.label==='electric boundary readings');
  expect(pendingItem?.state).toBe('check');
  expect(pendingItem?.note).toContain('closing reading 2026-10-01: requires accepted review');
 });
 it('flags rate gaps, but accepts adjacent active versions covering the whole period',()=>{
  const withRates=(rates: object[])=>({...billing,rates} as unknown as BillingSnapshot);
  const september={...period,startsOn:'2026-09-01',endsOn:'2026-10-01'};
  const partial=withRates([{property_id:'property',utility:'electric',status:'active',starts_on:'2026-09-10',ends_on:null}]);
  const gap=siteBillingChecklist(site,stay,september,partial,meter).find(i=>i.label==='electric rate schedule');
  expect(gap?.state).toBe('check');
  expect(gap?.note).toContain('gap');
  const continuous=withRates([
    {property_id:'property',utility:'electric',status:'active',starts_on:'2026-09-15',ends_on:'2026-10-01'},
    {property_id:'property',utility:'electric',status:'active',starts_on:'2026-09-01',ends_on:'2026-09-15'},
  ]);
  expect(siteBillingChecklist(site,stay,september,continuous,meter)
    .find(i=>i.label==='electric rate schedule')?.state).toBe('ok');
  expect(coversBillingPeriod([
    {starts_on:'2026-09-01',ends_on:'2026-09-12'},
    {starts_on:'2026-09-13',ends_on:'2026-10-01'},
  ],'2026-09-01','2026-10-01')).toBe(false);
 });
 it('never leaks another customer or property invoice number in preflight checklist',()=>{
  const crossed={...billing,invoices:[
   {id:'private',property_id:'property',customer_id:'former-resident',stay_id:'stay',site_id:'site',status:'approved',number:'PRIVATE-777',starts_on:'2026-09-01',ends_on:'2026-10-01'},
   {id:'other-property',property_id:'elsewhere',customer_id:'customer-88',stay_id:'stay',site_id:'site',status:'approved',number:'OTHER-888',starts_on:'2026-09-01',ends_on:'2026-10-01'},
  ]} as unknown as BillingSnapshot;
  const item=siteBillingChecklist(site,stay,period,crossed,meter).find(i=>i.label==='Existing invoices');
  expect(item?.note).not.toContain('PRIVATE-777');
  expect(item?.note).not.toContain('OTHER-888');
  expect(item?.state).toBe('ok');
 });
 it('warns of existing draft/issued overlap and missing policy',()=>{
  const data={...billing,policies:[], invoices:[{id:'invoice',property_id:'property',customer_id:'customer-88',stay_id:'stay',site_id:'site',
   status:'approved',number:'INV-0001',starts_on:'2026-09-01',ends_on:'2026-10-01'}]} as unknown as BillingSnapshot;
  const result=siteBillingChecklist(site,stay,period,data,meter);
  expect(result.find(i=>i.label==='Property billing policy')?.state).toBe('check');
  expect(result.find(i=>i.label==='Existing invoices')?.note).toContain('INV-0001');
 });
});
