import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { siteOverdueFlags } from '../../src/lib/site-overdue';
import { meterFileEntries } from '../../src/lib/meter-file';
import type { MeterSnapshot } from '../../src/lib/meter-domain';

const SITE_COUNT=700;
const site=(n:number)=>'space-'+String(n).padStart(3,'0');
const customer=(n:number)=>'resident-'+String(n).padStart(3,'0');
const property=[{id:'load-park',timezone:'America/Los_Angeles'}];
const stays=Array.from({length:SITE_COUNT},(_,n)=>({
  id:'stay-'+n,property_id:'load-park',site_id:site(n),customer_id:customer(n),
  starts_on:'2026-01-01',ends_on:null,
}));
const invoices=stays.map((stay,n)=>({
  id:'invoice-'+n,property_id:'load-park',site_id:stay.site_id,stay_id:stay.id,
  customer_id:stay.customer_id,status:'approved' as const,
}));
const accounts=invoices.map((invoice,n)=>({
  invoice_id:invoice.id,property_id:'load-park',customer_id:invoice.customer_id,
  state:n%5===0?'overdue' as const:'paid' as const,
  outstanding_cents:n%5===0?'75000':'0',
  issued_on:'2026-10-01',due_on:'2026-10-05',days_past_due:17,
}));
const kinds=['electric','water','gas'] as const;
const meters=stays.flatMap((stay,n)=>kinds.map(kind=>({
  id:kind+'-'+n,property_id:'load-park',label:kind+' meter '+n,utility:kind,
  unit:kind==='electric'?'kWh':kind==='water'?'gal':'therm',
})));
const assignments=stays.flatMap((stay,n)=>kinds.map(kind=>({
  id:'assignment-'+kind+'-'+n,property_id:'load-park',site_id:stay.site_id,
  meter_id:kind+'-'+n,site_label:stay.site_id,
})));
const readings=assignments.flatMap(assignment=>Array.from({length:3},(_,index)=>({
  id:'reading-'+assignment.id+'-'+index,property_id:'load-park',meter_id:assignment.meter_id,
  assignment_id:assignment.id,captured_at:'2026-10-'+String(10+index).padStart(2,'0')+'T12:00:00Z',
  value:String(1000+index*100),exceptions:[],
})));
const occupancy=readings.map(reading=>({
  reading_id:reading.id,
  site_id:assignments.find(assignment=>assignment.id===reading.assignment_id)!.site_id,
  customer_id:customer(Number(reading.assignment_id.split('-').at(-1))),
  captured_on:reading.captured_at.slice(0,10),
}));
const snapshot={meters,assignments,readings,occupancy,reviews:[]} as unknown as MeterSnapshot;

describe('700-space synthetic capacity regression (no live customer data)',()=>{
  it('keeps one-to-one site tenancy and verifies overdue flags across all 700 sites',()=>{
    const started=performance.now();
    const flags=siteOverdueFlags(accounts,invoices,stays,property,new Date('2026-10-25T12:00:00-07:00'));
    const elapsed=performance.now()-started;
    expect(stays).toHaveLength(SITE_COUNT);
    expect(Object.keys(flags)).toHaveLength(SITE_COUNT/5);
    expect(flags[site(0)].customerId).toBe(customer(0));
    expect(flags[site(699)]).toBeUndefined();
    console.info('700-space synthetic overdue review:',elapsed.toFixed(1),'ms');
  });
  it('preserves meter reading identity for 2,100 meters and 6,300 captures',()=>{
    const started=performance.now();
    const selected=meterFileEntries(snapshot,{siteId:site(88)});
    const elapsed=performance.now()-started;
    expect(meters).toHaveLength(SITE_COUNT*3);
    expect(readings).toHaveLength(SITE_COUNT*3*3);
    expect(selected).toHaveLength(9);
    expect(new Set(selected.map(item=>item.utility))).toEqual(new Set(kinds));
    expect(selected.every(item=>item.customerId===customer(88))).toBe(true);
    expect(meterFileEntries(snapshot,{customerId:customer(88)})).toHaveLength(9);
    console.info('6,300-reading synthetic site history:',elapsed.toFixed(1),'ms');
  });
});
