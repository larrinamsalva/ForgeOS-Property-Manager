import type { Site, Stay } from './domain';
import { addDays, calendarMonth } from './domain';
import type { BillingSnapshot, Invoice, InvoiceRevision } from './billing-domain';
import type { MeterSnapshot } from './meter-domain';
import { siteBillingChecklist, type BillingChecklistItem, type BillingPeriodSuggestion } from './site-billing-prep';

export type MonthlyRunStatus = 'existing' | 'review' | 'ready';
export type MonthlyInvoiceStage = 'none' | 'draft' | 'approved_unissued' | 'issued' | 'mixed';
export function classifyMonthlyInvoices(
  invoices: { status: Invoice['status']; issued: boolean }[],
): MonthlyInvoiceStage {
  if (!invoices.length) return 'none';
  const stages = new Set(invoices.filter(invoice => invoice.status !== 'voided').map(invoice => invoice.issued ? 'issued' :
    invoice.status === 'approved' ? 'approved_unissued' : 'draft'));
  if (!stages.size) return 'none';
  return stages.size === 1 ? [...stages][0] as MonthlyInvoiceStage : 'mixed';
}
export function invoiceStageLabel(stage: MonthlyInvoiceStage): string {
  return {
    none: 'No invoice', draft: 'Draft awaiting approval',
    approved_unissued: 'Approved, awaiting issuance',
    issued: 'Issued', mixed: 'Mixed invoice stages',
  }[stage];
}
export interface MonthlyRunRow {
  siteId: string;
  siteLabel: string;
  stayId: string;
  customerId: string;
  period: BillingPeriodSuggestion;
  status: MonthlyRunStatus;
  invoiceStage: MonthlyInvoiceStage;
  checklist: BillingChecklistItem[];
  warnings: string[];
  invoices: { id: string; number: string; status: Invoice['status']; totalCents: string | null; issued: boolean }[];
}
export function suggestedMonthPeriod(
  stay: Pick<Stay, 'starts_on' | 'ends_on'>,
  month: string, today: string, dueDays: number,
): BillingPeriodSuggestion | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const monthStart = month + '-01';
  const monthEnd = calendarMonth(monthStart, 1);
  const startsOn = stay.starts_on > monthStart ? stay.starts_on : monthStart;
  const endsOn = stay.ends_on && stay.ends_on < monthEnd ? stay.ends_on : monthEnd;
  if (startsOn >= endsOn) return null;
  return { startsOn, endsOn, dueOn: addDays(endsOn, dueDays), isFutureClosing: endsOn > today };
}
// Account and rate data is read-only. This is not an invoice calculator or an
// approval gate. The database remains the authority for invoice eligibility.
export function monthlyBillingRun(
  propertyId: string,
  month: string,
  today: string,
  sites: Site[],
  stays: Stay[],
  billing: Pick<BillingSnapshot, 'policies' | 'rates' | 'invoices' | 'revisions' | 'accounts'>,
  meters: Pick<MeterSnapshot, 'meters' | 'assignments' | 'readings' | 'reviews' | 'occupancy'> | null,
): MonthlyRunRow[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const siteById = new Map(sites.filter(s => s.property_id === propertyId).map(s => [s.id, s]));
  const revisionById = new Map(billing.revisions.map((r: InvoiceRevision) => [r.id, r]));
  const accountByInvoice = new Map(billing.accounts.map(a => [a.invoice_id, a]));
  const policies = billing.policies.filter(p => p.property_id === propertyId)
    .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const dueDays = policies[0]?.due_days ?? 15;
  return stays.filter(stay => stay.property_id === propertyId && siteById.has(stay.site_id))
    .flatMap(stay => {
      const site = siteById.get(stay.site_id)!;
      const period = suggestedMonthPeriod(stay, month, today, dueDays);
      if (!period) return [];
      const checklist = siteBillingChecklist(site, stay, period, billing, meters);
      const invoices = billing.invoices.filter(i => i.property_id === propertyId &&
        i.site_id === site.id && i.stay_id === stay.id && i.status !== 'voided' &&
        i.starts_on < period.endsOn && i.ends_on > period.startsOn)
        .map(i => ({
          id:i.id, number:i.number, status:i.status,
          totalCents:revisionById.get(i.current_revision_id)?.total_cents ?? null,
          issued:!!accountByInvoice.get(i.id)?.issued_on,
        }));
      const warnings = checklist.filter(c => c.state === 'check').map(c => c.label);
      if (stay.billing_period !== 'monthly')
        warnings.push('Non-monthly agreement: verify rent cadence');
      if (site.archived_at) warnings.push('Archived site');
      const status: MonthlyRunStatus = invoices.length ? 'existing'
        : warnings.length ? 'review' : 'ready';
      return [{
        siteId:site.id, siteLabel:site.label, stayId:stay.id, customerId:stay.customer_id,
        period, status, invoiceStage:classifyMonthlyInvoices(invoices), checklist, warnings, invoices,
      }];
    }).sort((a, b) => a.siteLabel.localeCompare(b.siteLabel,undefined,{numeric:true}) ||
      a.period.startsOn.localeCompare(b.period.startsOn) ||
      a.stayId.localeCompare(b.stayId));
}
