import { z } from 'zod';
import { parseMoney } from './domain';
const text = (max = 200) => z.string().trim().max(max);
const required = (label: string, max = 200) => text(max).min(1, `${label} is required.`);
const email = text(254).refine((v) => !v || z.email().safeParse(v).success, 'Enter a valid email address.');
const id = z.uuid();
const amount = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Use dollars with at most two decimal places.')
  .transform(parseMoney);
const number = z.preprocess(
  (v) => (v === '' || v === null ? null : Number(v)),
  z.number().finite().min(0).max(1000000).nullable()
);
const integer = z.preprocess(
  (v) => (v === '' || v === null ? null : Number(v)),
  z.number().int().min(0).max(1000000).nullable()
);
const date = z.iso.date();
const optionalDate = z.union([date, z.literal('')]).transform((value) => value || null);
const billingPeriod = z.enum(['nightly', 'weekly', 'monthly', 'custom']);
export const propertySchema = z
  .object({
    name: required('Property name'),
    category: z.enum([
      'rv_park',
      'apartments',
      'campground',
      'mobile_home',
      'mixed_use',
      'rentals',
      'commercial',
    ]),
    address: text(),
    city: text(100),
    state: text(100),
    postal_code: text(20),
    country: required('Country', 80),
    timezone: required('Time zone', 100).refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid IANA time zone.'),
    phone: text(40),
    email,
    contact_name: text(120),
    description: text(2000),
    notes: text(4000),
    operating_status: z.enum(['active', 'inactive']),
  })
  .strict();
export const siteSchema = z
  .object({
    property_id: id,
    label: required('Site or unit number', 40),
    kind: z.enum(['rv', 'apartment', 'tent', 'cabin', 'house', 'commercial']),
    section: text(80),
    physical_status: z.enum(['ready', 'out_of_service', 'blocked', 'in_preparation']),
    monthly_rate: amount,
    nightly_rate: amount,
    weekly_rate: amount,
    deposit: amount,
    bedrooms: integer,
    bathrooms: number.refine(
      (v) => v === null || Number.isInteger(v * 2),
      'Bathrooms must be in half-bath increments.'
    ),
    square_feet: integer,
    length_ft: number,
    width_ft: number,
    max_rv_length_ft: number,
    amperage: integer,
    pull_through: z.boolean(),
    electric: z.boolean(),
    water: z.boolean(),
    sewer: z.boolean(),
    gas: z.boolean(),
    amenities: text(1000).transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30)
    ),
    notes: text(4000),
    map_x: z.coerce.number().int().min(0).max(20),
    map_y: z.coerce.number().int().min(0).max(50),
  })
  .strict()
  .transform(({ monthly_rate, nightly_rate, weekly_rate, deposit, ...rest }) => ({
    ...rest,
    monthly_rate_cents: monthly_rate,
    nightly_rate_cents: nightly_rate,
    weekly_rate_cents: weekly_rate,
    deposit_cents: deposit,
  }));
export const customerSchema = z
  .object({
    property_id: id,
    first_name: required('First name', 100),
    last_name: required('Last name', 100),
    preferred_name: text(100),
    phone: text(40),
    secondary_phone: text(40),
    email,
    mailing_address: text(500),
    emergency_contact: text(200),
    emergency_phone: text(40),
    communication_preference: z.enum(['phone', 'email', 'none']),
    notes: text(4000),
  })
  .strict();
export const staySchema = z
  .object({
    property_id: id,
    site_id: id,
    customer_id: id,
    starts_on: date,
    agreed_rate: amount,
    notes: text(4000),
    planned_ends_on: optionalDate.default(null),
    billing_period: billingPeriod.default('monthly'),
    deposit_required: amount.default(0),
    guest_count: z.coerce.number().int().min(1).max(99).default(1),
    occupants: text(2000).default(''),
    vehicle_details: text(2000).default(''),
    arrival_condition: text(4000).default(''),
    initial_meter_notes: text(2000).default(''),
    document_reference: text(1000).default(''),
  })
  .strict()
  .transform(({ agreed_rate, deposit_required, ...rest }) => ({
    ...rest,
    agreed_rate_cents: agreed_rate,
    deposit_required_cents: deposit_required,
  }));
