import {describe,expect,it} from 'vitest';
import {siteUtilitySummaries} from '../../src/lib/site-utility-summary';
import type {MeterSnapshot} from '../../src/lib/meter-domain';
import type {BillingSnapshot} from '../../src/lib/billing-domain';

const site='space-88',stay='resident-2026';
const utilities=['electric','water','gas'] as const;
const meters=utilities.map(kind=>({
 id:'meter-'+kind,property_id:'rv-park',label:kind,utility:kind,unit:'units',
 multiplier:'1',max_delta:null
}));
const assignments=utilities.map(kind=>({
 id:'assignment-'+kind,property_id:'rv-park',site_id:site,meter_id:'meter-'+kind,ends_at:null
}));
const readings=utilities.flatMap(kind=>[
 {id:kind+'-prior',property_id:'rv-park',meter_id:'meter-'+kind,
  assignment_id:'assignment-'+kind,captured_at:'2026-09-01T12:00:00Z',
  value:'100',flag:'none',kind:'actual',exceptions:[]},
 {id:kind+'-current',property_id:'rv-park',meter_id:'meter-'+kind,
  assignment_id:'assignment-'+kind,captured_at:'2026-10-01T12:00:00Z',
  value:'125',flag:'none',kind:'actual',exceptions:[]},
]);
const occupancy=readings.map(r=>({reading_id:r.id,site_id:site,stay_id:stay,customer_id:'customer-88'}));
const reviews=readings.map(r=>({reading_id:r.id,decision:'accepted',corrected_value:null,created_at:'2026-10-02T12:00:00Z'}));
const meterData={meters,assignments,readings,occupancy,reviews} as unknown as MeterSnapshot;
const invoices=[
 {id:'oct-utilities',site_id:site,stay_id:stay,status:'approved',starts_on:'2026-10-01',
  ends_on:'2026-11-01',created_at:'2026-10-03',number:'OCT-88',current_revision_id:'rev-oct'},
 {id:'nov-rent',site_id:site,stay_id:stay,status:'approved',starts_on:'2026-11-01',
  ends_on:'2026-12-01',created_at:'2026-11-03',number:'NOV-88',current_revision_id:'rev-nov'},
 {id:'old-resident',site_id:site,stay_id:'previous-resident',status:'approved',
  starts_on:'2026-12-01',ends_on:'2027-01-01',created_at:'2026-12-03',
  number:'PRIVATE',current_revision_id:'rev-private'},
];
const revisions=[
 {id:'rev-oct',calculation:{lines:[
  {category:'electric',description:'Metered electric',total_cents:'1900'},
  {category:'electric',description:'Base fee',total_cents:'250'},
  {category:'water',description:'Water billed',total_cents:'420'},
  {category:'gas',description:'Gas included in rent',total_cents:'0'},
 ]}},
 {id:'rev-nov',calculation:{lines:[{category:'rent',description:'Site rent',total_cents:'65000'}]}},
 {id:'rev-private',calculation:{lines:[{category:'electric',description:'Private former account',total_cents:'99999'}]}},
];
const accounts=invoices.map(i=>({invoice_id:i.id,issued_on:'2026-11-05',state:'issued'}));
const bills={invoices,revisions,accounts} as unknown as BillingSnapshot;
const enabled={electric:true,water:true,gas:true};
describe('Space 88 meter-to-bill invoice-period and occupant protections',()=>{
 it('uses the latest ISSUED utility invoice, not a newer rent-only statement',()=>{
  const rows=siteUtilitySummaries(meterData,site,enabled,stay,bills);
  expect(rows.map(r=>r.lastIssued?.invoiceId)).toEqual(['oct-utilities','oct-utilities','oct-utilities']);
  expect(rows.map(r=>r.lastIssued?.amountCents)).toEqual(['2150','420','0']);
  expect(rows.map(r=>r.billedStatus)).toEqual(['billed','billed','included']);
  expect(rows.map(r=>r.meters[0].scaledUsage)).toEqual(['25','25','25']);
 });
 it('never exposes a previous resident invoice or charges to the active stay',()=>{
  const rows=siteUtilitySummaries(meterData,site,enabled,stay,bills);
  expect(rows.every(r=>r.lastIssued?.invoiceNumber!=='PRIVATE')).toBe(true);
  expect(siteUtilitySummaries(meterData,site,enabled,'unrelated-stay',bills)
   .every(r=>r.lastIssued===null && r.meters[0].scaledUsage===null)).toBe(true);
 });
 it('ignores an approved invoice if it has not been issued to the customer',()=>{
  const withheld={...bills,accounts:bills.accounts.filter(a=>a.invoice_id!=='oct-utilities')} as BillingSnapshot;
  const rows=siteUtilitySummaries(meterData,site,enabled,stay,withheld);
  expect(rows.every(r=>r.lastIssued===null)).toBe(true);
 });
 it('does not guess charges from queued or unapproved tablet readings',()=>{
  const unapproved={...meterData,reviews:meterData.reviews.filter(r=>!r.reading_id.endsWith('-current'))} as MeterSnapshot;
  const rows=siteUtilitySummaries(unapproved,site,enabled,stay);
  expect(rows.every(r=>r.meters[0].scaledUsage===null&&r.lastIssued===null)).toBe(true);
 });
});
