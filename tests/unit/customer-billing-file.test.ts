import { describe, it, expect } from 'vitest';
import { customerBillingSummary } from '../../src/lib/customer-billing-file';
import type { CollectionsSnapshot } from '../../src/lib/collections-domain';

const invoice = { id: 'one', property_id: 'park', customer_id: 'alice', current_revision_id: 'revision-1',
  number: 'BILL-1', starts_on: '2026-10-01', ends_on: '2026-11-01', due_on: '2026-10-05', status: 'approved' };
const account = { invoice_id: 'one', state: 'partially_paid', issued_on: '2026-10-01',
  adjusted_cents: '98000', allocated_cents: '25000', outstanding_cents: '73000', due_on: '2026-10-05' };
const data = {
 invoices: [invoice, { ...invoice, id: 'two', number: 'BILL-2', customer_id: 'bob' }],
 revisions: [{ id:'revision-1', total_cents:'100000' }],
 summary: { accounts: [account, { ...account, invoice_id: 'two' }] },
 receipts: [{ id: 'receipt-1', property_id: 'park', customer_id: 'alice', created_at:'2026-10-05', snapshot: { amount_cents:'25000' } }],
} as unknown as CollectionsSnapshot;
describe('customer monthly bill totals', () => {
 it('keeps bill total separate from ledger-adjusted outstanding amount', () => {
  const result = customerBillingSummary(data, 'alice', 'park');
  expect(result.latestBillCents).toBe('100000');
  expect(result.totalOutstandingCents).toBe('73000');
  expect(result.bills[0].appliedCents).toBe('25000');
  expect(result.receipts.map(r => r.id)).toEqual(['receipt-1']);
 });
 it('excludes other customers, unissued, drafts, and voided invoices', () => {
  expect(customerBillingSummary(data, 'bob', 'park').bills.map(b => b.id)).toEqual(['two']);
  const unissued = { ...data, summary: { ...data.summary, accounts: [{ ...account, issued_on: null }] } };
  expect(customerBillingSummary(unissued, 'alice', 'park').bills).toHaveLength(0);
  const voided = { ...data, invoices: [{...invoice, status:'voided' as const}] };
  expect(customerBillingSummary(voided, 'alice', 'park').bills).toHaveLength(0);
 });
 it('shows zero issued balance when no bill exists, never guesses rent', () => {
  expect(customerBillingSummary({ ...data, invoices: [] }, 'alice', 'park')).toMatchObject({
   bills: [], latestBillCents: null, totalOutstandingCents: '0'
  });
 });
});
