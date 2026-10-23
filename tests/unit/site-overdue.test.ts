import { describe, expect, it } from 'vitest';
import { siteOverdueFlags } from '@/lib/site-overdue';
const now = new Date('2026-10-22T12:00:00-07:00');
const properties = [{ id: 'park', timezone: 'America/Los_Angeles' }];
const stay = { id: 'stay-1', property_id: 'park', site_id: 'RV-01', customer_id: 'alice', starts_on: '2026-01-01', ends_on: null };
const invoice = { id: 'inv-1', property_id: 'park', site_id: 'RV-01', stay_id: 'stay-1', customer_id: 'alice', status: 'approved' as const };
const account = { invoice_id: 'inv-1', property_id: 'park', customer_id: 'alice', state: 'overdue' as const, outstanding_cents: '72500' };
describe('live site overdue indicators', () => {
  it('flags only an issued invoice from the current occupant and uses the authoritative balance', () => {
    expect(siteOverdueFlags([account], [invoice], [stay], properties, now)).toEqual({
      'RV-01': { siteId: 'RV-01', customerId: 'alice', outstandingCents: '72500', invoiceCount: 1 },
    });
  });
  it('never turns the calendar date, a draft, or paid/unissued invoices into overdue debt', () => {
    expect(siteOverdueFlags([{ ...account, state: 'paid' }], [invoice], [stay], properties, now)).toEqual({});
    expect(siteOverdueFlags([{ ...account, state: 'approved_unissued' }], [invoice], [stay], properties, now)).toEqual({});
    expect(siteOverdueFlags([account], [{ ...invoice, status: 'draft' }], [stay], properties, now)).toEqual({});
    expect(siteOverdueFlags([{ ...account, outstanding_cents: '0' }], [invoice], [stay], properties, now)).toEqual({});
  });
  it('never charges a new occupant for the previous occupant overdue invoice', () => {
    expect(siteOverdueFlags([account], [invoice], [{ ...stay, ends_on: '2026-09-01' },
      { ...stay, id: 'stay-2', customer_id: 'bob', starts_on: '2026-09-01' }], properties, now)).toEqual({});
  });
  it('aggregates multiple real overdue invoices for the same active occupant', () => {
    const second = { ...invoice, id: 'inv-2' };
    expect(siteOverdueFlags([account, { ...account, invoice_id: 'inv-2', outstanding_cents: '125' }],
      [invoice, second], [stay], properties, now)['RV-01']).toEqual({
      siteId: 'RV-01', customerId: 'alice', invoiceCount: 2, outstandingCents: '72625',
    });
  });
});
