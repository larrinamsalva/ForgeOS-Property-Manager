import { describe, expect, it } from 'vitest';
import { customerBillingSummary } from '../../src/lib/customer-billing-file';
import { siteOverdueFlags } from '../../src/lib/site-overdue';
import { meterFileEntries } from '../../src/lib/meter-file';
import type { CollectionsSnapshot } from '../../src/lib/collections-domain';
import type { MeterSnapshot } from '../../src/lib/meter-domain';

const now = new Date('2026-10-22T12:00:00-07:00');
const properties = [{id:'park',timezone:'America/Los_Angeles'}];
const former = {id:'stay-previous',property_id:'park',site_id:'RV-88',customer_id:'former',
  starts_on:'2026-01-01',ends_on:'2026-09-30'};
const current = {id:'stay-current',property_id:'park',site_id:'RV-88',customer_id:'new-resident',
  starts_on:'2026-10-01',ends_on:null};
const invoice = {id:'invoice-88',property_id:'park',site_id:'RV-88',stay_id:current.id,
  customer_id:current.customer_id,status:'approved' as const,
  number:'OCT-88',starts_on:'2026-10-01',ends_on:'2026-11-01',current_revision_id:'revision-88'};
const ledger = {invoice_id:invoice.id,property_id:'park',customer_id:current.customer_id,
  state:'overdue' as const,issued_on:'2026-10-01',due_on:'2026-10-05',
  outstanding_cents:'75000',allocated_cents:'25000',adjusted_cents:'100000',days_past_due:17};
const statement = {
  invoices:[invoice], revisions:[{id:'revision-88',total_cents:'100000'}],
  summary:{accounts:[ledger]},receipts:[{id:'receipt-88',property_id:'park',customer_id:current.customer_id,
    created_at:'2026-10-12',snapshot:{amount_cents:'25000'}}],
} as unknown as CollectionsSnapshot;
const readings = {
  meters:[{id:'meter-88',property_id:'park',label:'RV 88 electric',utility:'electric',unit:'kWh'}],
  assignments:[{id:'assignment-88',property_id:'park',meter_id:'meter-88',site_id:'RV-88',site_label:'RV-88'}],
  readings:[
    {id:'reading-before',property_id:'park',meter_id:'meter-88',assignment_id:'assignment-88',
      captured_at:'2026-09-10T12:00:00Z',value:'1200',exceptions:[]},
    {id:'reading-now',property_id:'park',meter_id:'meter-88',assignment_id:'assignment-88',
      captured_at:'2026-10-10T12:00:00Z',value:'1400',exceptions:['unusual']},
  ],
  occupancy:[
    {reading_id:'reading-before',site_id:'RV-88',customer_id:'former',captured_on:'2026-09-10'},
    {reading_id:'reading-now',site_id:'RV-88',customer_id:'new-resident',captured_on:'2026-10-10'},
  ],
  reviews:[{id:'review-88',reading_id:'reading-now',decision:'accepted',corrected_value:'1401',
    created_at:'2026-10-11T00:00:00Z'}],
} as unknown as MeterSnapshot;

describe('Space 88 resident-to-payment acceptance regression',()=>{
  it('preserves the issued bill, the partial payment, and the matching receipt',()=>{
    const summary=customerBillingSummary(statement,'new-resident','park');
    expect(summary.latestBillCents).toBe('100000');
    expect(summary.totalOutstandingCents).toBe('75000');
    expect(summary.bills[0].appliedCents).toBe('25000');
    expect(summary.receipts.map(item=>item.id)).toEqual(['receipt-88']);
  });
  it('flags only the current stay outstanding balance and never the former tenant',()=>{
    expect(siteOverdueFlags([ledger],[invoice],[former,current],properties,now)).toMatchObject({
      'RV-88':{customerId:'new-resident',outstandingCents:'75000',invoiceCount:1},
    });
    const oldDebt={...ledger,invoice_id:'prior-bill',customer_id:'former'};
    const oldInvoice={...invoice,id:'prior-bill',stay_id:former.id,customer_id:'former'};
    expect(siteOverdueFlags([oldDebt],[oldInvoice],[former,current],properties,now)).toEqual({});
  });
  it('keeps meter reading identity across move-out and only exposes new readings to the new resident',()=>{
    expect(meterFileEntries(readings,{siteId:'RV-88'}).map(row=>row.customerId)).toEqual([
      'new-resident','former',
    ]);
    const residentReadings=meterFileEntries(readings,{customerId:'new-resident'});
    expect(residentReadings.map(row=>row.id)).toEqual(['reading-now']);
    expect(residentReadings[0].effective).toBe('1401');
    expect(residentReadings[0].exceptions).toContain('unusual');
  });
  it('never treats an unissued invoice or settled balance as confirmed site arrears',()=>{
    expect(siteOverdueFlags([{...ledger,issued_on:null,state:'approved_unissued' as const}],[invoice],[former,current],properties,now)).toEqual({});
    expect(siteOverdueFlags([{...ledger,outstanding_cents:'0'}],[invoice],[former,current],properties,now)).toEqual({});
  });
});
