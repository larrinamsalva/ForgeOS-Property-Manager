import type { MeterSnapshot, Meter, MeterAssignment, MeterReading } from './meter-domain';
import { latestReview } from './meter-domain';
import type { BillingSnapshot } from './billing-domain';

export type UtilityKind = 'electric' | 'water' | 'gas';
export const utilityKinds: UtilityKind[] = ['electric', 'water', 'gas'];
export interface SiteMeterSummary {
  meterId: string;
  meterLabel: string;
  unit: string;
  multiplier: string;
  latestApproved: string | null;
  latestOn: string | null;
  previousApproved: string | null;
  previousOn: string | null;
  scaledUsage: string | null;
  notice: string;
}
export interface SiteUtilitySummary {
  kind: UtilityKind;
  available: boolean;
  meters: SiteMeterSummary[];
  lastIssued: { invoiceId: string; invoiceNumber: string; startsOn: string; endsOn: string; amountCents: string } | null;
  billedStatus: 'unavailable' | 'none' | 'billed' | 'included';
}

// Exact six-decimal scaled register arithmetic. No IEEE floating-point money
// or usage and no attempt to calculate tiered utility charges outside billing.
function sixDecimal(value: string): bigint | null {
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(value)) return null;
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
function scaledString(value: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  return whole.toString() + (fraction ? '.' + fraction : '');
}
function entryFor(
  meter: Meter, assignment: MeterAssignment,
  data: Pick<MeterSnapshot, 'readings' | 'reviews' | 'occupancy'>,
  currentStayId?: string
): SiteMeterSummary {
  const occupancyByReading = new Map(data.occupancy.map(o => [o.reading_id, o]));
  const active = data.readings.filter(r =>
    r.assignment_id === assignment.id && r.meter_id === meter.id &&
    r.property_id === meter.property_id &&
    (!currentStayId || occupancyByReading.get(r.id)?.stay_id === currentStayId)
  ).sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.id.localeCompare(a.id));
  const accepted = active.flatMap((reading: MeterReading) => {
    const review = latestReview(reading.id, data.reviews);
    return review?.decision === 'accepted' && (review.corrected_value ?? reading.value)
      ? [{ reading, value: review.corrected_value ?? reading.value ?? '' }] : [];
  });
  const [latest, previous] = accepted;
  const notice = !currentStayId ? 'No current stay: historical readings only'
    : !active.length ? 'No reading recorded for current stay'
    : latest && active[0]?.id !== latest.reading.id ? 'New reading awaiting supervisor review'
    : !latest ? 'Awaiting an approved reading'
    : !previous ? 'Need a second approved reading'
    : '';
  let scaledUsage: string | null = null;
  let reason = notice;
  if (currentStayId && latest && previous) {
    const current = sixDecimal(latest.value), before = sixDecimal(previous.value),
      multiplier = sixDecimal(meter.multiplier);
    const flags = [...(latest.reading.exceptions ?? []), ...(previous.reading.exceptions ?? [])]
      .join(' ').toLowerCase();
    const reset = /reset|rollover|replacement/.test(
      flags + ' ' + latest.reading.kind + ' ' + previous.reading.kind +
      ' ' + latest.reading.flag + ' ' + previous.reading.flag
    );
    if (current === null || before === null || multiplier === null) reason = 'Review register precision';
    else if (current < before || reset) reason = 'Reset or rollover: calculate in billing';
    else if (meter.max_delta && sixDecimal(meter.max_delta) !== null &&
      current - before > sixDecimal(meter.max_delta)!) reason = 'Unusual change: calculate in billing';
    else {
      scaledUsage = scaledString((current - before) * multiplier, 12);
      reason = notice || 'Approved register change (not a bill)';
    }
  }
  return {
    meterId: meter.id, meterLabel: meter.label, unit: meter.unit,
    multiplier: meter.multiplier, latestApproved: latest?.value ?? null,
    latestOn: latest?.reading.captured_at ?? null,
    previousApproved: previous?.value ?? null,
    previousOn: previous?.reading.captured_at ?? null,
    scaledUsage, notice: reason,
  };
}

// Only invoices for the current STAY, issued to customers, approved and not
// voided can supply charged amounts. Always use billing's authoritative
// calculation and line-level taxes/base fees instead of ad hoc prices.
export function siteUtilitySummaries(
  data: Pick<MeterSnapshot, 'meters' | 'assignments' | 'readings' | 'reviews' | 'occupancy'>,
  siteId: string,
  enabled: Record<UtilityKind, boolean>,
  currentStayId?: string,
  billing?: Pick<BillingSnapshot, 'invoices' | 'revisions' | 'accounts'>
): SiteUtilitySummary[] {
  const meterById = new Map(data.meters.map(m => [m.id, m]));
  const assignments = data.assignments.filter(a => a.site_id === siteId && !a.ends_at &&
    meterById.get(a.meter_id)?.property_id === a.property_id);
  const accounts = new Map(billing?.accounts.map(a => [a.invoice_id, a]) ?? []);
  const issued = currentStayId && billing ? billing.invoices.filter(i =>
    i.site_id === siteId && i.stay_id === currentStayId && i.status === 'approved' &&
    !!accounts.get(i.id)?.issued_on &&
    ['issued', 'partially_paid', 'paid', 'overdue'].includes(accounts.get(i.id)!.state)
  ).sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.created_at.localeCompare(a.created_at)) : [];
  const invoice = issued[0];
  const revision = invoice && billing?.revisions.find(r => r.id === invoice.current_revision_id);
  return utilityKinds.map(kind => {
    const rows = assignments.filter(a => meterById.get(a.meter_id)?.utility === kind)
      .map(a => entryFor(meterById.get(a.meter_id)!, a, data, currentStayId));
    // Only claim billed charge when an actual issued line exists in the selected
    // invoice; zero charges may mean utility is included in rent.
    const lines = revision?.calculation.lines.filter(line => line.category === kind) ?? [];
    const amount = lines.reduce((sum, line) => sum + BigInt(line.total_cents), 0n).toString();
    const lastIssued = invoice && revision && lines.length
      ? { invoiceId: invoice.id, invoiceNumber: invoice.number,
          startsOn: invoice.starts_on, endsOn: invoice.ends_on, amountCents: amount } : null;
    return {
      kind, available: enabled[kind], meters: rows,
      lastIssued, billedStatus: !billing ? 'unavailable'
        : !lines.length ? 'none'
        : lines.some(line => line.description.includes('included in rent')) ? 'included' : 'billed',
    };
  });
}
