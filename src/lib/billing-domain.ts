export interface BillingPolicy {
  id: string;
  property_id: string;
  proration: string;
  due_days: number;
  rent_tax_bps: number;
  tax_label: string;
  authorization_reference: string;
  reason: string;
  created_at: string;
}
export interface RatePlan {
  id: string;
  property_id: string;
  utility: 'electric' | 'water' | 'gas';
  label: string;
  starts_on: string;
  ends_on: string | null;
  status: string;
  billed_unit: string;
  conversions: { unit: string; factor: string }[];
  tiers: { up_to: string | null; unit_price: string }[];
  monthly_base_cents: string;
  sewer_unit_price: string;
  sewer_base_cents: string;
  tax_bps: number;
  tax_label: string;
  authorization_reference: string;
  included_in_rent: boolean;
  reason: string;
}
export interface RegisterEvent {
  id: string;
  property_id: string;
  reading_id: string;
  review_id: string;
  kind: string;
  before_value: string | null;
  after_value: string | null;
  rollover_count: number | null;
  reason: string;
  status: string;
  void_reason: string;
}
export interface BillingSource {
  id: string;
  property_id: string;
  review_id: string;
  value: string;
  flag: string;
  captured_at: string;
  meter_label: string;
  site_label: string;
}
export interface BillingSegment {
  assignment_id: string;
  delta: string;
  multiplier: string;
  conversion_factor: string;
  quantity: string;
  unit: string;
  from_reading: { id: string; captured_at: string; effective_value: string; review_id: string; kind: string };
  to_reading: { id: string; captured_at: string; effective_value: string; review_id: string; kind: string };
  meter: { id: string; label: string; serial_number: string; unit: string };
  register_event: RegisterEvent | null;
}
export interface BillingLine {
  category: string;
  description: string;
  quantity: string;
  unit: string;
  subtotal_cents: string;
  tax_bps: number;
  tax_cents: string;
  total_cents: string;
  source: { rate?: RatePlan; segments?: BillingSegment[]; tax_label?: string; [key: string]: unknown };
}
export interface Calculation {
  currency: 'USD';
  starts_on: string;
  ends_on: string;
  due_on: string;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    timezone: string;
  };
  customer: { id: string; name: string; mailing_address: string; email: string };
  site: { id: string; label: string };
  lines: BillingLine[];
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  reading_ids: string[];
  rate_ids: string[];
  rounding: string;
  utilities_reason: string;
  rent_reason: string;
}
export interface Invoice {
  organization_id: string;
  id: string;
  property_id: string;
  customer_id: string;
  site_id: string;
  stay_id: string;
  number: string;
  starts_on: string;
  ends_on: string;
  due_on: string;
  status: 'draft' | 'approved' | 'voided';
  current_revision_id: string;
  approval_reason: string;
  approved_at: string | null;
  approved_by: string | null;
  void_reason: string;
  created_at: string;
}
export interface InvoiceRevision {
  id: string;
  invoice_id: string;
  property_id: string;
  revision: number;
  calculation: Calculation;
  total_cents: string;
  reason: string;
  created_at: string;
}
export interface LedgerEntry {
  id: string;
  property_id: string;
  customer_id: string;
  invoice_id: string;
  kind: 'approval' | 'credit' | 'credit_reversal' | 'void';
  amount_cents: string;
  reverses_id: string | null;
  reason: string;
  reference: string;
  created_at: string;
  created_by: string;
}
export interface BillingSnapshot {
  accounts: import('./collections-domain').CollectionAccount[];
  policies: BillingPolicy[];
  rates: RatePlan[];
  events: RegisterEvent[];
  sources: BillingSource[];
  invoices: Invoice[];
  revisions: InvoiceRevision[];
  ledger: LedgerEntry[];
}
export function cents(value: string | number | bigint): string {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  return `${negative ? '-' : ''}$${(absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
export function dollarsToCents(value: string): string {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('Use dollars with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
}
export function ledgerBalance(
  entries: Pick<LedgerEntry, 'invoice_id' | 'amount_cents'>[],
  invoiceId?: string
): string {
  return entries
    .filter((e) => !invoiceId || e.invoice_id === invoiceId)
    .reduce((sum, e) => sum + BigInt(e.amount_cents), 0n)
    .toString();
}
export interface BillingStatement {
  collection?: import('./collections-domain').CollectionAccount;
  invoice: Invoice;
  revision: InvoiceRevision;
  ledger: LedgerEntry[];
}
