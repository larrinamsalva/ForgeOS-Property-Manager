/**
 * Fictional guest-demo rent indicator. In the authenticated workspace the
 * canonical source must be issued invoice / actual payment ledger balances,
 * not this illustration. A red flag appears only AFTER the fifth.
 */
export function rentMonthKey(day: string): string {
  return day.slice(0, 7);
}
export function isRentPastDue(day: string, occupied: boolean, paid: boolean): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !occupied || paid) return false;
  return day.slice(8, 10) > '05';
}
export function demoRentStatus(day: string, occupied: boolean, paid: boolean): 'past_due' | 'paid' | 'pending' | 'not_applicable' {
  if (!occupied) return 'not_applicable';
  if (paid) return 'paid';
  return isRentPastDue(day, true, false) ? 'past_due' : 'pending';
}
export function demoPropertyToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}
export type DemoNoticeKind = 'payment_reminder' | 'past_due_warning' | 'late_fee_review' | 'three_day_legal_review';
export const demoNoticeOptions: { value: DemoNoticeKind; label: string }[] = [
  { value: 'payment_reminder', label: 'Payment reminder' },
  { value: 'past_due_warning', label: 'Past-due warning' },
  { value: 'late_fee_review', label: 'Late-fee review' },
  { value: 'three_day_legal_review', label: '3-day pay-or-quit — legal review' },
];
export interface DemoNoticeDraft {
  id: number;
  siteId: string;
  customerId: number;
  month: string;
  kind: DemoNoticeKind;
  message: string;
  preparedOn: string;
  phone: string;
}
/** These are communication drafts, NEVER legal notices or SMS sends. */
export function demoNoticeText(kind: DemoNoticeKind, name: string, site: string, month: string, rent: number): string {
  const intro = 'Sample draft for ' + name + ' at ' + site + ' — ' + month + '. ';
  const amount = '$' + rent.toFixed(2);
  if (kind === 'payment_reminder') return intro + 'A rent payment of ' + amount + ' is due by the 5th. Please contact the office if you have questions.';
  if (kind === 'past_due_warning') return intro + 'Our sample records show rent of ' + amount + ' has not been marked paid after the 5th. Please contact the office to review the balance or payment arrangement.';
  if (kind === 'late_fee_review') return intro + 'Internal staff review only: verify the lease, local rules, grace period, actual issued invoice and permitted late fee. This is not a fee assessment or customer message.';
  return intro + 'INTERNAL LEGAL REVIEW ONLY — Not a notice to serve or text. Verify the lease, jurisdiction, exact rent-only unpaid amount, legally required wording, service method, calendar exclusions and proof of service with a qualified professional. Late fees and utilities must never be included in a California 3-day rent demand.';
}
