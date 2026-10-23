import { describe, expect, it } from 'vitest';
import { pastDueSiteReviewRows } from '../../src/lib/past-due-site-review';
import type { SiteOverdueFlag } from '../../src/lib/site-overdue';
import type { Customer, Property, Site, Stay } from '../../src/lib/domain';

const now=new Date('2026-10-23T15:00:00Z');
const properties=[{id:'park',timezone:'America/Los_Angeles'},{id:'other',timezone:'America/New_York'}] as unknown as Property[];
const sites=[
 {id:'s1',label:'RV-01',property_id:'park',archived_at:null},
 {id:'s2',label:'RV-02',property_id:'park',archived_at:null},
 {id:'foreign',label:'Unit 1',property_id:'other',archived_at:null},
] as unknown as Site[];
const stays=[
 {id:'old',site_id:'s1',property_id:'park',customer_id:'former',starts_on:'2026-01-01',ends_on:'2026-09-30'},
 {id:'new',site_id:'s1',property_id:'park',customer_id:'river',starts_on:'2026-09-30',ends_on:null},
 {id:'second',site_id:'s2',property_id:'park',customer_id:'sam',starts_on:'2026-01-01',ends_on:null},
 {id:'outside',site_id:'foreign',property_id:'other',customer_id:'foreign',starts_on:'2026-01-01',ends_on:null},
] as unknown as Stay[];
const customers=[
 {id:'river',property_id:'park',first_name:'River',last_name:'Sample',archived_at:null},
 {id:'former',property_id:'park',first_name:'Former',last_name:'Resident',archived_at:null},
 {id:'sam',property_id:'park',first_name:'Sam',last_name:'Payne',archived_at:null},
 {id:'foreign',property_id:'other',first_name:'Other',last_name:'Resident',archived_at:null},
] as unknown as Customer[];
const flag=(siteId:string,customerId:string,amount:string):SiteOverdueFlag=>({
 siteId,customerId,invoiceCount:1,outstandingCents:amount,
});
describe('property map past due review queue',()=>{
 it('lists and sorts actual current-occupant balances by amount, then site',()=>{
  const flags={s1:flag('s1','river','50250'),s2:flag('s2','sam','12500')};
  const data=pastDueSiteReviewRows(sites,flags,stays,customers,properties,now);
  expect(data.map(item=>[item.siteLabel,item.resident,item.outstandingCents]))
   .toEqual([['RV-01','River Sample','50250'],['RV-02','Sam Payne','12500']]);
 });
 it('does not carry previous occupants or unrelated property/customer flags into queue',()=>{
  const flags={s1:flag('s1','former','10000'),
    s2:flag('s2','foreign','5000'),foreign:flag('foreign','foreign','7500')};
  const rows=pastDueSiteReviewRows(sites.filter(s=>s.property_id==='park'),flags,stays,customers,properties,now);
  expect(rows).toEqual([]);
 });
 it('excludes archived units, zero debt, wrong flag IDs and missing tenant records',()=>{
  const flags={s1:flag('s1','river','2000')};
  expect(pastDueSiteReviewRows([{...sites[0],archived_at:'2026-10-22'}],flags,stays,customers,properties,now)).toEqual([]);
  expect(pastDueSiteReviewRows(sites,{s1:flag('s1','river','0')},stays,customers,properties,now)).toEqual([]);
  expect(pastDueSiteReviewRows(sites,{s1:flag('s2','river','200')},stays,customers,properties,now)).toEqual([]);
  expect(pastDueSiteReviewRows(sites,flags,stays,customers.filter(c=>c.id!=='river'),properties,now)).toEqual([]);
 });
 it('requires exactly one current stay even if the source has an overdue flag',()=>{
  const flags={s1:flag('s1','river','2000')};
  const overlapping=[...stays,{...stays[1],id:'duplicate'}];
  expect(pastDueSiteReviewRows(sites,flags,overlapping,customers,properties,now)).toEqual([]);
  const moved=[...stays.slice(0,1),{...stays[1],ends_on:'2026-10-01'},...stays.slice(2)];
  expect(pastDueSiteReviewRows(sites,flags,moved,customers,properties,now)).toEqual([]);
 });
});
