import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MeterSnapshot } from './meter-domain';
async function rows(client: SupabaseClient, table: string, org: string, projection = '*') {
  const results: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from(table)
      .select(projection)
      .eq('organization_id', org)
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error('Meter records could not be loaded. Check the connection and migrations.');
    results.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) return results;
  }
}
export async function loadMeterSnapshot(
  client: SupabaseClient,
  userId: string,
  org: string,
  reader = false
): Promise<MeterSnapshot> {
  const names = [
    'meters',
    'meter_assignments',
    'meter_routes',
    'meter_route_items',
    'meter_readings',
    'meter_reading_reviews',
    'meter_photos',
    'meter_sync_conflicts',
    'meter_conflict_resolutions',
  ];
  const all = await Promise.all(names.map((n) => rows(client, n, org)));
  const properties = await rows(client, 'properties', org, 'id,name,timezone');
  const { data: occupancy, error } = reader
    ? { data: [], error: null }
    : await client.rpc('meter_occupancy', { org });
  if (error) throw new Error('Reading attribution could not be loaded.');
  const [{ data: orgRole }, { data: propertyRoles }] = await Promise.all([
    client
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', org)
      .eq('user_id', userId)
      .single(),
    client
      .from('property_memberships')
      .select('property_id,role')
      .eq('organization_id', org)
      .eq('user_id', userId),
  ]);
  const supervisorProperties = ['owner', 'admin'].includes(orgRole?.role)
    ? properties.map((p) => p.id)
    : (propertyRoles?.filter((p) => p.role === 'manager').map((p) => p.property_id) ?? []);
  const snapshot = {
    supervisorProperties,
    conflicts: all[7],
    resolutions: all[8],
    userId,
    organizationId: org,
    downloadedAt: new Date().toISOString(),
    properties,
    meters: all[0],
    assignments: all[1],
    routes: all[2],
    items: all[3],
    readings: all[4],
    reviews: all[5],
    photos: all[6],
    occupancy,
  } as unknown as MeterSnapshot;
  if (!reader) return snapshot;
  snapshot.routes = snapshot.routes.filter((r) => r.assigned_to === userId && r.status === 'open');
  const routes = new Set(snapshot.routes.map((r) => r.id));
  snapshot.items = snapshot.items.filter((i) => routes.has(i.route_id));
  const assignments = new Set(snapshot.items.map((i) => i.assignment_id));
  snapshot.assignments = snapshot.assignments.filter((a) => assignments.has(a.id));
  const meters = new Set(snapshot.assignments.map((a) => a.meter_id));
  snapshot.meters = snapshot.meters.filter((m) => meters.has(m.id)).map((m) => ({ ...m, notes: '' }));
  snapshot.readings = snapshot.readings
    .filter((r) => assignments.has(r.assignment_id))
    .map((r) => ({ ...r, notes: '' }));
  const readings = new Set(snapshot.readings.map((r) => r.id));
  snapshot.reviews = snapshot.reviews
    .filter((r) => readings.has(r.reading_id))
    .map((r) => ({ ...r, reason: '' }));
  snapshot.photos = [];
  snapshot.occupancy = [];
  snapshot.conflicts = snapshot.conflicts.filter((c) => c.actor_id === userId);
  const conflicts = new Set(snapshot.conflicts.map((c) => c.id));
  snapshot.resolutions = snapshot.resolutions.filter((r) => conflicts.has(r.conflict_id));
  snapshot.conflicts = [];
  const props = new Set(snapshot.routes.map((r) => r.property_id));
  snapshot.properties = snapshot.properties.filter((p) => props.has(p.id));
  return snapshot;
}
