import { z } from 'zod';
import { messageCategories } from './commercial-domain';
import { reportKinds } from './reports-domain';
const uuid = z.uuid(),
  version = z.number().int().positive(),
  date = z.iso.date(),
  reason = z.string().trim().min(3).max(2000);
const edit = { id: uuid.nullable(), version: version.nullable() };
const preferences = {
  version: version.nullable(),
  language: z.enum(['en', 'es']),
  in_app: z.boolean(),
  email_opt_in: z.boolean(),
  sms_opt_in: z.boolean(),
};
const content = {
  language: z.enum(['en', 'es']),
  category: z.enum(messageCategories),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
};
const scope = { organization_id: uuid, property_id: uuid, request_id: uuid, reason };
const entry = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z.object({ command: z.literal(command), payload: z.object({ ...scope, ...shape }).strict() }).strict();
export const commercialCommandSchema = z.discriminatedUnion('command', [
  entry('set_portal_access', {
    ...edit,
    customer_id: uuid,
    user_id: uuid,
    active: z.boolean(),
    starts_on: date,
    expires_on: date.nullable(),
  }),
  entry('set_preferences', { ...preferences, customer_id: uuid }),
  entry('save_template', {
    ...edit,
    ...content,
    name: z.string().trim().min(1).max(160),
    archived: z.boolean(),
  }),
  entry('prepare_message', {
    ...content,
    template_id: uuid.nullable(),
    template_version: version.nullable(),
    customer_ids: z
      .array(uuid)
      .min(1)
      .max(250)
      .refine((v) => new Set(v).size === v.length),
    scheduled_for: z.iso.datetime({ offset: true }).nullable(),
  }),
  entry('publish_message', { id: uuid, version }),
  entry('cancel_message', { id: uuid, version }),
  entry('add_message_note', { id: uuid }),
  entry('decide_contact', { id: uuid, version, status: z.enum(['approved', 'declined']) }),
]);
const contact = z
  .object({
    email: z.union([z.email().max(320), z.literal('')]).optional(),
    phone: z.string().max(100).optional(),
    mailing_address: z.string().max(1000).optional(),
    emergency_contact: z.string().max(200).optional(),
    emergency_phone: z.string().max(100).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const own = { membership_id: uuid, request_id: uuid, reason };
const resident = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z.object({ command: z.literal(command), payload: z.object({ ...own, ...shape }).strict() }).strict();
export const residentCommandSchema = z.discriminatedUnion('command', [
  resident('set_preferences', preferences),
  resident('read_message', { id: uuid }),
  resident('request_contact', { proposed: contact }),
  resident('cancel_contact', { id: uuid, version }),
  resident('new_maintenance', {
    stay_id: uuid.nullable(),
    location: z.enum(['site', 'common']),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(3).max(4000),
    category: z.string().trim().max(100),
    priority: z.enum(['low', 'normal', 'high']),
  }),
]);
export const reportQuerySchema = z
  .object({
    organization: uuid,
    kind: z.enum(reportKinds),
    starts_on: date,
    ends_on: date,
    property_id: uuid.nullable(),
    site_id: uuid.nullable(),
    customer_id: uuid.nullable(),
    employee_id: uuid.nullable(),
    status: z.string().trim().max(100),
    category: z.string().trim().max(100),
    page: z.coerce.number().int().min(0).max(10000),
  })
  .refine(
    (v) => v.ends_on > v.starts_on && Date.parse(v.ends_on) - Date.parse(v.starts_on) <= 366 * 86400000,
    { message: 'Choose 1–366 days.' }
  );
export function commercialError(code: string, message: string) {
  if (code === '42501')
    return { status: 403, error: 'This account has no current access to that record or action.' };
  if (message === 'commercial_rate_limit')
    return { status: 429, error: 'The request limit was reached. Try again after the current window.' };
  const messages: Record<string, string> = {
    commercial_conflict: 'This record changed. Reload before editing.',
    operation_conflict: 'This retry ID has different content. Reload before starting a new action.',
    registered_user_required: 'Ask the resident to register, then use their account ID.',
    portal_identity_immutable: 'Create a separate access link for a different account or customer.',
    contact_source_changed:
      'The customer changed after this proposal. Decline it and request a new proposal.',
    current_stay_required: 'A current actual stay is required to submit maintenance.',
    message_not_due: 'The scheduled publication time has not arrived.',
    invalid_message_transition: 'The message has already been published or cancelled.',
    account_export_too_large:
      'The account exceeds the archive limits. Use the documented complete backup process.',
    property_unavailable: 'Restore and activate the property before recording new activity.',
    invalid_audience: 'Choose 1–250 distinct active customers at this property.',
  };
  if (messages[message]) return { status: 409, error: messages[message] };
  if (code === '23505')
    return {
      status: 409,
      error: 'This access link or pending proposal already exists. Reload current records.',
    };
  if (['23514', '23502', '23503', '22P02', '22007', '22008'].includes(code))
    return { status: 400, error: 'Check required fields, dates and matching property records.' };
  return {
    status: 503,
    error: 'The request could not be completed. Check the connection and required migrations, then retry.',
  };
}
