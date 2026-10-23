import type { Invoice } from './billing-domain';
import type { CollectionAccount } from './collections-domain';
import type { Property, Stay } from './domain';
import { dateAtProperty } from './domain';

export interface SiteOverdueFlag {
  siteId: string;
  customerId: string;
  invoiceCount: number;
  outstandingCents: string;
  earliestDueOn: string | null;
  maxDaysPastDue: number | null;
}

// A site is flagged only for an issued, overdue invoice belonging to the
// CURRENT occupant's matching stay. This prevents a previous occupant's debt
// being displayed as the next resident's balance. No flags are guessed from
// calendar dates, rent prices, drafts or unissued invoices.
export function siteOverdueFlags(
  accounts: (Pick<CollectionAccount, 'invoice_id' | 'customer_id' | 'property_id' | 'outstanding_cents' | 'state'> &
    Partial<Pick<CollectionAccount, 'due_on' | 'days_past_due' | 'issued_on'>>)[],
  invoices: Pick<Invoice, 'id' | 'property_id' | 'site_id' | 'stay_id' | 'customer_id' | 'status'>[],
  stays: Pick<Stay, 'id' | 'property_id' | 'site_id' | 'customer_id' | 'starts_on' | 'ends_on'>[],
  properties: Pick<Property, 'id' | 'timezone'>[],
  now = new Date()
): Record<string, SiteOverdueFlag> {
  const todayByProperty = new Map(properties.map((property) =>
    [property.id, dateAtProperty(property.timezone || 'America/Los_Angeles', now)]));
  const currentStays = new Map(stays.filter((stay) => {
    const today = todayByProperty.get(stay.property_id);
    return !!today && stay.starts_on <= today && (!stay.ends_on || stay.ends_on > today);
  }).map((stay) => [stay.id, stay]));
  const byInvoice = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const flags: Record<string, SiteOverdueFlag> = {};
  for (const account of accounts) {
    if (account.state !== 'overdue' || !/^\d+$/.test(account.outstanding_cents) ||
      BigInt(account.outstanding_cents) <= 0n) continue;
    const invoice = byInvoice.get(account.invoice_id);
    if (!invoice || invoice.status !== 'approved' ||
      invoice.customer_id !== account.customer_id ||
      invoice.property_id !== account.property_id) continue;
    const currentStay = currentStays.get(invoice.stay_id);
    if (!currentStay || currentStay.site_id !== invoice.site_id ||
      currentStay.property_id !== invoice.property_id ||
      currentStay.customer_id !== account.customer_id) continue;
    const prior = flags[invoice.site_id];
    // Historical debt is sourced only from the verified ledger. Do not infer
    // a due date from the calendar or a site's monthly rate.
    const dueOn = account.due_on && /^\d{4}-\d{2}-\d{2}$/.test(account.due_on)
      ? account.due_on : null;
    const pastDueDays = Number.isSafeInteger(account.days_past_due) &&
      (account.days_past_due ?? 0) >= 0 ? account.days_past_due! : null;
    flags[invoice.site_id] = {
      siteId: invoice.site_id,
      customerId: account.customer_id,
      invoiceCount: (prior?.invoiceCount ?? 0) + 1,
      outstandingCents: ((prior ? BigInt(prior.outstandingCents) : 0n) +
        BigInt(account.outstanding_cents)).toString(),
      earliestDueOn: dueOn && prior?.earliestDueOn
        ? (dueOn < prior.earliestDueOn ? dueOn : prior.earliestDueOn)
        : dueOn ?? prior?.earliestDueOn ?? null,
      maxDaysPastDue: pastDueDays !== null && prior?.maxDaysPastDue !== null &&
        prior?.maxDaysPastDue !== undefined ? Math.max(pastDueDays, prior.maxDaysPastDue)
        : pastDueDays ?? prior?.maxDaysPastDue ?? null,
    };
  }
  return flags;
}
