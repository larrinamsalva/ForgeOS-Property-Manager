import { csv } from './domain';
import { invoiceStageLabel, type MonthlyRunRow } from './monthly-billing-run';
import { cents } from './billing-domain';

// A manager-initiated, read-only export of the *currently visible* billing
// run. Protects spreadsheet formulas through the shared CSV escaping helper;
// never substitutes a quoted/precheck charge for a posted invoice amount.
export function monthlyBillingCsv(
  property: string,
  month: string,
  rows: MonthlyRunRow[],
  names: Map<string, string>,
): string {
  const headings = [
    'Property', 'Billing month', 'Site / unit', 'Resident',
    'Stay ID', 'Period begins', 'Period ends (exclusive)', 'Planned due date',
    'Readiness', 'Invoice follow-up', 'Warnings to review', 'Checklist details',
    'Invoice numbers', 'Invoice states', 'Recorded invoice totals (USD)',
  ];
  const values = rows.map(row => {
    const states = row.invoices.map(invoice => invoice.issued ? 'Issued' :
      invoice.status === 'approved' ? 'Approved, unissued' :
      invoice.status === 'draft' ? 'Draft' : invoice.status);
    const totals = row.invoices.map(invoice =>
      invoice.totalCents === null ? 'Not available' : cents(invoice.totalCents));
    return [
      property,
      month,
      row.siteLabel,
      names.get(row.customerId) ?? 'Unknown resident',
      row.stayId,
      row.period.startsOn,
      row.period.endsOn,
      row.period.dueOn,
      row.status === 'ready' ? 'Precheck clear' :
        row.status === 'review' ? 'Needs review' : 'Existing invoice',
      invoiceStageLabel(row.invoiceStage),
      row.warnings.join('; '),
      row.checklist.filter(item => item.state === 'check').map(item =>
        item.label + ': ' + item.note).join('; '),
      row.invoices.map(invoice => invoice.number).join('; '),
      states.join('; '),
      totals.join('; '),
    ];
  });
  return '\uFEFF' + csv([headings, ...values]) + '\r\n';
}
