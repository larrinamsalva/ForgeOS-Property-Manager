import { describe, it, expect } from 'vitest';
import { siteUtilitySummaries } from '../../src/lib/site-utility-summary';
import type { MeterSnapshot } from '../../src/lib/meter-domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';
const all = {electric:true,water:true,gas:true};
const data = {
 meters:[{id:'m1',property_id:'park',label:'Pedestal',utility:'electric',unit:'kWh',multiplier:'1.5',max_delta:null}],
 assignments:[{id:'a1',site_id:'site',meter_id:'m1',property_id:'park',ends_at:null}],
 readings:[
  {id:'r1',property_id:'park',assignment_id:'a1',meter_id:'m1',captured_at:'2026-09-01T12:00:00Z',value:'100.500000',flag:'normal',kind:'actual',exceptions:[]},
  {id:'r2',property_id:'park',assignment_id:'a1',meter_id:'m1',captured_at:'2026-10-01T12:00:00Z',value:'120.750000',flag:'normal',kind:'actual',exceptions:[]},
 ],
 reviews:[{reading_id:'r1',decision:'accepted',corrected_value:null,created_at:'2026-09-02T10:00:00Z'},
  {reading_id:'r2',decision:'accepted',corrected_value:'120.850000',created_at:'2026-10-02T10:00:00Z'}],
 occupancy:[{reading_id:'r1',site_id:'site',stay_id:'stay',customer_id:'alice'},
  {reading_id:'r2',site_id:'site',stay_id:'stay',customer_id:'alice'}],
} as unknown as MeterSnapshot;
function read(d: MeterSnapshot, stay = 'stay', billing?: BillingSnapshot) {
 return siteUtilitySummaries(d,'site',all,stay,billing)[0];
}
describe('automatic site utility usage with strict billing separation',() => {
 it('calculates 6-decimal register change times multiplier without floating-point rounding',() => {
  const e=read(data).meters[0];
  expect(e.latestApproved).toBe('120.850000');
  expect(e.previousApproved).toBe('100.500000');
  expect(e.scaledUsage).toBe('30.525');
 });
 it('never guesses unreviewed or occupant-spanning usage',() => {
  expect(read({...data,reviews:data.reviews.filter(r=>r.reading_id==='r1')}).meters[0].scaledUsage).toBeNull();
  expect(read({...data,occupancy:[{...data.occupancy[0],stay_id:'old'},data.occupancy[1]]}).meters[0].scaledUsage).toBeNull();
 });
 it('never subtracts resets, rollovers or a negative register',() => {
  expect(read({...data,readings:[data.readings[0],{...data.readings[1],value:'2',flag:'rollover'}],
    reviews:data.reviews.map(r=>({...r,corrected_value:null}))}).meters[0].scaledUsage).toBeNull();
  expect(read({...data,readings:[data.readings[0],{...data.readings[1],flag:'reset'}]}).meters[0].scaledUsage).toBeNull();
 });
 it('shows a card for all three services even without a linked meter',() => {
  const cards=siteUtilitySummaries(data,'site',{electric:true,water:false,gas:true},'stay');
  expect(cards.map(c=>[c.kind,c.available,c.meters.length])).toEqual([
   ['electric',true,1],['water',false,0],['gas',true,0]]);
 });
 it('uses only issued same-stay invoice lines and preserves posted tax amounts',() => {
  const billing={
   invoices:[{id:'invoice',site_id:'site',stay_id:'stay',status:'approved',starts_on:'2026-09-01',created_at:'2026-10-01',number:'INV-1',current_revision_id:'rev'}],
   revisions:[{id:'rev',calculation:{lines:[
    {category:'electric',description:'Electric usage',total_cents:'1005'},
    {category:'electric',description:'Electric base service',total_cents:'500'},
    {category:'gas',description:'Gas included in rent',total_cents:'0'}
   ]}}],
   accounts:[{invoice_id:'invoice',issued_on:'2026-10-05',state:'issued'}]
  } as unknown as BillingSnapshot;
  expect(read(data,'stay',billing).lastIssued?.amountCents).toBe('1505');
  expect(read(data,'stay',billing).billedStatus).toBe('billed');
  expect(read(data,'other',billing).lastIssued).toBeNull();
  expect(read(data,'stay',{...billing,accounts:[]}).lastIssued).toBeNull();
 });
});
