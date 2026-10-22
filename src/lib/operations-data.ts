import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rows } from './billing-data';
import type { OperationsSnapshot } from './operations-domain';
export async function loadOperationsSnapshot(
  client: SupabaseClient,
  org: string,
  starts: string,
  ends: string
): Promise<OperationsSnapshot> {
  const names = [
    'staff_profiles',
    'suppliers',
    'inventory_items',
    'inventory_movements',
    'operations_plans',
    'work_orders',
    'work_order_events',
    'work_order_costs',
    'work_order_materials',
    'work_order_photos',
    'equipment',
    'equipment_loans',
    'equipment_events',
    'purchase_requests',
    'purchase_orders',
    'purchase_order_lines',
    'purchase_receipts',
    'checklist_runs',
    'checklist_entries',
    'operations_notifications',
  ];
  const [all, summary, context, schedule] = await Promise.all([
    Promise.all(names.map((n) => rows(client, n, org))),
    client.rpc('operations_summary', { org }),
    client.rpc('operations_context', { org }),
    client.rpc('operations_schedule', { org, starts_on: starts, ends_on: ends }),
  ]);
  if (summary.error || context.error || schedule.error) throw new Error('Operations summary unavailable.');
  for (const group of all)
    for (const row of group)
      for (const key of Object.keys(row))
        if ((key.endsWith('_cents') || key.endsWith('_milli')) && row[key] !== null)
          row[key] = String(row[key]);
  const [
    staff,
    suppliers,
    items,
    movements,
    plans,
    work,
    events,
    costs,
    materials,
    photos,
    equipment,
    loans,
    equipmentEvents,
    requests,
    orders,
    lines,
    receipts,
    runs,
    entries,
    notifications,
  ] = all;
  return {
    staff,
    suppliers,
    items,
    movements,
    plans,
    work,
    events,
    costs,
    materials,
    photos,
    equipment,
    loans,
    equipmentEvents,
    requests,
    orders,
    lines,
    receipts,
    runs,
    entries,
    notifications,
    summary: summary.data,
    context: context.data,
    schedule: schedule.data,
  } as unknown as OperationsSnapshot;
}
