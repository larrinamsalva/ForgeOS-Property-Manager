import { z } from 'zod';
const uuid = z.uuid(),
  maybeId = uuid.nullable(),
  date = z.iso.date(),
  reason = z.string().trim().min(3).max(2000),
  reference = z.string().trim().max(500),
  text = z.string().trim().max(2000),
  name = z.string().trim().min(1).max(160),
  amount = z.string().regex(/^\d{1,12}$/),
  qty = z
    .string()
    .regex(/^\d{1,12}$/)
    .refine((v) => /^\d{1,12}$/.test(v) && BigInt(v) > 0n),
  signedQty = z
    .string()
    .regex(/^-?\d{1,12}$/)
    .refine((v) => /^-?\d{1,12}$/.test(v) && BigInt(v) !== 0n);
const scope = { organization_id: uuid, property_id: uuid, request_id: uuid, reason };
const entry = <T extends string, S extends z.ZodRawShape>(command: T, shape: S) =>
  z.object({ command: z.literal(command), payload: z.object({ ...scope, ...shape }).strict() }).strict();
const edit = { id: maybeId, version: z.number().int().positive().nullable() },
  condition = z.enum(['good', 'fair', 'needs_repair', 'out_of_service', 'retired']);
export const operationsCommandSchema = z.discriminatedUnion('command', [
  entry('save_staff', {
    ...edit,
    user_id: uuid,
    employee_code: z.string().trim().min(1).max(60),
    name,
    email: z.string().max(320),
    phone: z.string().max(100),
    employment_status: z.enum(['active', 'inactive']),
    starts_on: date,
    supervisor_id: maybeId,
    notes: text,
  }),
  entry('save_supplier', {
    ...edit,
    name,
    contact: z.string().max(160),
    email: z.string().max(320),
    phone: z.string().max(100),
    address: z.string().max(1000),
    notes: text,
    archived: z.boolean(),
  }),
  entry('save_item', {
    ...edit,
    sku: z.string().trim().min(1).max(60),
    name,
    category: z.string().max(100),
    unit: z.string().trim().min(1).max(30),
    location: z.string().max(160),
    supplier_id: maybeId,
    unit_cost_cents: amount,
    reorder_milli: amount,
    restock_milli: amount,
    notes: text,
    archived: z.boolean(),
  }),
  entry('save_plan', {
    ...edit,
    kind: z.enum(['maintenance', 'checklist']),
    label: name,
    description: text,
    category: z.string().max(100),
    site_id: maybeId,
    assigned_to: maybeId,
    anchor_on: date,
    interval_days: z.number().int().min(1).max(366),
    ends_on: date.nullable(),
    items: z.array(z.string().trim().min(1).max(200)).max(50),
    active: z.boolean(),
  }),
  entry('save_equipment', {
    ...edit,
    code: z.string().trim().min(1).max(60),
    name,
    serial_number: z.string().max(160),
    condition,
    next_service_on: date.nullable(),
    notes: text,
    archived: z.boolean(),
  }),
  entry('new_work', {
    title: name,
    description: z.string().trim().min(3).max(4000),
    category: z.string().max(100),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    site_id: maybeId,
    customer_id: maybeId,
    requested_on: date,
    due_on: date.nullable(),
    assigned_to: maybeId,
    parts_required: text,
  }),
  entry('edit_work', {
    work_order_id: uuid,
    version: z.number().int().positive(),
    title: name,
    description: z.string().trim().min(3).max(4000),
    category: z.string().max(100),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    due_on: date.nullable(),
    assigned_to: maybeId,
    parts_required: text,
  }),
  entry('work_status', {
    work_order_id: uuid,
    version: z.number().int().positive(),
    status: z.enum(['in_progress', 'waiting_parts', 'completed', 'closed', 'cancelled']),
  }),
  entry('work_note', { work_order_id: uuid, minutes: z.number().int().min(0).max(1440), effective_on: date }),
  entry('work_cost', {
    work_order_id: uuid,
    kind: z.enum(['estimate', 'expense']),
    amount_cents: amount,
    reference,
  }),
  entry('reverse_cost', { work_order_id: uuid, cost_id: uuid, reference }),
  entry('receive_stock', {
    item_id: uuid,
    quantity_milli: qty,
    unit_cost_cents: amount,
    effective_on: date,
    reference,
  }),
  entry('adjust_stock', { item_id: uuid, quantity_milli: signedQty, effective_on: date, reference }),
  entry('transfer_stock', {
    item_id: uuid,
    destination_property_id: uuid,
    destination_item_id: uuid,
    quantity_milli: qty,
    effective_on: date,
    reference,
  }),
  entry('use_material', {
    work_order_id: uuid,
    item_id: uuid,
    quantity_milli: qty,
    effective_on: date,
    reference,
  }),
  entry('return_material', {
    work_order_id: uuid,
    material_id: uuid,
    quantity_milli: qty,
    effective_on: date,
    reference,
  }),
  entry('purchase_request', { work_order_id: maybeId, item_id: uuid, quantity_milli: qty, needed_on: date }),
  entry('decide_purchase', {
    id: uuid,
    version: z.number().int().positive(),
    status: z.enum(['approved', 'declined', 'cancelled']),
  }),
  entry('new_purchase', {
    supplier_id: uuid,
    expected_on: date.nullable(),
    reference,
    lines: z
      .array(
        z
          .object({
            item_id: uuid,
            quantity_milli: qty,
            unit_cost_cents: amount,
            purchase_request_id: maybeId,
          })
          .strict()
      )
      .min(1)
      .max(30),
  }),
  entry('purchase_status', {
    id: uuid,
    version: z.number().int().positive(),
    status: z.enum(['approved', 'ordered', 'cancelled']),
    reference,
  }),
  entry('receive_purchase', { line_id: uuid, quantity_milli: qty, effective_on: date, reference }),
  entry('return_purchase', { receipt_id: uuid, quantity_milli: qty, effective_on: date, reference }),
  entry('checkout_equipment', {
    equipment_id: uuid,
    employee_id: uuid,
    work_order_id: maybeId,
    effective_on: date,
    due_on: date,
  }),
  entry('return_equipment', {
    loan_id: uuid,
    effective_on: date,
    condition: z.enum(['good', 'fair', 'needs_repair', 'out_of_service']),
  }),
  entry('service_equipment', {
    equipment_id: uuid,
    work_order_id: maybeId,
    effective_on: date,
    next_service_on: date.nullable(),
    condition,
  }),
  entry('generate_occurrence', { plan_id: uuid, scheduled_for: date }),
  entry('checklist_entry', {
    run_id: uuid,
    item_key: z.string().regex(/^item-\d{1,2}$/),
    status: z.enum(['done', 'skipped', 'reopen']),
  }),
  entry('checklist_status', {
    run_id: uuid,
    version: z.number().int().positive(),
    status: z.enum(['open', 'closed', 'cancelled']),
  }),
  entry('queue_work_photo', {
    work_order_id: uuid,
    kind: z.enum(['request', 'before', 'after']),
    caption: z.string().max(500),
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    byte_size: z.number().int().min(1).max(5242880),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  entry('void_work_photo', { id: uuid }),
  entry('read_notification', { id: uuid }),
]);
export function operationsError(code: string, message: string) {
  const messages: Record<string, string> = {
    operations_reason_required: 'Add a clear reason or work note.',
    operations_conflict: 'This record changed. Reload before editing or approving it.',
    operation_conflict: 'This retry ID has different content. Reload before starting a new action.',
    property_unavailable: 'Restore and activate this property before recording operations.',
    employee_access_required:
      'The employee needs a registered account and an authorized property role in Team & access first.',
    employee_unavailable: 'Choose an active staff profile with current access to this property.',
    employee_identity_immutable:
      'Keep the employee account identity. Create a separate profile for another account.',
    invalid_supervisor: 'Choose an existing property manager or organization owner/administrator.',
    operations_scope: 'Choose records belonging to this property.',
    supplier_unavailable: 'Choose an active supplier at this property.',
    item_unavailable: 'Choose an active stock item at this property.',
    item_in_use: 'Stock must be zero and pending purchase quantities resolved before archiving this item.',
    stock_identity_immutable:
      'An item with stock history keeps its SKU and unit. Create a new item for a different unit or code.',
    invalid_checklist: 'Use 1–50 checklist items and assign an active employee.',
    plan_kind_immutable: 'Create a new plan to change between maintenance and checklist types.',
    invalid_operations_date:
      'Check the transaction date, original record dates and return/due dates. Completed activity cannot be future-dated.',
    invalid_work_transition: 'That work status change is unavailable. Reload and review the current status.',
    completion_approval_required: 'Only a manager can close a completed work order after review.',
    invalid_work_cost: 'Choose an original expense to reverse, or record a valid estimate/expense.',
    insufficient_stock: 'This action exceeds the available stock. Reload current quantities.',
    stock_date_overdraw: 'This date would use stock before it was received. Choose a later date.',
    invalid_material_return:
      'Return no more than the original material quantity that has not already been returned.',
    incompatible_stock_transfer:
      'Transfer requires matching SKU and unit at another property where you have manager access.',
    purchase_not_ordered: 'Approve and manually record the order as placed before receiving stock.',
    purchase_exceeds_order: 'The receipt exceeds this line’s remaining ordered quantity.',
    invalid_purchase_return: 'Return no more than the original receipt quantity and available stock.',
    approved_purchase_request_required:
      'Link an approved, unclaimed request with the same item and quantity.',
    invalid_purchase_transition:
      'That purchase status change is unavailable. Review its approval and receipts.',
    purchase_has_receipts: 'Return all net received stock before cancelling the purchase order.',
    purchase_reference_required:
      'Record the external order confirmation reference. ForgeOS does not send the order.',
    equipment_checked_out: 'Return the current equipment loan before archiving or servicing it.',
    equipment_unavailable: 'Equipment is unavailable, needs repair, or is overdue for service.',
    completed_repair_required: 'Link a completed or closed repair work order.',
    invalid_occurrence: 'Choose a scheduled occurrence inside the active plan and within one year ahead.',
    checklist_incomplete: 'Complete or explicitly skip every checklist item before closing this run.',
    invalid_checklist_entry: 'This run is closed, future-dated, or does not contain that item.',
    invalid_checklist_transition: 'Only a manager or office worker can reopen or cancel this run.',
    operations_amount_limit: 'The calculated cost exceeds the supported limit.',
  };
  if (code === '42501')
    return { status: 403, error: 'Your role or assignment does not permit this operation at this property.' };
  if (messages[message]) return { status: 409, error: messages[message] };
  if (['23505', '23P01'].includes(code))
    return {
      status: 409,
      error:
        'This record, occurrence, stock code or active equipment loan already exists. Reload before retrying.',
    };
  if (['23514', '23502', '23503', '22P02', '22007', '22008'].includes(code))
    return { status: 400, error: 'Check required fields, quantities, dates and matching property records.' };
  return {
    status: 503,
    error:
      'Operations could not be saved. No partial changes were committed. Check the connection and retry.',
  };
}