export const reservationSchema = z
  .object({
    property_id: id,
    site_id: id,
    customer_id: id,
    starts_on: date,
    ends_on: date,
    status: z.enum(['inquiry', 'tentative', 'confirmed']),
    billing_period: billingPeriod,
    agreed_rate: amount,
    deposit_required: amount,
    deposit_recorded: amount,
    deposit_reference: text(500),
    guest_count: z.coerce.number().int().min(1).max(99),
    rv_length_ft: number.refine((v) => v === null || v <= 1000, 'RV length must be 1000 feet or less.'),
    vehicle_details: text(2000),
    pet_notes: text(1000),
    notes: text(4000),
  })
  .strict()
  .refine((v) => v.ends_on > v.starts_on, 'Departure must follow arrival.')
  .refine((v) => v.deposit_recorded <= v.deposit_required, 'The noted deposit cannot exceed the requirement.')
  .transform(({ agreed_rate, deposit_required, deposit_recorded, ...rest }) => ({
    ...rest,
    agreed_rate_cents: agreed_rate,
    deposit_required_cents: deposit_required,
    deposit_recorded_cents: deposit_recorded,
  }));
export const leaseSchema = z
  .object({
    stay_id: id,
    starts_on: date,
    ends_on: date,
    billing_period: billingPeriod,
    renewed_from_id: z.union([id, z.literal('')]).transform((v) => v || null),
    agreed_rate: amount,
    deposit_required: amount,
    document_reference: text(1000),
    notes: text(4000),
  })
  .strict()
  .refine((v) => v.ends_on > v.starts_on, 'The term end must follow its start.')
  .transform(({ agreed_rate, deposit_required, ...rest }) => ({
    ...rest,
    agreed_rate_cents: agreed_rate,
    deposit_required_cents: deposit_required,
  }));
export const reasonSchema = z.object({ reason: required('Reason', 2000) }).strict();
export const checkinSchema = z
  .object({
    starts_on: date,
    occupants: text(2000),
    arrival_condition: text(4000),
    initial_meter_notes: text(2000),
    document_reference: text(1000),
    notes: text(4000),
  })
  .strict();
export const planSchema = z
  .object({ planned_ends_on: optionalDate, reason: required('Reason', 2000) })
  .strict();
export const transferSchema = z
  .object({ destination: id, transfer_on: date, agreed_rate: amount, reason: required('Reason', 2000) })
  .strict();
export const mutationSchema = z.discriminatedUnion('entity', [
  z
    .object({
      entity: z.literal('organization'),
      action: z.literal('create'),
      values: z.object({ name: required('Organization name') }).strict(),
    })
    .strict(),
  z
    .object({
      entity: z.enum(['property', 'site', 'customer']),
      action: z.enum(['create', 'update', 'archive', 'restore']),
      organization_id: id,
      id: id.optional(),
      values: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      entity: z.literal('stay'),
      action: z.enum(['create', 'moveout', 'plan', 'transfer']),
      organization_id: id,
      id: id.optional(),
      values: z.unknown(),
    })
    .strict(),
  z
    .object({
      entity: z.literal('reservation'),
      action: z.enum(['create', 'update', 'confirm', 'cancel', 'no_show', 'checkin']),
      organization_id: id,
      id: id.optional(),
      version: text(100).optional(),
      values: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      entity: z.literal('lease'),
      action: z.enum(['create', 'void']),
      organization_id: id,
      id: id.optional(),
      version: text(100).optional(),
      values: z.unknown(),
    })
    .strict(),
  z
    .object({
      entity: z.literal('access'),
      action: z.enum(['grant', 'revoke']),
      organization_id: id,
      values: z
        .object({
          property_id: id,
          user_id: id,
          role: z.enum(['manager', 'office', 'maintenance', 'meter_technician']),
        })
        .strict(),
    })
    .strict(),
]);
export const moveoutSchema = z
  .object({
    ends_on: date,
    departure_condition: text(4000).default(''),
    final_meter_notes: text(2000).default(''),
    deposit_notes: text(2000).default(''),
    handover_notes: text(4000).default(''),
    maintenance_needed: z.boolean().default(false),
  })
  .strict();
