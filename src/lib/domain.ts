export type OrganizationRole = 'owner' | 'admin' | 'member';
export type PropertyRole = 'manager' | 'office' | 'maintenance' | 'meter_technician';
export type PhysicalStatus = 'ready' | 'out_of_service' | 'blocked' | 'in_preparation';
export type BillingPeriod = 'nightly' | 'weekly' | 'monthly' | 'custom';
export type SiteStatus =
  'available' | 'reserved' | 'occupied' | 'out_of_service' | 'blocked' | 'in_preparation' | 'archived';
export interface Organization {
  id: string;
  name: string;
}
export interface Property {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  timezone: string;
  phone: string;
  email: string;
  contact_name: string;
  description: string;
  notes: string;
  operating_status: 'active' | 'inactive';
  archived_at: string | null;
}
export interface Site {
  id: string;
  organization_id: string;
  property_id: string;
  label: string;
  kind: 'rv' | 'apartment' | 'tent' | 'cabin' | 'house' | 'commercial';
  section: string;
  physical_status: PhysicalStatus;
  monthly_rate_cents: number;
  nightly_rate_cents: number;
  weekly_rate_cents: number;
  deposit_cents: number;
  bedrooms: number | null;
  bathrooms: string | number | null;
  square_feet: number | null;
  length_ft: number | null;
  width_ft: number | null;
  max_rv_length_ft: number | null;
  amperage: number | null;
  pull_through: boolean;
  electric: boolean;
  water: boolean;
  sewer: boolean;
  gas: boolean;
  amenities: string[];
  notes: string;
  map_x: number;
  map_y: number;
  archived_at: string | null;
}
export interface Customer {
  id: string;
  organization_id: string;
  property_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  phone: string;
  secondary_phone: string;
  email: string;
  mailing_address: string;
  emergency_contact: string;
  emergency_phone: string;
  communication_preference: 'phone' | 'email' | 'none';
  notes: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Stay {
  id: string;
  organization_id: string;
  property_id: string;
  site_id: string;
  customer_id: string;
  starts_on: string;
  ends_on: string | null;
  agreed_rate_cents: number;
  notes: string;
  reservation_id: string | null;
  previous_stay_id: string | null;
  planned_ends_on: string | null;
  billing_period: BillingPeriod;
  deposit_required_cents: number;
  guest_count: number;
  occupants: string;
  vehicle_details: string;
  arrival_condition: string;
  initial_meter_notes: string;
  document_reference: string;
  departure_condition: string;
  final_meter_notes: string;
  deposit_notes: string;
  handover_notes: string;
  maintenance_needed: boolean;
  plan_notes: string;
}
export interface Reservation {
  id: string;
  organization_id: string;
  property_id: string;
  site_id: string;
  customer_id: string;
  confirmation_code: string;
  starts_on: string;
  ends_on: string;
  status: 'inquiry' | 'tentative' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  billing_period: BillingPeriod;
  agreed_rate_cents: number;
  deposit_required_cents: number;
  deposit_recorded_cents: number;
  deposit_reference: string;
  guest_count: number;
  rv_length_ft: number | null;
  vehicle_details: string;
  pet_notes: string;
  notes: string;
  cancellation_reason: string;
  updated_at: string;
}
export interface LeaseTerm {
  id: string;
  organization_id: string;
  property_id: string;
  stay_id: string;
  site_id: string;
  customer_id: string;
  renewed_from_id: string | null;
  starts_on: string;
  ends_on: string;
  billing_period: BillingPeriod;
  agreed_rate_cents: number;
  deposit_required_cents: number;
  document_reference: string;
  notes: string;
  status: 'recorded' | 'voided';
  void_reason: string;
  updated_at: string;
}
export interface Membership {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
}
export interface PropertyMembership {
  organization_id: string;
  property_id: string;
  user_id: string;
  role: PropertyRole;
}
export interface Snapshot {
  organizations: Organization[];
  organizationId: string;
  memberships: Membership[];
  propertyMemberships: PropertyMembership[];
  properties: Property[];
  sites: Site[];
  customers: Customer[];
  stays: Stay[];
  reservations: Reservation[];
  leaseTerms: LeaseTerm[];
  userId: string;
  email: string;
}
export function canManageOrganization(snapshot: Snapshot) {
  return snapshot.memberships.some(
    (m) => m.organization_id === snapshot.organizationId && ['owner', 'admin'].includes(m.role)
  );
}
export function isOwner(snapshot: Snapshot) {
  return snapshot.memberships.some(
    (m) => m.organization_id === snapshot.organizationId && m.role === 'owner'
  );
}
export function canEditProperty(snapshot: Snapshot, propertyId: string, customerOperation = false) {
  return (
    canManageOrganization(snapshot) ||
    snapshot.propertyMemberships.some(
      (m) =>
        m.user_id === snapshot.userId &&
        m.property_id === propertyId &&
        (m.role === 'manager' || (customerOperation && m.role === 'office'))
    )
  );
}
export function dateAtProperty(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function isCurrentStay(stay: Stay, today: string) {
  return stay.starts_on <= today && (!stay.ends_on || stay.ends_on > today);
}
export function siteStatus(
  site: Site,
  stays: Stay[],
  today: string,
  reservations: Reservation[] = []
): SiteStatus {
  if (site.archived_at) return 'archived';
  if (stays.some((s) => s.site_id === site.id && isCurrentStay(s, today))) return 'occupied';
  if (site.physical_status !== 'ready') return site.physical_status;
  if (
    reservations.some(
      (r) => r.site_id === site.id && r.status === 'confirmed' && r.starts_on <= today && r.ends_on > today
    )
  )
    return 'reserved';
  return 'available';
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function calendarMonth(date: string, offset: number) {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + offset, 1, 12))
    .toISOString()
    .slice(0, 10);
}
export function rangesOverlap(from: string, until: string | null, starts: string, ends: string | null) {
  return (!ends || from < ends) && (!until || starts < until);
}
export function planningDeparture(stay: Stay, today: string): string | null {
  return stay.ends_on ?? (stay.planned_ends_on && stay.planned_ends_on > today ? stay.planned_ends_on : null);
}
export function siteAvailable(
  site: Site,
  from: string,
  until: string,
  snapshot: Snapshot,
  excludeReservation?: string
) {
  const property = snapshot.properties.find((p) => p.id === site.property_id);
  if (
    !property ||
    property.archived_at ||
    property.operating_status !== 'active' ||
    site.archived_at ||
    site.physical_status !== 'ready' ||
    until <= from
  )
    return false;
  const today = dateAtProperty(property.timezone);
  return (
    !snapshot.reservations.some(
      (r) =>
        r.id !== excludeReservation &&
        r.site_id === site.id &&
        r.status === 'confirmed' &&
        rangesOverlap(from, until, r.starts_on, r.ends_on)
    ) &&
    !snapshot.stays.some(
      (s) => s.site_id === site.id && rangesOverlap(from, until, s.starts_on, planningDeparture(s, today))
    )
  );
}
export function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('Use dollars with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function moneyInput(cents: number) {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
export function customerName(customer?: Customer) {
  return customer ? `${customer.first_name} ${customer.last_name}` : 'Customer';
}
export function csv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const str = String(value);
          const safe = /^[\s]*[=+\-@\t\r]/.test(str) ? `'${str}` : str;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(',')
    )
    .join('\r\n');
}
