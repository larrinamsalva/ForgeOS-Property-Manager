import type { CollectionsSnapshot } from './collections-domain';
import { cents } from './billing-domain';

export interface OverdueReminderRow {
  invoiceId: string;
  number: string;
  dueOn: string;
  outstandingCents: string;
  daysPastDue: number;
}
export type ReminderStyle = 'friendly' | 'past_due';

export function customerOverdueReminders(
  data: Pick<CollectionsSnapshot, 'invoices' | 'summary'>,
  propertyId: string,
  customerId: string,
): OverdueReminderRow[] {
  const invoices = new Map(data.invoices.filter(i =>
    i.property_id === propertyId && i.customer_id === customerId &&
    i.status === 'approved').map(i => [i.id, i]));
  return data.summary.accounts.flatMap(account => {
    if (account.property_id !== propertyId || account.customer_id !== customerId ||
      account.state !== 'overdue' || !account.issued_on ||
      !/^[0-9]+$/.test(account.outstanding_cents) ||
      BigInt(account.outstanding_cents) <= 0n) return [];
    const invoice = invoices.get(account.invoice_id);
    if (!invoice) return [];
    return [{
      invoiceId: invoice.id,
      number: invoice.number,
      dueOn: account.due_on ?? invoice.due_on,
      outstandingCents: account.outstanding_cents,
      daysPastDue: account.days_past_due,
    }];
  }).sort((a,b) => a.dueOn.localeCompare(b.dueOn) ||
    a.number.localeCompare(b.number));
}
export function overdueReminderTotal(rows: OverdueReminderRow[]): string {
  return rows.reduce((sum,row)=>sum + BigInt(row.outstandingCents),0n).toString();
}
export function draftOverdueReminder({
  style, propertyName, residentName, rows,
}: {
  style: ReminderStyle;
  propertyName: string;
  residentName: string;
  rows: OverdueReminderRow[];
}): string {
  if (!rows.length) return '';
  const detail = rows.map(row => '- ' + row.number + ': ' + cents(row.outstandingCents) +
    ' outstanding; due ' + row.dueOn).join('\n');
  const opening = style === 'friendly' ?
    'We are checking in about a balance showing on your resident account.' :
    'Our records show an unpaid balance on the following issued invoice(s).';
  return [
    'Hello ' + residentName + ',',
    '',
    opening,
    detail,
    '',
    'Total outstanding on these overdue invoices: ' + cents(overdueReminderTotal(rows)) + '.',
    '',
    'If you have already made a payment, please contact the property office so we can verify and update the records. If you would like to discuss a payment arrangement or have a question about the balance, please contact us.',
    '',
    'Thank you,',
    propertyName,
  ].join('\n');
}
