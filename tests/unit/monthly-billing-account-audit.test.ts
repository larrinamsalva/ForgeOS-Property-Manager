import {describe,it,expect} from 'vitest';
import {monthlyBillingRun} from '../../src/lib/monthly-billing-run';
import type {Site,Stay} from '../../src/lib/domain';
import type {BillingSnapshot} from '../../src/lib/billing-domain';
const sites=[{id:'site-88',property_id:'park',label:'Space 88',archived_at:null,electric:false,water:false,gas:false}] as Site[];
const stays=[{id:'stay-new',property_id:'park',site_id:'site-88',customer_id:'resident-new',starts_on:'2026-10-01',ends_on:null,billing_period:'monthly'}] as Stay[];
const base={policies:[],rates:[],invoices:[],revisions:[],accounts:[]} as unknown as BillingSnapshot;
const invoice=(id:string,customer_id:string,status:'approved'|'voided'|'draft'='approved')=>({
 id,number:id,property_id:'park',site_id:'site-88',stay_id:'stay-new',customer_id,status,
 starts_on:'2026-10-01',ends_on:'2026-11-01',current_revision_id:'rev-'+id,
});
describe('billing and customer ownership audit regressions',()=>{
 it('does not show a bill that belongs to another customer even when its site and stay references match',()=>{
  const snapshot={...base,invoices:[invoice('wrong','resident-former')]} as BillingSnapshot;
  const row=monthlyBillingRun('park','2026-10','2026-11-10',sites,stays,snapshot,null)[0];
  expect(row.invoices).toEqual([]);
  expect(row.status).toBe('review');
  expect(row.warnings).toContain('Invoice customer mismatch: review account ownership before billing');
 });
 it('flags two overlapping invoices for the same customer instead of considering billing ready',()=>{
  const snapshot={...base,invoices:[invoice('one','resident-new'),invoice('two','resident-new')]} as BillingSnapshot;
  const row=monthlyBillingRun('park','2026-10','2026-11-10',sites,stays,snapshot,null)[0];
  expect(row.invoices).toHaveLength(2);
  expect(row.status).toBe('existing');
  expect(row.warnings).toContain('Multiple overlapping invoices: review potential duplicate billing');
 });
 it('ignores a voided invoice when deciding whether billing already exists',()=>{
  const snapshot={...base,invoices:[invoice('void','resident-new','voided')]} as BillingSnapshot;
  const row=monthlyBillingRun('park','2026-10','2026-11-10',sites,stays,snapshot,null)[0];
  expect(row.invoices).toHaveLength(0);
  expect(row.status).toBe('ready');
 });
});
