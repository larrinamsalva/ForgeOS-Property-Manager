import { describe, expect, it } from 'vitest';
import { meterFileEntries } from '../../src/lib/meter-file';
import type { MeterSnapshot } from '../../src/lib/meter-domain';
const sample = {
  meters: [{ id: 'meter-1', property_id: 'park', label: 'Pedestal 1', utility: 'electric', unit: 'kWh' }],
  assignments: [{ id: 'assignment-1', property_id: 'park', meter_id: 'meter-1', site_id: 'RV-01', site_label: 'RV-01' }],
  readings: [
    { id: 'reading-old', property_id: 'park', meter_id: 'meter-1', assignment_id: 'assignment-1', captured_at: '2026-09-10T12:00:00Z', value: '1200', exceptions: [] },
    { id: 'reading-new', property_id: 'park', meter_id: 'meter-1', assignment_id: 'assignment-1', captured_at: '2026-10-10T12:00:00Z', value: '1400', exceptions: ['unusual'] },
  ],
  reviews: [{ id: 'review-1', reading_id: 'reading-new', decision: 'accepted', corrected_value: '1401', created_at: '2026-10-11T00:00:00Z' }],
  occupancy: [
    { reading_id: 'reading-old', site_id: 'RV-01', customer_id: 'former', captured_on: '2026-09-10' },
    { reading_id: 'reading-new', site_id: 'RV-01', customer_id: 'current', captured_on: '2026-10-10' },
  ],
} as unknown as MeterSnapshot;

describe('immutable site/customer meter file history', () => {
  it('shows the physical site history across two residents with preserved capture identity', () => {
    const records = meterFileEntries(sample, { siteId: 'RV-01' });
    expect(records.map((r) => r.customerId)).toEqual(['current', 'former']);
    expect(records.map((r) => r.original)).toEqual(['1400', '1200']);
    expect(records[0].effective).toBe('1401');
  });
  it('does not expose a previous resident reading in the next resident file', () => {
    expect(meterFileEntries(sample, { customerId: 'current' }).map((r) => r.id)).toEqual(['reading-new']);
    expect(meterFileEntries(sample, { customerId: 'former' }).map((r) => r.id)).toEqual(['reading-old']);
  });
  it('does not make pending or rejected readings look supervisor approved', () => {
    const [pending] = meterFileEntries({ ...sample, reviews: [] }, { siteId: 'RV-01' });
    expect(pending.reviewStatus).toBe('pending');
    expect(pending.effective).toBeNull();
    const [rejected] = meterFileEntries({
      ...sample,
      reviews: [{ ...sample.reviews[0], decision: 'rejected', corrected_value: null }],
    }, { siteId: 'RV-01' });
    expect(rejected.reviewStatus).toBe('rejected');
    expect(rejected.effective).toBeNull();
  });
  it('requires immutable capture attribution and matching meter assignment', () => {
    expect(meterFileEntries({ ...sample, occupancy: [] }, { siteId: 'RV-01' })).toEqual([]);
    expect(meterFileEntries({
      ...sample,
      assignments: [{ ...sample.assignments[0], site_id: 'RV-99' }],
    }, { customerId: 'current' })).toEqual([]);
  });
  it('shows only the latest readings without deleting older records', () => {
    expect(meterFileEntries(sample, { siteId: 'RV-01' }, 1).map((r) => r.id)).toEqual(['reading-new']);
    expect(sample.readings).toHaveLength(2);
  });
});
