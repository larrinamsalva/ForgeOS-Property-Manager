import { describe, expect, it } from 'vitest';
import { siteUtilitySummaries } from '../../src/lib/site-utility-summary';
import type { MeterSnapshot } from '../../src/lib/meter-domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';

const kinds = ['electric','water','gas'] as const;
const siteId = 'space-88', stayId = 'current-stay';
const meters = kinds.map(kind=>({
  id:'meter-'+kind,property_id:'park',label:kind+' at Space 88',
  utility:kind,unit:kind==='electric'?'kWh':kind==='water'?'gal':'therms',
  multiplier:'1',max_delta:null,
}));
const assignments = kinds.map(kind=>({
  id:'assignment-'+kind,site_id:siteId,property_id:'park',
  meter_id:'meter-'+kind,ends_at:null,
}));
const readings = kinds.flatMap(kind=>[
  {id:'old-'+kind,property_id:'park',assignment_id:'assignment-'+kind,
    meter_id:'meter-'+kind,captured_at:'2026-09-01T12:00:00Z',
    value:'100',flag:'none',kind:'actual',exceptions:[]},
  {id:'new-'+kind,property_id:'park',assignment_id:'assignment-'+kind,
    meter_id:'meter-'+kind,captured_at:'2026-10-01T12:00:00Z',
    value:'125',flag:'none',kind:'actual',exceptions:[]},
]);
const occupancy = readings.map(reading=>({
  reading_id:reading.id,site_id:siteId,stay_id:stayId,customer_id:'alice',
}));
const reviews = readings.map(reading=>({
  reading_id:reading.id,decision:'accepted',corrected_value:null,
  created_at:'2026-10-02T10:00:00Z',
}));
const data = {meters,assignments,readings,occupancy,reviews} as unknown as MeterSnapshot;
const billing={
  invoices:[{
    id:'bill-88',site_id:siteId,stay_id:stayId,status:'approved',
    starts_on:'2026-10-01',ends_on:'2026-11-01',created_at:'2026-10-02',
    number:'TEST-88',current_revision_id:'rev-88',
  }],
  revisions:[{id:'rev-88',calculation:{lines:[
    {category:'electric',description:'Electric usage',total_cents:'1250'},
    {category:'electric',description:'Electric base service',total_cents:'100'},
    {category:'water',description:'Water usage',total_cents:'250'},
    {category:'gas',description:'Gas included in rent',total_cents:'0'},
  ]}}],
  accounts:[{invoice_id:'bill-88',issued_on:'2026-10-05',state:'partially_paid'}],
} as unknown as BillingSnapshot;
const enabled={electric:true,water:true,gas:true};

describe('Space 88 utility-to-issued-bill integrity',()=>{
  it('keeps approved meter usage separate from authoritative billed amounts',()=>{
    const cards=siteUtilitySummaries(data,siteId,enabled,stayId,billing);
    expect(cards.map(c=>c.kind)).toEqual(kinds);
    expect(cards.map(c=>c.meters[0].scaledUsage)).toEqual(['25','25','25']);
    expect(cards.map(c=>c.lastIssued?.amountCents)).toEqual(['1350','250','0']);
    expect(cards.map(c=>c.billedStatus)).toEqual(['billed','billed','included']);
  });
  it('does not expose charges or meter usage from a prior resident stay',()=>{
    const previousStay='old-stay';
    const moved={
      ...data,occupancy:data.occupancy.map(row=>
        row.reading_id.startsWith('old-')?{...row,stay_id:previousStay,customer_id:'former'}:row),
    } as MeterSnapshot;
    const current=siteUtilitySummaries(moved,siteId,enabled,stayId,billing);
    expect(current.every(c=>c.meters[0].scaledUsage===null)).toBe(true);
    const former=siteUtilitySummaries(moved,siteId,enabled,previousStay,billing);
    expect(former.every(c=>c.lastIssued===null)).toBe(true);
  });
  it('does not treat draft, unissued, or wrong-stay invoices as issued charges',()=>{
    const unissued={...billing,accounts:[]} as BillingSnapshot;
    expect(siteUtilitySummaries(data,siteId,enabled,stayId,unissued)
      .every(c=>c.lastIssued===null)).toBe(true);
    const draft={...billing,invoices:billing.invoices.map(i=>({...i,status:'draft' as const}))};
    expect(siteUtilitySummaries(data,siteId,enabled,stayId,draft)
      .every(c=>c.lastIssued===null)).toBe(true);
    expect(siteUtilitySummaries(data,siteId,enabled,'different-stay',billing)
      .every(c=>c.lastIssued===null)).toBe(true);
  });
  it('leaves unapproved meter usage unknown without inventing bill charges',()=>{
    const pending={...data,reviews:data.reviews.filter(r=>!r.reading_id.startsWith('new-'))} as MeterSnapshot;
    const cards=siteUtilitySummaries(pending,siteId,enabled,stayId);
    expect(cards.every(c=>c.meters[0].scaledUsage===null)).toBe(true);
    expect(cards.every(c=>c.lastIssued===null && c.billedStatus==='unavailable')).toBe(true);
  });
});
