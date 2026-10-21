'use client';
import { useState, type FormEvent } from 'react';
import type { Property, Snapshot, Stay } from '@/lib/domain';
import { customerName, dateAtProperty, money } from '@/lib/domain';
import { useHydrated } from '@/lib/use-hydrated';
export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';
  required?: boolean;
  options?: { value: string; label: string }[];
  step?: string;
  min?: string;
  max?: string;
  help?: string;
  default?: string | boolean;
}
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) }));
export const propertyFields: Field[] = [
  { name: 'name', label: 'Property name', required: true },
  {
    name: 'category',
    label: 'Property type',
    type: 'select',
    options: options([
      'rv_park',
      'apartments',
      'campground',
      'mobile_home',
      'mixed_use',
      'rentals',
      'commercial',
    ]),
    default: 'rv_park',
  },
  { name: 'address', label: 'Street address' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State / region' },
  { name: 'postal_code', label: 'ZIP / postal code' },
  { name: 'country', label: 'Country', required: true, default: 'United States' },
  {
    name: 'timezone',
    label: 'Property time zone',
    required: true,
    default: 'America/Los_Angeles',
    help: 'IANA name, such as America/Los_Angeles or America/New_York.',
  },
  { name: 'phone', label: 'Business phone' },
  { name: 'email', label: 'Business email', type: 'email' },
  { name: 'contact_name', label: 'Property contact' },
  {
    name: 'operating_status',
    label: 'Operating status',
    type: 'select',
    options: options(['active', 'inactive']),
    default: 'active',
  },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'notes', label: 'Internal notes', type: 'textarea' },
];
const propertyField = (properties: Property[]): Field => ({
  name: 'property_id',
  label: 'Property',
  type: 'select',
  required: true,
  options: properties.filter((p) => !p.archived_at).map((p) => ({ value: p.id, label: p.name })),
});
export const siteFields = (properties: Property[]): Field[] => [
  propertyField(properties),
  { name: 'label', label: 'Site / unit number', required: true },
  {
    name: 'kind',
    label: 'Site / unit type',
    type: 'select',
    options: options(['rv', 'apartment', 'tent', 'cabin', 'house', 'commercial']),
    default: 'rv',
  },
  { name: 'section', label: 'Section / building' },
  {
    name: 'physical_status',
    label: 'Physical availability',
    type: 'select',
    options: [
      { value: 'ready', label: 'Ready for occupancy' },
      ...options(['out_of_service', 'blocked', 'in_preparation']),
    ],
    default: 'ready',
    help: 'Occupied status is calculated from stays.',
  },
  ...['monthly_rate', 'weekly_rate', 'nightly_rate', 'deposit'].map((name) => ({
    name,
    label: `${name.replace('_', ' ')} ($)`,
    default: '0.00',
    required: true,
    help: 'USD. Up to two decimal places.',
  })),
  ...['bedrooms', 'bathrooms', 'square_feet', 'length_ft', 'width_ft', 'max_rv_length_ft', 'amperage'].map(
    (name) => ({
      name,
      label:
        (
          {
            length_ft: 'Site length (ft)',
            width_ft: 'Site width (ft)',
            max_rv_length_ft: 'Maximum RV length (ft)',
            square_feet: 'Square feet',
          } as Record<string, string>
        )[name] ?? name.replace(/^./, (c) => c.toUpperCase()),
      type: 'number' as const,
      min: '0',
      step: name === 'bathrooms' ? '0.5' : name.endsWith('_ft') ? '0.01' : '1',
    })
  ),
  ...['pull_through', 'electric', 'water', 'sewer', 'gas'].map((name) => ({
    name,
    label: name.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()),
    type: 'checkbox' as const,
  })),
  { name: 'amenities', label: 'Amenities', help: 'Separate amenities with commas.' },
  {
    name: 'map_x',
    label: 'Map column (0–20)',
    type: 'number',
    min: '0',
    max: '20',
    default: '0',
    required: true,
  },
  {
    name: 'map_y',
    label: 'Map row (0–50)',
    type: 'number',
    min: '0',
    max: '50',
    default: '0',
    required: true,
  },
  { name: 'notes', label: 'Site notes', type: 'textarea' },
];
export const customerFields = (properties: Property[]): Field[] => [
  propertyField(properties),
  { name: 'first_name', label: 'First name', required: true },
  { name: 'last_name', label: 'Last name', required: true },
  { name: 'preferred_name', label: 'Preferred name' },
  { name: 'phone', label: 'Phone' },
  { name: 'secondary_phone', label: 'Secondary phone' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'mailing_address', label: 'Mailing address' },
  { name: 'emergency_contact', label: 'Emergency contact' },
  { name: 'emergency_phone', label: 'Emergency phone' },
  {
    name: 'communication_preference',
    label: 'Contact preference',
    type: 'select',
    options: options(['none', 'phone', 'email']),
    default: 'none',
  },
  { name: 'notes', label: 'Authorized staff notes', type: 'textarea' },
];
export const billingOptions = ['nightly', 'weekly', 'monthly', 'custom'].map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
export const arrivalChecklistFields: Field[] = [
  {
    name: 'occupants',
    label: 'Occupants',
    type: 'textarea',
    help: 'Names or an authorized occupant reference.',
  },
  { name: 'arrival_condition', label: 'Move-in condition', type: 'textarea' },
  {
    name: 'initial_meter_notes',
    label: 'Initial meter handover notes',
    type: 'textarea',
    help: 'Reference notes for your current process. Verified meter readings arrive in the tablet milestone.',
  },
  {
    name: 'document_reference',
    label: 'Agreement or document reference',
    help: 'Reference an authorized document in your existing document system.',
  },
];
export function moveOutFields(stay: Stay, timezone: string): Field[] {
  return [
    {
      name: 'ends_on',
      label: 'Departure date',
      type: 'date',
      required: true,
      min: stay.starts_on,
      max: dateAtProperty(timezone),
      default: dateAtProperty(timezone),
    },
    { name: 'departure_condition', label: 'Move-out condition', type: 'textarea' },
    { name: 'maintenance_needed', label: 'Maintenance follow-up needed', type: 'checkbox' },
    { name: 'final_meter_notes', label: 'Final meter handover notes', type: 'textarea' },
    {
      name: 'deposit_notes',
      label: 'Billing and deposit handover notes',
      type: 'textarea',
      help: 'Record your invoice/deposit review in your current billing system; these notes are retained with this stay.',
    },
    { name: 'handover_notes', label: 'Other departure notes', type: 'textarea' },
  ];
}
export function stayFields(snapshot: Snapshot, propertyId: string): Field[] {
  const property = snapshot.properties.find((p) => p.id === propertyId);
  return [
    propertyField(property ? [property] : []),
    {
      name: 'site_id',
      label: 'Site / unit',
      type: 'select',
      required: true,
      options: snapshot.sites
        .filter(
          (s) =>
            s.property_id === propertyId &&
            !s.archived_at &&
            s.physical_status === 'ready' &&
            !snapshot.stays.some((o) => o.site_id === s.id && !o.ends_on)
        )
        .map((s) => ({ value: s.id, label: `${s.label} · ${money(s.monthly_rate_cents)} / month` })),
    },
    {
      name: 'customer_id',
      label: 'Customer',
      type: 'select',
      required: true,
      options: snapshot.customers
        .filter((c) => c.property_id === propertyId && !c.archived_at)
        .map((c) => ({ value: c.id, label: customerName(c) })),
    },
    {
      name: 'starts_on',
      label: 'Move-in date',
      type: 'date',
      required: true,
      default: dateAtProperty(property?.timezone ?? 'America/Los_Angeles'),
      max: dateAtProperty(property?.timezone ?? 'America/Los_Angeles'),
    },
    {
      name: 'agreed_rate',
      label: 'Agreed rate ($)',
      required: true,
      default: '0.00',
      help: 'Stored in cents. Billing is a later milestone.',
    },
    {
      name: 'billing_period',
      label: 'Billing period',
      type: 'select',
      options: billingOptions,
      default: 'monthly',
      required: true,
    },
    {
      name: 'planned_ends_on',
      label: 'Planned departure',
      type: 'date',
      min: dateAtProperty(property?.timezone ?? 'America/Los_Angeles'),
      help: 'An open-ended stay blocks future bookings until you set a departure plan.',
    },
    { name: 'deposit_required', label: 'Deposit requirement ($)', default: '0.00', required: true },
    {
      name: 'guest_count',
      label: 'Guest count',
      type: 'number',
      min: '1',
      max: '99',
      step: '1',
      default: '1',
      required: true,
    },
    { name: 'vehicle_details', label: 'Vehicle / RV details', type: 'textarea' },
    ...arrivalChecklistFields,
    { name: 'notes', label: 'Stay notes', type: 'textarea' },
  ];
}
export function RecordForm({
  fields,
  initial = {},
  onSave,
  onCancel,
  submit = 'Save record',
  locked = [],
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
  submit?: string;
  locked?: string[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const hydrated = useHydrated();
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of fields)
      values[field.name] =
        field.type === 'checkbox'
          ? data.has(field.name)
          : String(data.get(field.name) ?? initial[field.name] ?? '');
    setError('');
    setPending(true);
    try {
      await onSave(values);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this record.');
      setPending(false);
    }
  }
  return (
    <form method="post" onSubmit={handleSubmit}>
      <fieldset disabled={pending || !hydrated} className="form-grid">
        {fields.map((field) => {
          const value = initial[field.name] ?? field.default ?? (field.type === 'checkbox' ? false : '');
          const fieldId = `field-${field.name}`;
          return (
            <div
              key={field.name}
              className={
                field.type === 'textarea'
                  ? 'field wide'
                  : field.type === 'checkbox'
                    ? 'field check-field'
                    : 'field'
              }
            >
              {field.type === 'checkbox' ? (
                <label>
                  <input name={field.name} type="checkbox" defaultChecked={Boolean(value)} />
                  {field.label}
                </label>
              ) : (
                <>
                  <label htmlFor={fieldId}>
                    {field.label}
                    {field.required && <span aria-hidden="true"> *</span>}
                  </label>
                  {locked.includes(field.name) ? (
                    <>
                      <input type="hidden" name={field.name} value={String(value)} />
                      <div className="locked-value">
                        {field.options?.find((o) => o.value === value)?.label ?? String(value)}
                      </div>
                    </>
                  ) : field.type === 'select' ? (
                    <select
                      id={fieldId}
                      name={field.name}
                      defaultValue={String(value)}
                      required={field.required}
                      aria-describedby={field.help ? `${fieldId}-help` : undefined}
                    >
                      <option value="">Choose…</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={fieldId}
                      name={field.name}
                      rows={3}
                      required={field.required}
                      defaultValue={String(value)}
                      maxLength={4000}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      name={field.name}
                      type={field.type ?? 'text'}
                      defaultValue={String(value)}
                      required={field.required}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      maxLength={field.type === 'text' || !field.type ? 1000 : undefined}
                      aria-describedby={field.help ? `${fieldId}-help` : undefined}
                    />
                  )}
                  {field.help && <small id={`${fieldId}-help`}>{field.help}</small>}
                </>
              )}
            </div>
          );
        })}
      </fieldset>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        {onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button primary" type="submit" disabled={pending || !hydrated}>
          {pending ? 'Saving…' : submit}
        </button>
      </div>
    </form>
  );
}
