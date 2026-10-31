import { describe, expect, it } from 'vitest';
import { summarizeGuestCustomers } from '../../src/lib/guest-customer-summary';

describe('guest customer directory snapshot', () => {
  it('totals animals and extended visit records across all supplied customers', () => {
    const summary = summarizeGuestCustomers([
      {
        pets: { dogs: 2, cats: 1, horses: 0, cows: 0 },
        guestVisits: [
          { name: 'Fourteen days', arrival: '2026-10-01', departure: '2026-10-15' },
          { name: 'Fifteen days', arrival: '2026-10-01', departure: '2026-10-16' },
          { name: 'Sixteen days', arrival: '2026-10-01', departure: '2026-10-17' },
        ],
      },
      {
        pets: { dogs: 0, cats: 0, horses: 1, cows: 2 },
        guestVisits: [{ name: 'A visit', arrival: '2026-10-04', departure: '2026-10-19' }],
      },
      { pets: { dogs: 0, cats: 0, horses: 0, cows: 0 }, guestVisits: [] },
      {},
    ]);
    expect(summary).toEqual({
      customers: 4,
      customersWithAnimals: 2,
      dogs: 2,
      cats: 1,
      horses: 1,
      cows: 2,
      customersWithExtendedVisits: 2,
      extendedVisitorRecords: 3,
    });
  });

  it('does not count invalid dates as extended stays', () => {
    const summary = summarizeGuestCustomers([
      { guestVisits: [{ name: 'Invalid', arrival: 'not-a-date', departure: '2026-10-31' }] },
      { guestVisits: [{ name: 'Backwards', arrival: '2026-10-31', departure: '2026-10-01' }] },
    ]);
    expect(summary.customersWithExtendedVisits).toBe(0);
    expect(summary.extendedVisitorRecords).toBe(0);
  });

  it('returns zeroes for no matches', () => {
    expect(summarizeGuestCustomers([])).toEqual({
      customers: 0,
      customersWithAnimals: 0,
      dogs: 0,
      cats: 0,
      horses: 0,
      cows: 0,
      customersWithExtendedVisits: 0,
      extendedVisitorRecords: 0,
    });
  });
});
