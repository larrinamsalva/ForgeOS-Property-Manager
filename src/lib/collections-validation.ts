import { z } from 'zod';
import { billingError } from './billing-validation';
const uuid = z.uuid(),
  reason = z.string().trim().min(3).max(2000),
  reference = z.string().trim().max(500);
const amount = z
  .string()
  .regex(/^[0-9]{1,12}$/)
  .refine((v) => /^[0-9]{1,12}$/.test(v) && BigInt(v) > 0n && BigInt(v) <= 999999999999n);
const zeroAmount = z.string().regex(/^[0-9]{1,12}$/);
const signed = z.string().regex(/^-?[0-9]{1,12}$/);
const method = z.enum(['cash', 'check', 'bank_transfer', 'external_card', 'other']);
const date = z.iso.date();
const scope = { organization_id: uuid, property_id: uuid, request_id: uuid };
const entry = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z.object({ command: z.literal(command), payload: z.object({ ...scope, ...shape }).strict() }).strict();
const recon = {
  starts_on: date,
  ends_on: date,
  method: z.enum(['all', 'cash', 'check', 'bank_transfer', 'external_card', 'other']),
  opening_cents: signed,
  closing_cents: signed,
  source_keys: z
    .array(z.string().regex(/^(payment|payment_event|deposit_event):[0-9a-f-]{36}$/))
    .min(1)
    .max(1000),
};
export const collectionsCommandSchema = z.discriminatedUnion('command', [
  entry('configure_collections', {
    manual_issuance_enabled: z.boolean(),
    grace_days: z.number().int().min(0).max(90),
    fees_enabled: z.boolean(),
    fee_flat_cents: zeroAmount,
    fee_bps: z.number().int().min(0).max(10000),
    fee_cap_cents: zeroAmount,
    fee_tax_bps: z.number().int().min(0).max(10000),
    fee_tax_label: z.string().max(100),
    deposit_deductions_enabled: z.boolean(),
    authorization_reference: z.string().trim().min(3).max(500),
    reason,
  }),
  entry('issue_invoice', { invoice_id: uuid, revision_id: uuid, issued_on: date, due_on: date, reason }),
  entry('record_payment', {
    customer_id: uuid,
    amount_cents: amount,
    received_on: date,
    method,
    reference,
    corrects_payment_id: uuid.nullable(),
    reason,
  }),
  entry('allocate_payment', {
    payment_id: uuid,
    invoice_id: uuid,
    amount_cents: amount,
    effective_on: date,
    reference,
    reason,
  }),
  entry('refund_payment', {
    payment_id: uuid,
    amount_cents: amount,
    effective_on: date,
    method,
    reference,
    reason,
  }),
  entry('reverse_payment_event', { event_id: uuid, effective_on: date, reference, reason }),
  entry('void_payment', { payment_id: uuid, effective_on: date, reference, reason }),
  entry('new_deposit', {
    customer_id: uuid,
    kind: z.enum(['security', 'reservation']),
    label: z.string().trim().min(1).max(120),
    stay_id: uuid.nullable(),
    reservation_id: uuid.nullable(),
    reference,
    reason,
  }),
  entry('record_deposit', {
    deposit_id: uuid,
    kind: z.enum(['received', 'returned', 'applied', 'deduction']),
    amount_cents: amount,
    effective_on: date,
    method: method.nullable(),
    invoice_id: uuid.nullable(),
    reference,
    reason,
  }),
  entry('reverse_deposit', { event_id: uuid, effective_on: date, reference, reason }),
  entry('prepare_fee', { invoice_id: uuid, reason }),
  entry('waive_fee', { assessment_id: uuid, amount_cents: amount, reason }),
  entry('account_note', {
    customer_id: uuid,
    invoice_id: uuid.nullable(),
    kind: z.enum(['note', 'arrangement', 'resolution']),
    body: reason,
    follow_up_on: date.nullable(),
    promised_on: date.nullable(),
    promised_amount_cents: amount.nullable(),
    resolves_id: uuid.nullable(),
  }),
  entry('preview_reconciliation', recon),
  entry('close_reconciliation', {
    ...recon,
    statement_reference: z.string().trim().min(3).max(500),
    reason,
    acknowledge_variance: z.boolean(),
    variance_reason: z.string().max(2000),
  }),
  entry('void_reconciliation', { reconciliation_id: uuid, reason }),
]);
export function collectionsError(code: string, message: string) {
  const messages: Record<string, string> = {
    zero_fee: 'The authorized fee calculation rounds to zero. No fee draft was created.',
    approved_fee_required: 'Approve the separate fee invoice before recording a waiver.',
    invalid_deposit_link: 'Choose a stay or reservation for this customer at this property.',
    invalid_deposit_reversal: 'Choose an original deposit event that has not been reversed.',
    invalid_payment_reversal: 'Choose an original allocation or refund that has not been reversed.',
    duplicate_reconciliation_source: 'Select each cash movement once.',
    collection_reason_required: 'Add a clear supporting reason for this financial record.',
    manual_issuance_not_configured:
      'An owner must explicitly enable manual invoice issuance in Collections policy.',
    financial_date_overdraw:
      'This transaction date would overdraw funds on an earlier day. Use a date after the funding receipt or reversal.',
    invalid_financial_date:
      'Use a date on or before today at the property, after the original transaction or invoice issuance.',
    duplicate_payment_reference:
      'This payment reference already exists. Review the receipt before recording another payment.',
    invalid_payment_correction: 'A correction must link a voided payment for this customer.',
    issued_invoice_required: 'Select an issued, approved invoice for this customer.',
    allocation_exceeds_balance:
      'The amount exceeds available funds or the invoice outstanding balance. Reload the records.',
    refund_exceeds_available: 'Unallocate funds before refunding more than the available payment balance.',
    payment_has_active_movements: 'Reverse all allocations and refunds before voiding this payment.',
    payment_voided: 'This payment is voided. Record a linked correction if necessary.',
    invoice_has_payments: 'Reverse payment allocations and deposit applications before voiding this invoice.',
    invoice_has_fee_drafts: 'Void the linked late fee invoices before voiding this invoice.',
    credit_exceeds_outstanding:
      'This credit exceeds the outstanding balance after payments and deposit applications.',
    refund_reference_required:
      'Choose the actual receipt or payout method and enter a reference for noncash transactions.',
    deposit_exceeds_held:
      'This action would make the held deposit negative. Review its applications and returns first.',
    duplicate_deposit_reference: 'This deposit receipt reference already exists.',
    deduction_not_configured: 'An owner must explicitly authorize deposit deductions in Collections policy.',
    deduction_fee_invoice_required:
      'A deduction requires a separate approved and issued fee invoice for this customer.',
    late_fees_not_configured: 'An owner must configure and authorize manual late fees before preparing one.',
    invoice_not_overdue:
      'A late fee requires an issued invoice with an outstanding balance after its grace period.',
    fee_on_fee_forbidden: 'Late fees cannot be assessed on another late fee.',
    fee_sources_changed: 'The balance or owner policy changed. Void this fee draft and prepare a new one.',
    invalid_arrangement:
      'Choose an issued invoice, a future promise date within one year, and an amount within the outstanding balance.',
    invalid_account_note: 'Choose a valid customer, invoice or unresolved history item.',
    reconciliation_sources_required: 'Select between 1 and 1,000 cash movements to match to your statement.',
    reconciliation_source_changed:
      'Selected movements are unavailable or already reconciled. Reload and preview again.',
    reconciliation_overlap: 'An active reconciliation already covers this date range and method.',
    reconciliation_opening_mismatch:
      'The opening balance must match the preceding reconciliation closing balance.',
    reconciliation_variance_requires_owner:
      'A nonzero variance needs an owner acknowledgment and a recorded explanation.',
    reconciliation_has_later_period: 'Void the following linked reconciliation period first.',
    invalid_reconciliation:
      'Use an end date after the start date, no later than tomorrow, within a 366 day period.',
  };
  if (messages[message]) return { status: 409, error: messages[message] };
  return billingError(code, message);
}
