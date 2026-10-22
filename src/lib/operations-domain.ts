export interface OpsRow {
  id: string;
  organization_id: string;
  property_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
}
export interface VersionedOpsRow extends OpsRow {
  version: number;
}
export type WorkStatus =
  'new' | 'assigned' | 'scheduled' | 'in_progress' | 'waiting_parts' | 'completed' | 'closed' | 'cancelled';
export interface WorkOrder extends VersionedOpsRow {
  number: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  site_id: string | null;
  customer_id: string | null;
  requested_on: string;
  due_on: string | null;
  assigned_to: string | null;
  status: WorkStatus;
  parts_required: string;
  plan_id: string | null;
  scheduled_for: string | null;
  completed_on: string | null;
  closed_on: string | null;
  approved_by: string | null;
}
export interface WorkEvent extends OpsRow {
  work_order_id: string;
  kind: string;
  body: string;
  minutes: number;
  performed_on: string;
  from_status: string | null;
  to_status: string | null;
}
export interface WorkCost extends OpsRow {
  work_order_id: string;
  kind: 'estimate' | 'expense' | 'reversal' | 'material' | 'material_return';
  amount_cents: string;
  description: string;
  reference: string;
  reverses_id: string | null;
  source_id: string | null;
}
export interface WorkMaterial extends OpsRow {
  work_order_id: string;
  item_id: string;
  quantity_milli: string;
  item_snapshot: { name: string; sku: string; unit: string; location: string };
  movement_id: string;
  returns_id: string | null;
  reason: string;
}
export interface WorkPhoto extends OpsRow {
  work_order_id: string;
  kind: 'request' | 'before' | 'after';
  caption: string;
  mime: string;
  byte_size: number;
  sha256: string;
  object_path: string;
  status: 'pending' | 'uploaded' | 'voided';
  void_reason: string;
}
export interface StaffProfile extends VersionedOpsRow {
  user_id: string;
  employee_code: string;
  name: string;
  email: string;
  phone: string;
  employment_status: 'active' | 'inactive';
  starts_on: string;
  supervisor_id: string | null;
  notes: string;
}
export interface Supplier extends VersionedOpsRow {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  archived: boolean;
}
export interface InventoryItem extends VersionedOpsRow {
  sku: string;
  name: string;
  category: string;
  unit: string;
  location: string;
  supplier_id: string | null;
  unit_cost_cents: string;
  reorder_milli: string;
  restock_milli: string;
  notes: string;
  archived: boolean;
}
export interface StockMovement extends OpsRow {
  item_id: string;
  kind: string;
  delta_milli: string;
  unit_cost_cents: string;
  total_cost_cents: string;
  effective_on: string;
  work_order_id: string | null;
  transfer_id: string | null;
  reference: string;
  reason: string;
}
export interface OpsPlan extends VersionedOpsRow {
  kind: 'maintenance' | 'checklist';
  label: string;
  description: string;
  category: string;
  site_id: string | null;
  assigned_to: string | null;
  anchor_on: string;
  interval_days: number;
  ends_on: string | null;
  items: string[];
  active: boolean;
}
export interface Equipment extends VersionedOpsRow {
  code: string;
  name: string;
  serial_number: string;
  condition: string;
  next_service_on: string | null;
  notes: string;
  archived: boolean;
}
export interface EquipmentLoan extends OpsRow {
  equipment_id: string;
  employee_id: string;
  work_order_id: string | null;
  checked_out_on: string;
  due_on: string;
  returned_on: string | null;
  checkout_condition: string;
  return_condition: string | null;
  reason: string;
  return_reason: string;
}
export interface EquipmentEvent extends OpsRow {
  equipment_id: string;
  work_order_id: string | null;
  kind: string;
  body: string;
  condition: string;
  performed_on: string;
}
export interface PurchaseRequest extends VersionedOpsRow {
  work_order_id: string | null;
  item_id: string;
  quantity_milli: string;
  needed_on: string;
  description: string;
  status: 'open' | 'approved' | 'declined' | 'ordered' | 'fulfilled' | 'cancelled';
  decision_reason: string;
}
export interface PurchaseOrder extends VersionedOpsRow {
  supplier_id: string;
  number: string;
  supplier_snapshot: { name: string; contact: string; email: string; phone: string; address: string };
  status: 'draft' | 'approved' | 'ordered' | 'cancelled';
  expected_on: string | null;
  reference: string;
  reason: string;
  approval_reason: string;
  approved_by: string | null;
}
export interface PurchaseLine extends OpsRow {
  purchase_order_id: string;
  item_id: string;
  quantity_milli: string;
  unit_cost_cents: string;
  total_cost_cents: string;
  item_snapshot: { name: string; sku: string; unit: string };
  request_id: string | null;
}
export interface PurchaseReceipt extends OpsRow {
  line_id: string;
  quantity_milli: string;
  movement_id: string;
  returns_id: string | null;
  effective_on: string;
  reference: string;
  reason: string;
}
export interface ChecklistRun extends VersionedOpsRow {
  plan_id: string;
  label: string;
  scheduled_for: string;
  assigned_to: string;
  items: { key: string; label: string }[];
  status: 'open' | 'closed' | 'cancelled';
  closed_on: string | null;
}
export interface ChecklistEntry extends OpsRow {
  run_id: string;
  item_key: string;
  status: 'done' | 'skipped' | 'reopen';
  notes: string;
}
export interface OpsNotification extends OpsRow {
  recipient_id: string;
  work_order_id: string | null;
  run_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
}
export interface ScheduleOccurrence {
  plan_id: string;
  property_id: string;
  kind: 'maintenance' | 'checklist';
  label: string;
  scheduled_for: string;
  entity_id: string | null;
}
export interface PartsOption {
  id: string;
  property_id: string;
  name: string;
  sku: string;
  unit: string;
  location: string;
  quantity_milli: string;
}
export interface EquipmentOption {
  id: string;
  property_id: string;
  name: string;
  code: string;
  condition: string;
  next_service_on: string | null;
  available: boolean;
}
export interface OperationsSnapshot {
  staff: StaffProfile[];
  suppliers: Supplier[];
  items: InventoryItem[];
  movements: StockMovement[];
  plans: OpsPlan[];
  work: WorkOrder[];
  events: WorkEvent[];
  costs: WorkCost[];
  materials: WorkMaterial[];
  photos: WorkPhoto[];
  equipment: Equipment[];
  loans: EquipmentLoan[];
  equipmentEvents: EquipmentEvent[];
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
  lines: PurchaseLine[];
  receipts: PurchaseReceipt[];
  runs: ChecklistRun[];
  entries: ChecklistEntry[];
  notifications: OpsNotification[];
  schedule: ScheduleOccurrence[];
  summary: {
    stock: { id: string; quantity_milli: string; last_purchase_on: string | null }[];
    work_costs: { id: string; actual_cents: string; estimate_cents: string | null }[];
    purchase_lines: { id: string; received_milli: string }[];
  };
  context: {
    work: { id: string; site_label: string | null; section: string | null; assigned_name: string | null }[];
    parts: PartsOption[];
    equipment: EquipmentOption[];
    roles: { property_id: string; user_id: string; role: string }[];
  };
}
export const opsLabel = (value: string) => value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
export function quantityToMilli(value: string, signed = false): string {
  const raw = value.trim();
  if (!(signed ? /^-?\d{1,9}(\.\d{1,3})?$/ : /^\d{1,9}(\.\d{1,3})?$/).test(raw))
    throw new Error('Enter quantity with at most three decimal places.');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const n = (BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))) * (raw.startsWith('-') ? -1n : 1n);
  return n.toString();
}
export function quantity(value: string): string {
  const n = BigInt(value),
    a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${a / 1000n}${a % 1000n ? '.' + (a % 1000n).toString().padStart(3, '0').replace(/0+$/, '') : ''}`;
}
export function checklistState(entries: ChecklistEntry[], runId: string, itemKey: string) {
  return entries
    .filter((e) => e.run_id === runId && e.item_key === itemKey)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
export function purchaseState(
  order: PurchaseOrder,
  lines: PurchaseLine[],
  totals: OperationsSnapshot['summary']['purchase_lines']
) {
  if (order.status !== 'ordered') return order.status;
  const own = lines.filter((l) => l.purchase_order_id === order.id);
  if (
    own.length &&
    own.every(
      (l) => BigInt(totals.find((t) => t.id === l.id)?.received_milli ?? '0') === BigInt(l.quantity_milli)
    )
  )
    return 'received';
  return own.some((l) => BigInt(totals.find((t) => t.id === l.id)?.received_milli ?? '0') > 0n)
    ? 'part_received'
    : 'ordered';
}
export function operationAlerts(data: OperationsSnapshot, propertyId: string, today: string) {
  const alerts: { key: string; text: string; type: string; id: string }[] = [];
  for (const w of data.work.filter((w) => w.property_id === propertyId)) {
    if (w.status === 'completed')
      alerts.push({
        key: `approval:${w.id}`,
        text: `${w.number} · Completion awaiting manager approval`,
        type: 'work_detail',
        id: w.id,
      });
    else if (w.due_on && w.due_on < today && !['closed', 'cancelled'].includes(w.status))
      alerts.push({
        key: `work:${w.id}`,
        text: `${w.number} · Overdue since ${w.due_on}`,
        type: 'work_detail',
        id: w.id,
      });
  }
  for (const i of data.items.filter((i) => i.property_id === propertyId && !i.archived)) {
    const q = data.summary.stock.find((s) => s.id === i.id)?.quantity_milli ?? '0';
    if (BigInt(q) <= BigInt(i.reorder_milli))
      alerts.push({
        key: `stock:${i.id}`,
        text: `${i.sku} · Low stock: ${quantity(q)} ${i.unit}`,
        type: 'stock_detail',
        id: i.id,
      });
  }
  for (const r of data.runs.filter(
    (r) => r.property_id === propertyId && r.status === 'open' && r.scheduled_for < today
  ))
    alerts.push({
      key: `run:${r.id}`,
      text: `${r.label} · Checklist overdue since ${r.scheduled_for}`,
      type: 'run_detail',
      id: r.id,
    });
  for (const e of data.equipment.filter(
    (e) => e.property_id === propertyId && !e.archived && e.next_service_on && e.next_service_on < today
  ))
    alerts.push({
      key: `equipment:${e.id}`,
      text: `${e.name} · Service overdue since ${e.next_service_on}`,
      type: 'equipment_detail',
      id: e.id,
    });
  for (const l of data.loans.filter(
    (l) => l.property_id === propertyId && !l.returned_on && l.due_on < today
  ))
    alerts.push({
      key: `loan:${l.id}`,
      text: `Equipment return overdue since ${l.due_on}`,
      type: 'equipment_detail',
      id: l.equipment_id,
    });
  return alerts;
}
