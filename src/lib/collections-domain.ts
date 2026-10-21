import type { Invoice, InvoiceRevision } from './billing-domain';
export type PaymentMethod = 'cash' | 'check' | 'bank_transfer' | 'external_card' | 'other';
export const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'external_card', label: 'Card processed elsewhere (reference only)' },
  { value: 'other', label: 'Other (reference required)' },
];
export interface CollectionPolicy {
  id: string;
  property_id: string;
  created_at: string;
  manual_issuance_enabled: boolean;
  grace_days: number;
  fees_enabled: boolean;
  fee_flat_cents: string;
  fee_bps: number;
  fee_cap_cents: string;
  fee_tax_bps: number;
  fee_tax_label: string;
  deposit_deductions_enabled: boolean;
  authorization_reference: string;
  reason: string;
}
export interface CollectionHistory {
  id: string;
  source: 'payment' | 'deposit';
  source_id: string;
  kind: string;
  amount_cents: string;
  effective_on: string;
  reference: string;
  reason: string;
}
export interface CollectionAccount {
  invoice_id: string;
  property_id: string;
  customer_id: string;
  number: string;
  issued_on: string | null;
  due_on: string | null;
  grace_days: number | null;
  grace_ends_on: string | null;
  as_of: string;
  adjusted_cents: string;
  allocated_cents: string;
  outstanding_cents: string;
  days_past_due: number;
  state: 'draft' | 'approved_unissued' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'voided';
  aging_bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus' | null;
  history: CollectionHistory[];
}
interface Base {
  id: string;
  property_id: string;
  created_at: string;
  created_by: string;
}
export interface ManualPayment extends Base {
  customer_id: string;
  amount_cents: string;
  received_on: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  corrects_payment_id: string | null;
}
export interface PaymentEvent extends Base {
  customer_id: string;
  payment_id: string;
  invoice_id: string | null;
  kind: 'allocation' | 'allocation_reversal' | 'refund' | 'refund_reversal' | 'void';
  amount_cents: string;
  effective_on: string;
  method: PaymentMethod | null;
  reverses_id: string | null;
  reference: string;
  reason: string;
}
export interface DepositAccount extends Base {
  customer_id: string;
  kind: 'security' | 'reservation';
  label: string;
  stay_id: string | null;
  reservation_id: string | null;
  reference: string;
  reason: string;
}
export interface DepositEvent extends Base {
  customer_id: string;
  deposit_id: string;
  invoice_id: string | null;
  kind: 'received' | 'returned' | 'applied' | 'deduction' | 'reversal';
  amount_cents: string;
  effective_on: string;
  method: PaymentMethod | null;
  reverses_id: string | null;
  reference: string;
  reason: string;
}
export interface CollectionReceipt extends Base {
  organization_id: string;
  customer_id: string;
  number: string;
  source_kind: 'payment' | 'payment_event' | 'deposit_event';
  source_id: string;
  snapshot: {
    currency: 'USD';
    kind: string;
    amount_cents: string;
    effective_on: string;
    method: PaymentMethod | null;
    reference: string;
    notes: string;
    source: {
      id: string;
      payment_id?: string;
      deposit_id?: string;
      invoice_id?: string | null;
      reverses_id?: string | null;
      corrects_payment_id?: string | null;
    };
    property: { name: string; address: string; city: string; state: string; postal_code: string };
    customer: { name: string; mailing_address: string; email: string };
  };
}
export interface ReceiptStatement {
  receipt: CollectionReceipt;
  history: PaymentEvent[];
  available_cents: string | null;
  voided: boolean;
}
export interface FeeAssessment extends Base {
  invoice_id: string;
  fee_invoice_id: string;
  policy_id: string;
  assessed_on: string;
  basis_cents: string;
  fee_cents: string;
  reason: string;
}
export interface FeeWaiver extends Base {
  assessment_id: string;
  credit_entry_id: string;
  reason: string;
}
export interface AccountNote extends Base {
  customer_id: string;
  invoice_id: string | null;
  kind: 'note' | 'arrangement' | 'resolution';
  body: string;
  follow_up_on: string | null;
  promised_on: string | null;
  promised_amount_cents: string | null;
  resolves_id: string | null;
}
export interface CashSource {
  source_key: string;
  property_id: string;
  customer_id: string;
  effective_on: string;
  method: PaymentMethod;
  amount_cents: string;
  reference: string;
  label: string;
}
export interface ReconciliationPreview {
  starts_on: string;
  ends_on: string;
  method: PaymentMethod | 'all';
  opening_cents: string;
  closing_cents: string;
  net_cents: string;
  expected_closing_cents: string;
  variance_cents: string;
  sources: CashSource[];
  source_count: number;
  carried_forward_count: number;
}
export interface Reconciliation extends Base {
  starts_on: string;
  ends_on: string;
  method: PaymentMethod | 'all';
  opening_cents: string;
  closing_cents: string;
  net_cents: string;
  variance_cents: string;
  snapshot: ReconciliationPreview;
  statement_reference: string;
  reason: string;
  variance_reason: string;
}
export interface ReconciliationVoid extends Base {
  reconciliation_id: string;
  reason: string;
}
export interface CollectionSummary {
  accounts: CollectionAccount[];
  cash: CashSource[];
  payments: {
    id: string;
    available_cents: string;
    allocated_cents: string;
    refunded_cents: string;
    voided: boolean;
  }[];
  deposits: { id: string; held_cents: string }[];
}
export interface CollectionsSnapshot {
  policies: CollectionPolicy[];
  payments: ManualPayment[];
  paymentEvents: PaymentEvent[];
  deposits: DepositAccount[];
  depositEvents: DepositEvent[];
  receipts: CollectionReceipt[];
  fees: FeeAssessment[];
  waivers: FeeWaiver[];
  notes: AccountNote[];
  reconciliations: Reconciliation[];
  reconciliationVoids: ReconciliationVoid[];
  summary: CollectionSummary;
  invoices: Invoice[];
  revisions: InvoiceRevision[];
}
export const stateLabel = (value: string) => value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
export function collectionDollars(value: string, signed = false): string {
  if (!(signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/).test(value.trim()))
    throw new Error('Enter dollars with at most two decimal places.');
  const raw = value.trim();
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const amount = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (amount > 999999999999n || amount < -999999999999n)
    throw new Error('Amount exceeds the supported limit.');
  return amount.toString();
}
export function agingTotals(accounts: CollectionAccount[]) {
  const result = { current: 0n, '1_30': 0n, '31_60': 0n, '61_90': 0n, '90_plus': 0n };
  for (const account of accounts)
    if (account.aging_bucket) result[account.aging_bucket] += BigInt(account.outstanding_cents);
  return result;
}
export function openFollowups(notes: AccountNote[], today: string) {
  const resolved = new Set(notes.map((n) => n.resolves_id).filter(Boolean));
  return notes.filter(
    (n) =>
      n.kind !== 'resolution' &&
      !resolved.has(n.id) &&
      ((n.follow_up_on && n.follow_up_on <= today) || (n.promised_on && n.promised_on <= today))
  );
}
