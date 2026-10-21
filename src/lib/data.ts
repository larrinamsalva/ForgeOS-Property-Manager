import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type {
  Customer,
  Membership,
  Organization,
  Property,
  PropertyMembership,
  Site,
  Snapshot,
  Stay,
  Reservation,
  LeaseTerm,
} from './domain';
async function allRows<T>(client: SupabaseClient, table: string, organizationId?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client
      .from(table)
      .select('*')
      .order(table.endsWith('memberships') ? 'user_id' : 'id');
    if (table === 'property_memberships') query = query.order('property_id');
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error('Records could not be loaded. Check the database connection and migrations.');
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
}
export async function loadSnapshot(
  client: SupabaseClient,
  user: User,
  requestedOrganization?: string
): Promise<Snapshot> {
  const organizations = await allRows<Organization>(client, 'organizations');
  const organizationId = organizations.some((o) => o.id === requestedOrganization)
    ? requestedOrganization!
    : (organizations[0]?.id ?? '');
  if (!organizationId)
    return {
      organizations,
      organizationId,
      memberships: [],
      propertyMemberships: [],
      properties: [],
      sites: [],
      customers: [],
      stays: [],
      reservations: [],
      leaseTerms: [],
      userId: user.id,
      email: user.email ?? '',
    };
  const [memberships, propertyMemberships, properties, sites, customers, stays, reservations, leaseTerms] =
    await Promise.all([
      allRows<Membership>(client, 'organization_memberships', organizationId),
      allRows<PropertyMembership>(client, 'property_memberships', organizationId),
      allRows<Property>(client, 'properties', organizationId),
      allRows<Site>(client, 'sites_units', organizationId),
      allRows<Customer>(client, 'customers', organizationId),
      allRows<Stay>(client, 'occupancy_stays', organizationId),
      allRows<Reservation>(client, 'reservations', organizationId),
      allRows<LeaseTerm>(client, 'lease_terms', organizationId),
    ]);
  return {
    organizations,
    organizationId,
    memberships: memberships.filter((m) => m.user_id === user.id),
    propertyMemberships,
    properties,
    sites,
    customers,
    stays,
    reservations,
    leaseTerms,
    userId: user.id,
    email: user.email ?? '',
  };
}
