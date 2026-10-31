import { describe, expect, it } from 'vitest';
import { extendedVisitCount, guestExtendedVisitReviewList, paginateGuestVisitorReview, searchGuestExtendedVisitorReviews } from '../../src/lib/guest-visitor-review';

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

  it('paginates every flagged customer including the 11th record and clamps stale pages', () => {
    const entries = Array.from({ length: 23 }, (_, i) => ({ id: i + 1 }));
    const first = paginateGuestVisitorReview(entries, 0);
    expect(first.pages).toBe(3);
    expect(first.page).toBe(0);
    expect(first.rows.map((entry) => entry.id)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    const second = paginateGuestVisitorReview(entries, 1);
    expect(second.rows.map((entry) => entry.id)).toEqual([11,12,13,14,15,16,17,18,19,20]);
    const last = paginateGuestVisitorReview(entries, 200);
    expect(last.page).toBe(2);
    expect(last.rows.map((entry) => entry.id)).toEqual([21,22,23]);
    expect(paginateGuestVisitorReview(entries.slice(0, 1), 2)).toMatchObject({ page: 0, pages: 1 });
    expect(paginateGuestVisitorReview([], 15)).toMatchObject({ page: 0, pages: 1, rows: [] });
  });

  it('searches flagged review records by customer name or space without changing priority order', () => {
    const reviews = [
      { id: 1, name: 'Alpha Family', siteId: 'RV-08', extendedVisits: 3 },
      { id: 2, name: 'Beta Household', siteId: 'RV-12', extendedVisits: 2 },
      { id: 3, name: 'Alpine Friend', siteId: null, extendedVisits: 1 },
    ];
    expect(searchGuestExtendedVisitorReviews(reviews, ' aLp ' ).map((review) => review.id)).toEqual([1, 3]);
    expect(searchGuestExtendedVisitorReviews(reviews, 'rv-12').map((review) => review.id)).toEqual([2]);
    expect(searchGuestExtendedVisitorReviews(reviews, '  ')).toEqual(reviews);
    expect(searchGuestExtendedVisitorReviews(reviews, 'not-present')).toEqual([]);
    expect(reviews.map((review) => review.id)).toEqual([1, 2, 3]);
  });

});
