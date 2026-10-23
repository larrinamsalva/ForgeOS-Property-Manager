import type { MeterSnapshot, MeterReading } from './meter-domain';
import { latestReview } from './meter-domain';

export interface MeterFileEntry {
  id: string;
  siteId: string;
  customerId: string | null;
  meterLabel: string;
  utility: string;
  unit: string;
  siteLabel: string;
  capturedAt: string;
  recordedOn: string;
  original: string | null;
  effective: string | null;
  reviewStatus: 'accepted' | 'rejected' | 'pending';
  exceptions: string[];
}

// Historical occupancy is immutable at capture time. Never infer it from the
// current site assignment or current resident when a customer moves out.
export function meterFileEntries(
  data: Pick<MeterSnapshot, 'readings' | 'assignments' | 'meters' | 'reviews' | 'occupancy'>,
  filter: { siteId?: string; customerId?: string },
  limit = 50
): MeterFileEntry[] {
  const occupants = new Map(data.occupancy.map((o) => [o.reading_id, o]));
  const assignments = new Map(data.assignments.map((a) => [a.id, a]));
  const meters = new Map(data.meters.map((m) => [m.id, m]));
  return data.readings.flatMap((reading: MeterReading) => {
    const occupant = occupants.get(reading.id);
    const assignment = assignments.get(reading.assignment_id);
    const meter = meters.get(reading.meter_id);
    if (!occupant || !assignment || !meter ||
        assignment.site_id !== occupant.site_id ||
        assignment.meter_id !== meter.id ||
        assignment.property_id !== reading.property_id ||
        meter.property_id !== reading.property_id ||
        (filter.siteId && filter.siteId !== occupant.site_id) ||
        (filter.customerId && filter.customerId !== occupant.customer_id)) return [];
    const review = latestReview(reading.id, data.reviews);
    return [{
      id: reading.id, siteId: occupant.site_id, customerId: occupant.customer_id,
      meterLabel: meter.label, utility: meter.utility, unit: meter.unit,
      siteLabel: assignment.site_label, capturedAt: reading.captured_at,
      recordedOn: occupant.captured_on, original: reading.value,
      effective: review?.decision === 'accepted' ? (review.corrected_value ?? reading.value) : null,
      reviewStatus: review?.decision ?? 'pending', exceptions: reading.exceptions,
    }];
  }).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id)).slice(0, limit);
}
