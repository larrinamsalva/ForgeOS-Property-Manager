import { describe, it, expect } from 'vitest';
import { demoRentStatus, isRentPastDue, rentMonthKey, demoNoticeText, demoPropertyToday } from '../../src/lib/guest-site-account';

describe('fictional site account rent alerts and notice safety', () => {
  it('only flags a current unpaid occupant AFTER the fifth', () => {
    expect(isRentPastDue('2026-10-04', true, false)).toBe(false);
    expect(isRentPastDue('2026-10-05', true, false)).toBe(false);
    expect(isRentPastDue('2026-10-06', true, false)).toBe(true);
    expect(isRentPastDue('2026-10-22', true, false)).toBe(true);
    expect(isRentPastDue('2026-10-22', true, true)).toBe(false);
    expect(isRentPastDue('2026-10-22', false, false)).toBe(false);
    expect(isRentPastDue('nonsense', true, false)).toBe(false);
    expect(demoRentStatus('2026-10-06', true, false)).toBe('past_due');
    expect(demoRentStatus('2026-10-05', true, false)).toBe('pending');
    expect(demoRentStatus('2026-10-06', true, true)).toBe('paid');
    expect(demoRentStatus('2026-10-06', false, false)).toBe('not_applicable');
  });
  it('uses property timezone and customer/month grouping', () => {
    expect(demoPropertyToday(new Date('2026-10-06T06:50:00Z'))).toBe('2026-10-05');
    expect(demoPropertyToday(new Date('2026-10-06T07:10:00Z'))).toBe('2026-10-06');
    expect(rentMonthKey('2026-10-06')).toBe('2026-10');
  });
  it('holds late fees and 3-day notices for review, never says they were delivered', () => {
    const late = demoNoticeText('late_fee_review', 'Example', 'Space 88', '2026-10', 675);
    const legal = demoNoticeText('three_day_legal_review', 'Example', 'Space 88', '2026-10', 675);
    expect(late).toMatch(/Internal staff review only/);
    expect(legal).toMatch(/INTERNAL LEGAL REVIEW ONLY/);
    expect(legal).toMatch(/Late fees and utilities must never be included/);
    expect(legal).not.toMatch(/you must move out|notice has been sent/i);
  });
});
