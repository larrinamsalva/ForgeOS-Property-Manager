import { z } from 'zod';
const uuid = z.uuid();
const decimal = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/);
const price = z.string().regex(/^\d{1,7}(\.\d{1,6})?$/);
const amount = z.string().regex(/^\d{1,10}$/);
const reason = z.string().trim().min(3).max(2000);
const tax = {
  tax_bps: z.number().int().min(0).max(10000),
  tax_label: z.string().max(100),
  authorization_reference: z.string().max(500),
};
const entry = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z
    .object({
      command: z.literal(command),
      payload: z.object({ organization_id: uuid, property_id: uuid, request_id: uuid, ...shape }).strict(),
    })
    .strict();
const invoice = { invoice_id: uuid, revision_id: uuid, reason };
export const billingCommandSchema = z.discriminatedUnion('command', [
  entry('configure_policy', {
    proration: z.literal('actual_calendar_days'),
    due_days: z.number().int().min(0).max(90),
    rent_tax_bps: tax.tax_bps,
    tax_label: tax.tax_label,
    authorization_reference: tax.authorization_reference,
    reason,
  }),
  entry('new_rate', {
    utility: z.enum(['electric', 'water', 'gas']),
    label: z.string().trim().min(1).max(100),
    starts_on: z.iso.date(),
    ends_on: z.iso.date().nullable(),
    replaces_id: uuid.nullable(),
    billed_unit: z.string().trim().min(1).max(30),
    conversions: z
      .array(z.object({ unit: z.string().trim().min(1).max(30), factor: decimal }).strict())
      .min(1)
      .max(12),
    tiers: z
      .array(z.object({ up_to: decimal.nullable(), unit_price: price }).strict())
      .min(1)
      .max(12),
    monthly_base_cents: amount,
    sewer_unit_price: price,
    sewer_base_cents: amount,
    included_in_rent: z.boolean(),
    ...tax,
    reason,
  }),
  entry('void_rate', { rate_id: uuid, reason }),
  entry('register_event', {
    reading_id: uuid,
    review_id: uuid,
    before_value: decimal.nullable(),
    after_value: decimal.nullable(),
    rollover_count: z.number().int().min(1).max(100).nullable(),
    reason,
  }),
  entry('void_event', { event_id: uuid, reason }),
  entry('create_draft', {
    stay_id: uuid,
    starts_on: z.iso.date(),
    ends_on: z.iso.date(),
    due_on: z.iso.date(),
    rent_mode: z.enum(['recorded', 'manual', 'none']),
    manual_rent_cents: amount.nullable(),
    rent_reason: z.string().max(2000),
    include_utilities: z.boolean(),
    utilities_reason: z.string().max(2000),
    accept_estimates: z.boolean(),
    adjustments: z
      .array(
        z
          .object({
            kind: z.enum(['fee', 'discount']),
            description: z.string().trim().min(3).max(200),
            amount_cents: amount,
            reason,
            ...tax,
          })
          .strict()
      )
      .max(20),
  }),
  entry('refresh_draft', invoice),
  entry('approve_invoice', invoice),
  entry('void_invoice', invoice),
  entry('credit', { ...invoice, amount_cents: amount, reference: z.string().max(500) }),
  entry('reverse_credit', { ...invoice, credit_id: uuid }),
]);
export function billingError(code: string, message: string) {
  const messages: Record<string, string> = {
    billing_policy_required: 'A supervisor must configure the property billing policy first.',
    invalid_billing_period:
      'Use a billing period within this actual stay, up to 366 days. End dates are exclusive.',
    invalid_due_date:
      'Choose a planned due date on or after the period start and within one year of its end.',
    rate_coverage_required: 'An active rate schedule must cover every day for each utility at this site.',
    utility_assignment_gap:
      'Meter assignments leave an uncovered part of this billing period. Document the missing assignment or explicitly exclude utilities.',
    utility_meter_required: 'A separately billed utility needs an assigned meter covering the period.',
    approved_boundary_readings_required:
      'Accept baseline and closing readings on the period boundary dates for every meter assignment. Replacements need both meters’ boundary readings.',
    unreviewed_reading: 'Review every capture between the billing boundary readings before calculating.',
    rate_boundary_reading_required:
      'A rate change needs an approved reading on its effective date. Usage cannot be split by estimation.',
    unit_conversion_required:
      'Add an explicit conversion from this meter’s register unit to the billed unit.',
    register_event_required:
      'Document the accepted reset or rollover in Billing before calculating this interval.',
    invalid_register_event: 'Check the accepted review, reset register values or rollover count.',
    estimated_reading_acknowledgement:
      'Explicitly acknowledge accepted estimated readings before including them.',
    invoice_sources_changed:
      'Source records changed. Refresh the draft and review the new revision before approval.',
    invoice_conflict: 'This invoice or revision changed. Reload the billing records before continuing.',
    approved_reading_in_use:
      'An approved invoice uses this reading. Void that invoice before changing its review or register event.',
    approved_rate_in_use:
      'An approved invoice uses this rate. Keep historical rates and add a future version.',
    invalid_rate_replacement:
      'Select the active prior schedule and start its replacement inside that schedule, after its start date.',
    invalid_rate: 'Check the rate schedule, prices and effective dates.',
    invalid_tiers: 'Tier limits must increase; only the last tier must be unlimited.',
    invalid_conversion: 'Use unique register units with positive conversion factors.',
    included_rate_nonzero:
      'Utilities included in rent must have zero prices, base fees, sewer charges and tax.',
    custom_rent_required: 'This stay has custom rent. Enter its authorized amount and agreement reason.',
    billing_reason_required: 'Add a clear reason for this decision or exclusion.',
    invalid_credit:
      'Credits must be positive and no larger than this approved invoice’s remaining internal balance.',
    invalid_adjustment: 'Check each adjustment’s amount, description, reason and tax authorization.',
    tax_authorization_required: 'Add a tax label and authorization reference for every nonzero tax.',
    invalid_invoice_total:
      'The invoice needs at least one item and a nonnegative total within the supported limit.',
    billing_limit: 'The calculated amount exceeds the supported billing limit.',
    operation_conflict: 'This retry ID has different content. Reload before starting a new action.',
    property_unavailable: 'This property is inactive or archived.',
  };
  if (code === '42501')
    return { status: 403, error: 'Your role cannot perform this billing action at this property.' };
  if (messages[message]) return { status: 409, error: messages[message] };
  if (code === '23P01')
    return {
      status: 409,
      error:
        'These dates overlap an existing rate schedule, rent draft or billed meter interval. Review or void the existing record first.',
    };
  if (code === '23505')
    return { status: 409, error: 'This action has already been recorded. Reload the billing records.' };
  if (['23514', '23502', '22P02', '22007', '22008'].includes(code))
    return { status: 400, error: 'Check required fields, dates, decimal amounts and tax authorization.' };
  return {
    status: 503,
    error:
      'Billing could not be completed. No partial changes were saved. Retry when the connection is available.',
  };
}
