export type OrganizationRole = 'owner' | 'admin' | 'member';
export type PropertyRole = 'manager' | 'office' | 'maintenance' | 'meter_technician';
export type PhysicalStatus = 'ready' | 'out_of_service' | 'blocked' | 'in_preparation';
export type SiteStatus =
  'available' | 'occupied' | 'out_of_service' | 'blocked' | 'in_preparation' | 'archived';
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
export function siteStatus(site: Site, stays: Stay[], today: string): SiteStatus {
  if (site.archived_at) return 'archived';
  if (stays.some((s) => s.site_id === site.id && isCurrentStay(s, today))) return 'occupied';
  return site.physical_status === 'ready' ? 'available' : site.physical_status;
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
