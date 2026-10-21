import { z } from 'zod';
export interface Meter {
  id: string;
  organization_id: string;
  property_id: string;
  label: string;
  utility: 'electric' | 'water' | 'gas';
  serial_number: string;
  location: string;
  unit: string;
  register_digits: number;
  multiplier: string;
  max_delta: string | null;
  installed_at: string;
  removed_at: string | null;
  notes: string;
}
export interface MeterAssignment {
  id: string;
  organization_id: string;
  property_id: string;
  meter_id: string;
  site_id: string;
  site_label: string;
  starts_at: string;
  ends_at: string | null;
  close_reason: string;
}
export interface MeterRoute {
  id: string;
  organization_id: string;
  property_id: string;
  label: string;
  assigned_to: string;
  starts_on: string;
  ends_on: string;
  cadence: string;
  status: string;
  cancel_reason: string;
}
export interface MeterRouteItem {
  id: string;
  organization_id: string;
  property_id: string;
  route_id: string;
  assignment_id: string;
  position: number;
}
export interface MeterReading {
  id: string;
  organization_id: string;
  property_id: string;
  route_item_id: string;
  assignment_id: string;
  meter_id: string;
  captured_at: string;
  captured_by: string;
  value: string | null;
  flag: string;
  kind: string;
  notes: string;
  exceptions: string[];
  created_at: string;
}
export interface MeterReview {
  id: string;
  reading_id: string;
  decision: 'accepted' | 'rejected';
  corrected_value: string | null;
  reason: string;
  created_at: string;
  created_by: string;
}
export interface MeterPhoto {
  id: string;
  reading_id: string;
  status: string;
  mime: string;
  byte_size: number;
  sha256: string;
  object_path: string;
}
export interface MeterOccupancy {
  reading_id: string;
  site_id: string;
  stay_id: string | null;
  customer_id: string | null;
  captured_on: string;
}
export interface MeterConflict {
  id: string;
  property_id: string;
  actor_id: string;
  reason_code: string;
  payload: z.infer<typeof captureSchema>;
  created_at: string;
}
export interface MeterResolution {
  id: string;
  conflict_id: string;
  decision: string;
  reading_id: string | null;
  reason: string;
}
export interface MeterSnapshot {
  userId: string;
  organizationId: string;
  supervisorProperties: string[];
  conflicts: MeterConflict[];
  resolutions: MeterResolution[];
  downloadedAt: string;
  properties: { id: string; name: string; timezone: string }[];
  meters: Meter[];
  assignments: MeterAssignment[];
  routes: MeterRoute[];
  items: MeterRouteItem[];
  readings: MeterReading[];
  reviews: MeterReview[];
  photos: MeterPhoto[];
  occupancy: MeterOccupancy[];
}
const uuid = z.uuid();
const scope = { organization_id: uuid, property_id: uuid };
export const decimal = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'Use a positive register value with up to six decimal places.');
const optionalDecimal = decimal.or(z.literal('')).nullable();
const timestamp = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(3).max(2000);
const entry = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z.object({ command: z.literal(command), payload: z.object({ ...scope, ...shape }).strict() }).strict();
export const meterCommandSchema = z.discriminatedUnion('command', [
  entry('new_meter', {
    label: z.string().trim().min(1).max(100),
    utility: z.enum(['electric', 'water', 'gas']),
    serial_number: z.string().trim().min(1).max(150),
    location: z.string().max(1000),
    unit: z.string().trim().min(1).max(30),
    register_digits: z.coerce.number().int().min(1).max(12),
    multiplier: z.string().regex(/^\d{1,8}(\.\d{1,6})?$/),
    max_delta: optionalDecimal,
    installed_at: timestamp,
    notes: z.string().max(2000),
  }),
  entry('new_assignment', { meter_id: uuid, site_id: uuid, starts_at: timestamp }),
  entry('close_assignment', { assignment_id: uuid, ends_at: timestamp, reason, remove_meter: z.boolean() }),
  entry('new_route', {
    label: z.string().trim().min(1).max(120),
    assigned_to: uuid,
    starts_on: z.iso.date(),
    ends_on: z.iso.date(),
    cadence: z.enum(['weekly', 'monthly', 'custom']),
    assignments: z.array(uuid).min(1).max(500),
  }),
  entry('cancel_route', { route_id: uuid, reason }),
  entry('resolve_conflict', {
    conflict_id: uuid,
    decision: z.enum(['duplicate', 'discarded']),
    reading_id: uuid.nullable(),
    reason,
  }),
  entry('review', {
    reading_id: uuid,
    previous_review_id: uuid.nullable(),
    decision: z.enum(['accepted', 'rejected']),
    corrected_value: optionalDecimal,
    reason,
  }),
]);
export const captureSchema = z
  .object({
    id: uuid,
    ...scope,
    route_item_id: uuid,
    assignment_id: uuid,
    captured_at: timestamp,
    device_id: uuid,
    previous_reading_id: uuid.nullable(),
    previous_review_id: uuid.nullable(),
    value: decimal.nullable(),
    kind: z.enum(['actual', 'estimated']),
    flag: z.enum(['none', 'rollover', 'reset', 'damaged', 'missing', 'problem']),
    notes: z.string().max(2000),
    photo: z
      .object({
        mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        byte_size: z.number().int().min(1).max(5242880),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
  })
  .strict();
export function latestReview(readingId: string, reviews: MeterReview[]) {
  return reviews
    .filter((r) => r.reading_id === readingId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
export function latestReading(assignmentId: string, readings: MeterReading[]) {
  return readings
    .filter((r) => r.assignment_id === assignmentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
export function meterError(code: string, message: string): { status: number; error: string } {
  if (code === '42501')
    return {
      status: 403,
      error:
        'Your access or route assignment changed. Sign in with the assigned account and ask a supervisor to review this queue.',
    };
  const messages: Record<string, string> = {
    assignment_conflict: 'The meter assignment changed. Keep this entry and ask a supervisor to review it.',
    baseline_conflict: 'Meter history changed after download. Keep this entry for supervisor reconciliation.',
    capture_conflict: 'This route stop already has a reading. Keep this entry for supervisor reconciliation.',
    operation_conflict:
      'This operation ID has different content. Preserve the queue and ask for recovery assistance.',
    review_conflict: 'Another supervisor reviewed this entry. Refresh before reviewing again.',
    capture_window:
      'Capture time is outside the route or the 14-day sync window. Preserve the entry for supervisor review.',
    capture_order: 'This reading predates the latest capture. Preserve it for supervisor review.',
    lower_reading: 'A lower register needs an explicit rollover or reset flag and a reason.',
    register_overflow: 'The value exceeds the configured register digits.',
    reason_required: 'Add a reason for this exception.',
    value_required: 'A numeric value or an explicit missing/damaged/problem report is required.',
    invalid_reading: 'Use a register value with up to six decimal places.',
    photo_pending: 'Upload the queued photo before accepting this reading.',
    photo_missing: 'The photo upload is incomplete. Retry sync.',
    assignment_has_readings:
      'Readings already exist after that time. Historical assignments cannot be rewritten.',
    invalid_resolution: 'A duplicate must link to an existing reading for the same meter assignment.',
    invalid_assignment: 'Choose a valid dated meter assignment.',
    invalid_assignee: 'Assign a manager, owner, administrator or meter technician at this property.',
    invalid_route: 'Check the route dates, active assignments and cancellation reason.',
    property_unavailable: 'This property is inactive or archived.',
  };
  if (messages[message]) return { status: 409, error: messages[message] };
  if (['23505', '23P01'].includes(code))
    return { status: 409, error: 'This meter, assignment or route stop overlaps an existing record.' };
  if (['23514', '23502', '22P02', '22007', '22008'].includes(code))
    return { status: 400, error: 'Check the required fields, values and effective dates.' };
  return {
    status: 503,
    error: 'The meter service could not complete the request. Your local entries are preserved; retry later.',
  };
}
