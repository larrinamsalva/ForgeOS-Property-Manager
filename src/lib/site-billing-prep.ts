import type { Site, Stay } from './domain';
import { addDays, calendarMonth } from './domain';
import type { MeterSnapshot } from './meter-domain';
import { latestReview } from './meter-domain';
import type { BillingSnapshot } from './billing-domain';

export interface BillingPeriodSuggestion {
  startsOn: string;
  endsOn: string;
  dueOn: string;
  isFutureClosing: boolean;
}
export type Readiness = 'ok' | 'check';
export interface BillingChecklistItem {
  label: string;
  state: Readiness;
  note: string;
}
export function suggestBillingPeriod(stay: Pick<Stay, 'starts_on' | 'ends_on'>, today: string, dueDays = 15): BillingPeriodSuggestion {
  const previous = calendarMonth(today, -1);
  const current = calendarMonth(today, 0);
  let startsOn = stay.starts_on > previous ? stay.starts_on : previous;
  let endsOn = stay.ends_on && stay.ends_on < current ? stay.ends_on : current;
  if (startsOn >= endsOn) {
    startsOn = stay.starts_on > current ? stay.starts_on : current;
    const next = calendarMonth(today, 1);
    endsOn = stay.ends_on && stay.ends_on < next ? stay.ends_on : next;
  }
  return {
    startsOn,
    endsOn,
    dueOn: addDays(endsOn, dueDays),
    isFutureClosing: endsOn > today,
  };
}
// Preview-only coverage check. Date ranges are [start, end); the database
// remains authoritative for exact pricing, tiering and version eligibility.
export function coversBillingPeriod(
  plans: { starts_on: string; ends_on: string | null }[], startsOn: string, endsOn: string,
): boolean {
  let coveredUntil = startsOn;
  for (const plan of [...plans].sort((a, b) => a.starts_on.localeCompare(b.starts_on))) {
    if (plan.starts_on > coveredUntil) return false;
    if (!plan.ends_on) return true;
    if (plan.ends_on > coveredUntil) coveredUntil = plan.ends_on;
    if (coveredUntil >= endsOn) return true;
  }
  return coveredUntil >= endsOn;
}
// An *advisory* checklist, never an alternative invoice calculator. The
// PostgreSQL billing engine remains authoritative about boundaries, meter
// replacements, taxes, rates, split intervals, credit and issuance.
export function siteBillingChecklist(
  site: Pick<Site, 'id' | 'property_id' | 'electric' | 'water' | 'gas'>,
  stay: Pick<Stay, 'id'>,
  period: BillingPeriodSuggestion,
  billing: Pick<BillingSnapshot, 'policies' | 'rates' | 'invoices'>,
  meters: Pick<MeterSnapshot, 'meters' | 'assignments' | 'readings' | 'reviews' | 'occupancy'> | null,
): BillingChecklistItem[] {
  const items: BillingChecklistItem[] = [];
  const policy = billing.policies.some(p => p.property_id === site.property_id);
  items.push({
    label: 'Property billing policy',
    state: policy ? 'ok' : 'check',
    note: policy ? 'Policy configured' : 'Configure an approved property billing policy',
  });
  items.push({
    label: 'Billing period',
    state: period.isFutureClosing ? 'check' : 'ok',
    note: period.isFutureClosing
      ? 'Closing date is in the future; metered usage requires closing evidence'
      : period.startsOn + ' → ' + period.endsOn + ' (exclusive)',
  });
  const overlapping = billing.invoices.filter(i => i.stay_id === stay.id &&
    i.site_id === site.id && i.status !== 'voided' &&
    i.starts_on < period.endsOn && i.ends_on > period.startsOn);
  items.push({
    label: 'Existing invoices',
    state: overlapping.length ? 'check' : 'ok',
    note: overlapping.length
      ? overlapping.map(i => i.number + ' (' + i.status + ')').join(', ') +
        ' already covers some of this stay and period; review before creating another draft'
      : 'No overlapping, non-voided invoice found for this stay',
  });
  for (const utility of ['electric', 'water', 'gas'] as const) {
    if (!site[utility]) continue;
    const plans = billing.rates.filter(r => r.property_id === site.property_id &&
      r.utility === utility && r.status === 'active' &&
      r.starts_on < period.endsOn && (!r.ends_on || r.ends_on > period.startsOn));
    const covered = coversBillingPeriod(plans, period.startsOn, period.endsOn);
    items.push({
      label: utility + ' rate schedule',
      state: covered ? 'ok' : 'check',
      note: covered
        ? 'Active rate versions cover the period; billing validates prices and conversions'
        : plans.length
          ? 'Rate schedule has a gap in this billing period; review effective dates'
          : 'Missing active rate schedule for this service period',
    });
    if (!meters) {
      items.push({label: utility + ' meter readings', state:'check', note:'Meter evidence unavailable; refresh before calculating'});
      continue;
    }
    const utilityMeters = new Map(meters.meters.filter(m => m.utility === utility &&
      m.property_id === site.property_id).map(m => [m.id, m]));
    const assignments = meters.assignments.filter(a => a.site_id === site.id &&
      a.property_id === site.property_id && utilityMeters.has(a.meter_id) &&
      a.starts_at.slice(0,10) < period.endsOn &&
      (!a.ends_at || a.ends_at.slice(0,10) >= period.startsOn));
    const occupancy = new Map(meters.occupancy.map(o => [o.reading_id, o]));
    // Each utility may have more than one meter/replacement; the most recent
    // reading alone is NOT enough to support safe usage-based billing.
    const hasEvidence = assignments.length > 0 && assignments.every(a => {
      const readings = meters.readings.filter(r => r.assignment_id === a.id && r.meter_id === a.meter_id &&
        occupancy.get(r.id)?.stay_id === stay.id && occupancy.get(r.id)?.site_id === site.id);
      return [period.startsOn, period.endsOn].every(day => readings.some(r =>
        occupancy.get(r.id)?.captured_on === day &&
        latestReview(r.id, meters.reviews)?.decision === 'accepted'));
    });
    items.push({
      label: utility + ' boundary readings',
      state: hasEvidence ? 'ok' : 'check',
      note: hasEvidence ? 'Approved boundary captures found; billing checks exceptions and complete history'
        : assignments.length ? 'Review opening/closing readings or meter replacements for each assignment'
          : 'No matching meter assignment for this billing period',
    });
  }
  return items;
}
