import { describe, expect, it } from 'vitest';
import { createGuestCustomerDirectoryCsv } from '../../src/lib/guest-customer-directory-csv';

describe('fictional customer directory CSV', () => {
  it('exports only supplied customers in order with exact animal and extended-stay counts', () => {
    const csv = createGuestCustomerDirectoryCsv([
      {
        name: 'Example, Family',
        siteId: 'RV-08',
        pets: { dogs: 2, cats: 1, horses: 0, cows: 0 },
        guestVisits: [
          { name: 'Visitor A', arrival: '2026-10-01', departure: '2026-10-15' },
          { name: 'Visitor B', arrival: '2026-10-01', departure: '2026-10-16' },
        ],
      },
      { name: 'No Space', siteId: null },
    ], [{ id: 'RV-08', rent: 700 }]);
    expect(csv).toContain('"Example, Family","RV-08","700","2","1","0","0","2","1"');
    expect(csv).toContain('"No Space","Not assigned","","0","0","0","0","0","0"');
    expect(csv.indexOf('Example, Family')).toBeLessThan(csv.indexOf('No Space'));
    expect(csv).not.toContain('Visitor A');
  });

  it('quotes embedded punctuation and treats formula-like user values as text', () => {
    const csv = createGuestCustomerDirectoryCsv([
      { name: '=HYPERLINK("https://example.invalid")', siteId: '+SPREADSHEET' },
      { name: 'Name "quoted", with comma', siteId: null },
      { name: '  @formula', siteId: null },
    ], []);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"\'+SPREADSHEET"');
    expect(csv).toContain('"Name ""quoted"", with comma"');
    expect(csv).toContain('"\'  @formula"');
  });

  it('returns a header row for an empty filtered result', () => {
    const csv = createGuestCustomerDirectoryCsv([], []);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
    expect(csv).toContain('"Customer name"');
  });
});
