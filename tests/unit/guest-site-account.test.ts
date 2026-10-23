import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { demoRentStatus, isRentPastDue, rentMonthKey, demoNoticeText, demoPropertyToday } from '../../src/lib/guest-site-account';

describe('fictional site account rent alerts and notice safety', () => {
  it('only flags a current unpaid occupant AFTER the fifth', () => {
    assert.equal(isRentPastDue('2026-10-04', true, false), false);
    assert.equal(isRentPastDue('2026-10-05', true, false), false);
    assert.equal(isRentPastDue('2026-10-06', true, false), true);
    assert.equal(isRentPastDue('2026-10-22', true, false), true);
    assert.equal(isRentPastDue('2026-10-22', true, true), false);
    assert.equal(isRentPastDue('2026-10-22', false, false), false);
    assert.equal(isRentPastDue('nonsense', true, false), false);
    assert.equal(demoRentStatus('2026-10-06', true, false), 'past_due');
    assert.equal(demoRentStatus('2026-10-05', true, false), 'pending');
    assert.equal(demoRentStatus('2026-10-06', true, true), 'paid');
    assert.equal(demoRentStatus('2026-10-06', false, false), 'not_applicable');
  });
  it('uses property timezone and customer/month grouping', () => {
    assert.equal(demoPropertyToday(new Date('2026-10-06T06:50:00Z')), '2026-10-05');
    assert.equal(demoPropertyToday(new Date('2026-10-06T07:10:00Z')), '2026-10-06');
    assert.equal(rentMonthKey('2026-10-06'), '2026-10');
  });
  it('holds late fees and 3-day notices for review, never says they were delivered', () => {
    const late = demoNoticeText('late_fee_review', 'Example', 'Space 88', '2026-10', 675);
    const legal = demoNoticeText('three_day_legal_review', 'Example', 'Space 88', '2026-10', 675);
    assert.match(late, /Internal staff review only/);
    assert.match(legal, /INTERNAL LEGAL REVIEW ONLY/);
    assert.match(legal, /Late fees and utilities must never be included/);
    assert.doesNotMatch(legal, /you must move out|notice has been sent/i);
  });
});
