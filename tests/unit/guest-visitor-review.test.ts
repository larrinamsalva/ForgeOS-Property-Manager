import { describe, expect, it } from 'vitest';
import { extendedVisitCount, guestExtendedVisitReviewList } from '../../src/lib/guest-visitor-review';

describe('fictional extended visitor review list', () => {
  const longStay = { name: 'Fictional visitor', arrival: '2026-10-01', departure: '2026-10-16' };
  const shortStay = { name: 'Other visitor', arrival: '2026-10-01', departure: '2026-10-15' };

  it('flags 15 days but not 14 days and safely handles invalid/reversed dates', () => {
    expect(extendedVisitCount({ id: 1, name: 'Sample', siteId: null, guestVisits: [
      longStay,
      shortStay,
      { name: 'Invalid', arrival: 'not-a-date', departure: '2026-10-20' },
      { name: 'Reversed', arrival: '2026-10-20', departure: '2026-10-01' },
    ] })).toBe(1);
  });

  it('prioritizes more records, sorts ties by name, and never changes input order', () => {
    const customers = [
      { id: 5, name: 'Zebra Example', siteId: 'RV-04', guestVisits: [longStay] },
      { id: 4, name: 'Alpha Example', siteId: null, guestVisits: [longStay] },
      { id: 3, name: 'No Extended', siteId: 'RV-01', guestVisits: [shortStay] },
      { id: 8, name: 'Many Records', siteId: 'RV-02', guestVisits: [longStay, longStay] },
    ];
    expect(guestExtendedVisitReviewList(customers)).toEqual([
      { id: 8, name: 'Many Records', siteId: 'RV-02', extendedVisits: 2 },
      { id: 4, name: 'Alpha Example', siteId: null, extendedVisits: 1 },
      { id: 5, name: 'Zebra Example', siteId: 'RV-04', extendedVisits: 1 },
    ]);
    expect(customers[0].name).toBe('Zebra Example');
  });

  it('returns an empty review list when nothing requires review', () => {
    expect(guestExtendedVisitReviewList([])).toEqual([]);
    expect(guestExtendedVisitReviewList([{ id: 1, name: 'Example', siteId: null }])).toEqual([]);
  });
});
