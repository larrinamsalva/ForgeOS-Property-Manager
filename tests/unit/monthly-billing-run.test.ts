import { describe, expect, it } from 'vitest';
import { classifyMonthlyInvoices, invoiceStageLabel, monthlyBillingRun, suggestedMonthPeriod } from '../../src/lib/monthly-billing-run';
import type { Site, Stay } from '../../src/lib/domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';

const sites=[
 {id:'s1',property_id:'park',label:'Space 1',electric:false,water:false,gas:false,archived_at:null},
 {id:'s2',property_id:'park',label:'Space 2',electric:false,water:false,gas:false,archived_at:null},
 {id:'s3',property_id:'other',label:'Other park',electric:false,water:false,gas:false,archived_at:null},
] as unknown as Site[];
const stays=[
 {id:'former',property_id:'park',site_id:'s1',customer_id:'old',starts_on:'2026-08-01',ends_on:'2026-09-12',billing_period:'monthly'},
 {id:'current',property_id:'park',site_id:'s1',customer_id:'new',starts_on:'2026-09-12',ends_on:null,billing_period:'monthly'},
 {id:'s2stay',property_id:'park',site_id:'s2',customer_id:'second',starts_on:'2026-09-01',ends_on:null,billing_period:'monthly'},
 {id:'outside',property_id:'other',site_id:'s3',customer_id:'outside',starts_on:'2026-09-01',ends_on:null,billing_period:'monthly'},
] as unknown as Stay[];
const billing={policies:[{id:'policy',property_id:'park',due_days:10,created_at:'2026-07-01'}],rates:[],invoices:[],revisions:[],accounts:[]} as unknown as BillingSnapshot;
describe('property monthly billing run does not post or invent invoice balances',()=>{
 it('clips month to each stay, including previous tenants with different periods',()=>{
  const data=monthlyBillingRun('park','2026-09','2026-10-23',sites,stays,billing,{meters:[],assignments:[],readings:[],reviews:[],occupancy:[]});
  expect(data.map(r=>r.stayId)).toEqual(['former','current','s2stay']);
  expect(data[0].period).toMatchObject({startsOn:'2026-09-01',endsOn:'2026-09-12',dueOn:'2026-09-22'});
  expect(data[1].period).toMatchObject({startsOn:'2026-09-12',endsOn:'2026-10-01',dueOn:'2026-10-11'});
  expect(data.every(r=>r.status==='ready')).toBe(true);
 });
 it('identifies existing draft or issued invoices for correct site and stay only',()=>{
  const withInvoice={...billing,invoices:[{id:'i1',number:'INV-1',property_id:'park',site_id:'s1',stay_id:'former',
    status:'approved',starts_on:'2026-09-01',ends_on:'2026-09-12',current_revision_id:'rev'}],
    revisions:[{id:'rev',total_cents:'19775'}],
    accounts:[{invoice_id:'i1',issued_on:'2026-09-15'}]} as unknown as BillingSnapshot;
  const rows=monthlyBillingRun('park','2026-09','2026-10-23',sites,stays,withInvoice,null);
  expect(rows[0].status).toBe('existing');
  expect(rows[0].invoiceStage).toBe('issued');
  expect(rows[0].invoices[0]).toMatchObject({number:'INV-1',totalCents:'19775',issued:true});
  expect(rows[1].invoices).toHaveLength(0);
  expect(rows[1].status).toBe('ready');
  expect(rows[1].invoiceStage).toBe('none');
 });
 it('warns about incomplete meter evidence and future billing',()=>{
  const usingMeters=[{...sites[0],electric:true},...sites.slice(1)] as Site[];
  const rows=monthlyBillingRun('park','2026-10','2026-10-23',usingMeters,stays,billing,null);
  expect(rows.find(r=>r.stayId==='current')?.status).toBe('review');
  expect(rows.find(r=>r.stayId==='current')?.warnings).toContain('electric meter readings');
  expect(rows.find(r=>r.stayId==='current')?.warnings).toContain('Billing period');
 });
 it('separates drafts, approved-unissued, issued, and mixed invoice stages',()=>{
  expect(classifyMonthlyInvoices([])).toBe('none');
  expect(classifyMonthlyInvoices([{status:'draft',issued:false}])).toBe('draft');
  expect(classifyMonthlyInvoices([{status:'approved',issued:false}])).toBe('approved_unissued');
  expect(classifyMonthlyInvoices([{status:'approved',issued:true}])).toBe('issued');
  expect(classifyMonthlyInvoices([
    {status:'approved',issued:true},{status:'approved',issued:false},
  ])).toBe('mixed');
  expect(invoiceStageLabel('approved_unissued')).toBe('Approved, awaiting issuance');
 });
 it('uses the actual collection account issuance, not approval alone',()=>{
  const invoice={id:'invoice',number:'INV-100',property_id:'park',site_id:'s2',stay_id:'s2stay',
    status:'approved' as const,starts_on:'2026-09-01',ends_on:'2026-10-01',current_revision_id:'rev'};
  const data={...billing,invoices:[invoice],revisions:[{id:'rev',total_cents:'90000'}],accounts:[]} as unknown as BillingSnapshot;
  const first=monthlyBillingRun('park','2026-09','2026-10-23',sites,stays,data,null);
  expect(first.find(r=>r.stayId==='s2stay')?.invoiceStage).toBe('approved_unissued');
  const issued={...data,accounts:[{invoice_id:'invoice',issued_on:'2026-10-02'}]} as unknown as BillingSnapshot;
  expect(monthlyBillingRun('park','2026-09','2026-10-23',sites,stays,issued,null)
    .find(r=>r.stayId==='s2stay')?.invoiceStage).toBe('issued');
  // Other tenants sharing a site remain unaffected.
  expect(first.find(r=>r.stayId==='former')?.invoiceStage).toBe('none');
 });
 it('rejects unrelated and invalid month requests',()=>{
  expect(monthlyBillingRun('other','2026-08','2026-10-23',sites,stays,billing,null)).toEqual([]);
  expect(suggestedMonthPeriod(stays[1],'2026-13','2026-10-23',15)).toBeNull();
  expect(suggestedMonthPeriod(stays[1],'2026-08','2026-10-23',15)).toBeNull();
 });
});
