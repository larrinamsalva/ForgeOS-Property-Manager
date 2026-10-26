import {describe,it,expect} from 'vitest';
import {accountBalanceReview} from '../../src/lib/account-balance-review';
import type {CollectionAccount} from '../../src/lib/collections-domain';
const account=(invoice_id:string,extra:Partial<CollectionAccount>={})=>({
 invoice_id,number:invoice_id,property_id:'park',customer_id:'alice',issued_on:'2026-10-01',
 state:'partially_paid',adjusted_cents:'10000',allocated_cents:'3000',outstanding_cents:'7000',...extra,
} as CollectionAccount);
describe('read-only invoice ledger balance checks',()=>{
 it('accepts accurate partial payment totals',()=>{
  expect(accountBalanceReview([account('correct')],'park')).toEqual([]);
 });
 it('flags discrepancies, incorrect payment state and negative balances',()=>{
  const issues=accountBalanceReview([
   account('mismatch',{outstanding_cents:'7500'}),
   account('paid',{state:'paid',outstanding_cents:'7000'}),
   account('negative',{adjusted_cents:'1000',allocated_cents:'2000',outstanding_cents:'-1000'}),
  ],'park');
  expect(issues.some(i=>i.invoiceId==='mismatch'&&i.message.includes('do not reconcile'))).toBe(true);
  expect(issues.some(i=>i.invoiceId==='paid'&&i.message.includes('status'))).toBe(true);
  expect(issues.some(i=>i.invoiceId==='negative'&&i.message.includes('negative'))).toBe(true);
 });
 it('excludes unissued, voided, other properties and customer records',()=>{
  const rows=[account('unissued',{issued_on:null}),account('void',{state:'voided'}),
   account('other',{property_id:'another',outstanding_cents:'-1'}),
   account('bob',{customer_id:'bob',outstanding_cents:'-1'})];
  expect(accountBalanceReview(rows,'park','alice')).toEqual([]);
 });
});