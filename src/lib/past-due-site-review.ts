import type { SiteOverdueFlag } from './site-overdue';
import type { Customer, Property, Site, Stay } from './domain';
import { customerName, dateAtProperty, isCurrentStay, csv } from './domain';
import { cents } from './billing-domain';

export interface PastDueSiteReviewRow {
  siteId: string;
  siteLabel: string;
  propertyId: string;
  propertyName: string;
  customerId: string;
  resident: string;
  invoiceCount: number;
  outstandingCents: string;
  earliestDueOn: string | null;
  maxDaysPastDue: number | null;
}

// Authorized collection balances are resolved by siteOverdueFlags before
// reaching this function. Recheck current occupancy + customer/property match
// to prevent stale or cross-property flags in operational review lists.
export function pastDueSiteReviewRows(
  sites: Site[],
  flags: Record<string, SiteOverdueFlag>,
  stays: Stay[],
  customers: Customer[],
  properties: Property[],
  now = new Date(),
): PastDueSiteReviewRow[] {
  const propertyById = new Map(properties.map(p => [p.id, p]));
  const propertyDays = new Map(properties.map(p =>
    [p.id, dateAtProperty(p.timezone || 'America/Los_Angeles', now)]));
  const customersById = new Map(customers.map(c => [c.id, c]));
  return sites.flatMap(site => {
    if (site.archived_at) return [];
    const flag = flags[site.id];
    const today = propertyDays.get(site.property_id);
    if (!flag || !today || flag.siteId !== site.id ||
      !/^[0-9]+$/.test(flag.outstandingCents) ||
      BigInt(flag.outstandingCents) <= 0n || flag.invoiceCount <= 0) return [];
    const occupants = stays.filter(stay => stay.property_id === site.property_id &&
      stay.site_id === site.id && isCurrentStay(stay, today));
    if (occupants.length !== 1 || occupants[0].customer_id !== flag.customerId) return [];
    const customer = customersById.get(flag.customerId);
    if (!customer || customer.property_id !== site.property_id || customer.archived_at) return [];
    return [{
      siteId: site.id, siteLabel: site.label, propertyId: site.property_id,
      propertyName: propertyById.get(site.property_id)?.name ?? 'Property',
      customerId: flag.customerId, resident: customerName(customer),
      invoiceCount: flag.invoiceCount, outstandingCents: flag.outstandingCents,
      earliestDueOn: flag.earliestDueOn, maxDaysPastDue: flag.maxDaysPastDue,
    }];
  }).sort((a,b) => {
    const difference = BigInt(b.outstandingCents) - BigInt(a.outstandingCents);
    return (difference > 0n ? 1 : difference < 0n ? -1 : 0) ||
      a.siteLabel.localeCompare(b.siteLabel, undefined, {numeric:true});
  });
}

/** Exports only manager-visible, current-occupant rows; no contact details. */
export function pastDueSiteReviewCsv(records: PastDueSiteReviewRow[]): string {
  return '\uFEFF' + csv([
    ['Property', 'Site / unit', 'Resident', 'Issued overdue invoices',
      'Recorded earliest due date', 'Maximum days past due', 'Verified outstanding (USD)'],
    ...records.map(row => [
      row.propertyName, row.siteLabel, row.resident, row.invoiceCount,
      row.earliestDueOn ?? 'Not available',
      row.maxDaysPastDue ?? 'Not available',
      cents(row.outstandingCents),
    ]),
  ]) + '\r\n';
}
