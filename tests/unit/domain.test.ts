import { describe, expect, it } from 'vitest';
import {
  csv,
  dateAtProperty,
  isCurrentStay,
  moneyInput,
  parseMoney,
  siteStatus,
  type Site,
  type Stay,
} from '../../src/lib/domain';
import { propertySchema, siteSchema } from '../../src/lib/validation';
describe('Property operations helpers', () => {
  it('parses money exactly into cents and rejects ambiguous amounts', () => {
    expect(parseMoney('650.10')).toBe(65010);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1.2')).toBe(120);
    for (const value of ['1.001', '1e3', '-5', '1,000', 'Infinity', 'NaN'])
      expect(() => parseMoney(value)).toThrow();
    expect(moneyInput(65010)).toBe('650.10');
  });
  it('uses each property’s local date across UTC midnight and daylight saving time', () => {
    const instant = new Date('2026-10-21T01:00:00Z');
    expect(dateAtProperty('America/Los_Angeles', instant)).toBe('2026-10-20');
    expect(dateAtProperty('Asia/Tokyo', instant)).toBe('2026-10-21');
    expect(dateAtProperty('America/Los_Angeles', new Date('2026-03-08T10:05:00Z'))).toBe('2026-03-08');
  });
  it('calculates occupancy from stay records with an exclusive departure date', () => {
    const site = { id: 'site', archived_at: null, physical_status: 'ready' } as Site;
    const stay = { site_id: 'site', starts_on: '2026-10-01', ends_on: '2026-10-21' } as Stay;
    expect(siteStatus(site, [stay], '2026-10-20')).toBe('occupied');
    expect(siteStatus(site, [stay], '2026-10-21')).toBe('available');
    expect(isCurrentStay({ ...stay, starts_on: '2026-10-23', ends_on: null }, '2026-10-21')).toBe(false);
    expect(siteStatus({ ...site, archived_at: '2026-10-22' }, [stay], '2026-10-20')).toBe('archived');
  });
  it('quotes CSV safely and neutralizes spreadsheet formulas', () => {
    expect(csv([['=SUM(A1)', 'a,"b"', '@malicious']])).toBe('"\'=SUM(A1)","a,""b""","\'@malicious"');
  });
  it('rejects invalid time zones, cross-scope fields and fractional bedrooms', () => {
    expect(propertySchema.safeParse({ name: '', timezone: 'bad' }).success).toBe(false);
    expect(siteSchema.safeParse({ property_id: 'invalid', bedrooms: 1.5 }).success).toBe(false);
  });
});
