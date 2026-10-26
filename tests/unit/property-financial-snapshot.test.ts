import {describe,expect,it} from 'vitest';
import {propertyFinancialSnapshot} from '../../src/lib/property-financial-snapshot';
import type {CollectionsSnapshot} from '../../src/lib/collections-domain';
const data={
 invoices:[
  {id:'a',property_id:'park',status:'approved',current_revision_id:'rev-a'},
  {id:'b',property_id:'other',status:'approved',current_revision_id:'rev-b'},
  {id:'draft',property_id:'park',status:'draft',current_revision_id:'rev-draft'},
 ],
 revisions:[{id:'rev-a',total_cents:'10000'},{id:'rev-b',total_cents:'90000'},{id:'rev-draft',total_cents:'100000'}],
 summary:{accounts:[
  {invoice_id:'a',property_id:'park',state:'overdue',issued_on:'2026-10-01',outstanding_cents:'6500'},
  {invoice_id:'b',property_id:'other',state:'issued',issued_on:'2026-10-01',outstanding_cents:'90000'},
  {invoice_id:'draft',property_id:'park',state:'draft',issued_on:null,outstanding_cents:'100000'},
 ]},
 payments:[
  {id:'pay1',property_id:'park',amount_cents:'3500',corrects_payment_id:null},
  {id:'pay2',property_id:'other',amount_cents:'10000',corrects_payment_id:null},
 ],
} as unknown as CollectionsSnapshot;
describe('authorized property command center finance summary',()=>{
 it('isolates ledger-issued totals, recorded payments and overdue account count by property',()=>{
  expect(propertyFinancialSnapshot(data,['park'])).toEqual([{
   propertyId:'park',issuedCents:'10000',outstandingCents:'6500',
   overdueAccounts:1,recordedPaymentsCents:'3500',
  }]);
 });
 it('excludes draft and inaccessible property records',()=>{
  expect(propertyFinancialSnapshot(data,[])).toEqual([]);
  expect(propertyFinancialSnapshot(data,['other'])[0]).toMatchObject({
   propertyId:'other',issuedCents:'90000',outstandingCents:'90000',overdueAccounts:0,
  });
 });
});
