'use client';
import { Modal } from '../modal';
import { RecordForm, type Field } from '../record-form';
import { PurchaseForm } from './purchase-form';
import { WorkPhotoForm } from './work-photos';
import { WorkDetail, StockDetail, EquipmentDetail, RunDetail, PurchaseDetail } from './panels';
import { addDays, customerName } from '@/lib/domain';
import { collectionDollars } from '@/lib/collections-domain';
import { quantity, quantityToMilli, opsLabel } from '@/lib/operations-domain';
import { maintenanceCategories, maintenanceAreas, formatMaintenanceDescription, getSavedMaintenanceDescription } from '@/lib/maintenance-catalog';
import type { OpsUI, OpsEditor } from './types';
const reason: Field = { name: 'reason', label: 'Reason / work note', type: 'textarea', required: true };
const reference: Field = { name: 'reference', label: 'Supporting reference' };
const qty: Field = {
  name: 'quantity',
  label: 'Quantity',
  required: true,
  help: 'Up to three decimal places. Use the item’s recorded unit.',
};
const amount: Field = { name: 'amount', label: 'Amount ($)', required: true };
const choices = (values: string[]) => values.map((value) => ({ value, label: opsLabel(value) }));
const decimal = (v = '0') => `${BigInt(v) / 100n}.${(BigInt(v) % 100n).toString().padStart(2, '0')}`;
export function OperationsEditor({
  ui,
  editor,
  close,
  save,
  command,
  finish,
}: {
  ui: OpsUI;
  editor: OpsEditor;
  close: () => void;
  save: (action: string, v: Record<string, unknown>) => Promise<{ id: string }>;
  command: (action: string, v: Record<string, unknown>) => Promise<{ id: string }>;
  finish: () => void;
}) {
  const { data, snapshot, propertyId, today } = ui;
  const id = editor.id;
  const work = data.work.find((w) => w.id === id),
    item = data.items.find((i) => i.id === id),
    supplier = data.suppliers.find((s) => s.id === id),
    staff = data.staff.find((s) => s.id === id),
    plan = data.plans.find((p) => p.id === id),
    equipment = data.equipment.find((e) => e.id === id) ?? data.context.equipment.find((e) => e.id === id),
    loan = data.loans.find((l) => l.id === id),
    request = data.requests.find((r) => r.id === id),
    order = data.orders.find((o) => o.id === id),
    run = data.runs.find((r) => r.id === id);
  const employees = data.staff
    .filter((s) => s.property_id === propertyId && s.employment_status === 'active')
    .map((s) => ({ value: s.user_id, label: `${s.name} · ${s.employee_code}` }));
  const assign: Field = {
    name: 'assigned_to',
    label: 'Assigned employee',
    type: 'select',
    options: employees,
    default: work?.assigned_to ?? plan?.assigned_to ?? '',
  };
  const day: Field = {
    name: 'effective_on',
    label: 'Activity date',
    type: 'date',
    default: today,
    min: '2000-01-01',
    max: today,
    required: true,
  };
  const ref = editor.relatedId;
  let title = '',
    description = '',
    fields: Field[] = [];
  let onSave: (v: Record<string, unknown>) => Promise<unknown> = (v) => save(editor.type, v);
  const detail = {
    work_detail: <WorkDetail ui={ui} id={id ?? ''} />,
    stock_detail: <StockDetail ui={ui} id={id ?? ''} />,
    equipment_detail: <EquipmentDetail ui={ui} id={id ?? ''} />,
    run_detail: <RunDetail ui={ui} id={id ?? ''} />,
    purchase_detail: <PurchaseDetail ui={ui} id={id ?? ''} />,
  }[editor.type];
  if (detail)
    return (
      <Modal
        title={
          editor.type === 'work_detail'
            ? `${work?.number ?? 'Work order'} · ${work?.title ?? ''}`
            : opsLabel(editor.type.replace('_detail', ' history'))
        }
        onClose={close}
      >
        {detail}
      </Modal>
    );
  if (editor.type === 'new_purchase')
    return (
      <Modal title="Prepare purchase order" onClose={close}>
        <PurchaseForm ui={ui} onSave={(v) => save('new_purchase', v)} onCancel={close} />
      </Modal>
    );
  if (editor.type === 'photo')
    return (
      <Modal title="Add work photograph" onClose={close}>
        <WorkPhotoForm
          workId={id ?? ''}
          existing={data.photos.find((p) => p.id === ref)}
          queue={(v) => command('queue_work_photo', v)}
          onCancel={close}
          onComplete={finish}
        />
      </Modal>
    );
  if (editor.type === 'save_staff') {
    title = staff ? 'Edit staff profile' : 'Add staff profile';
    description =
      'The employee must first have a registered account and manager, office or maintenance access in Team & access. Employment status controls operations assignments; revoke account/property access separately in Team & access.';
    fields = [
      { name: 'user_id', label: 'Registered user ID', required: true, default: staff?.user_id ?? '' },
      { name: 'employee_code', label: 'Employee code', required: true, default: staff?.employee_code ?? '' },
      { name: 'name', label: 'Employee name', required: true, default: staff?.name ?? '' },
      { name: 'email', label: 'Employee email', type: 'email', default: staff?.email ?? '' },
      { name: 'phone', label: 'Employee phone', default: staff?.phone ?? '' },
      {
        name: 'employment_status',
        label: 'Employment status',
        type: 'select',
        options: choices(['active', 'inactive']),
        default: staff?.employment_status ?? 'active',
        required: true,
      },
      {
        name: 'starts_on',
        label: 'Start date',
        type: 'date',
        default: staff?.starts_on ?? today,
        required: true,
      },
      { name: 'supervisor_id', label: 'Supervisor user ID (optional)', default: staff?.supervisor_id ?? '' },
      { name: 'notes', label: 'Staff notes', type: 'textarea', default: staff?.notes ?? '' },
      reason,
    ];
    onSave = (v) =>
      save('save_staff', {
        ...v,
        id: staff?.id ?? null,
        version: staff?.version ?? null,
        supervisor_id: v.supervisor_id || null,
      });
  }
  if (editor.type === 'save_supplier') {
    title = supplier ? 'Edit supplier' : 'Add supplier';
    fields = [
      { name: 'name', label: 'Supplier name', required: true, default: supplier?.name ?? '' },
      { name: 'contact', label: 'Supplier contact', default: supplier?.contact ?? '' },
      { name: 'email', label: 'Supplier email', type: 'email', default: supplier?.email ?? '' },
      { name: 'phone', label: 'Supplier phone', default: supplier?.phone ?? '' },
      { name: 'address', label: 'Supplier address', type: 'textarea', default: supplier?.address ?? '' },
      { name: 'notes', label: 'Supplier notes', type: 'textarea', default: supplier?.notes ?? '' },
      { name: 'archived', label: 'Archive supplier', type: 'checkbox', default: supplier?.archived ?? false },
      reason,
    ];
    onSave = (v) =>
      save('save_supplier', { ...v, id: supplier?.id ?? null, version: supplier?.version ?? null });
  }
  if (editor.type === 'save_item') {
    title = item ? 'Edit stock item' : 'Add stock item';
    description =
      'Standard unit cost is a reference for new material issues. Actual receipt costs and earlier usage costs remain in history. SKU and unit become fixed after stock history exists.';
    fields = [
      { name: 'sku', label: 'SKU / stock code', required: true, default: item?.sku ?? '' },
      { name: 'name', label: 'Item name', required: true, default: item?.name ?? '' },
      { name: 'category', label: 'Stock category', default: item?.category ?? '' },
      { name: 'unit', label: 'Unit of measure', default: item?.unit ?? 'each', required: true },
      { name: 'location', label: 'Storage location', default: item?.location ?? '' },
      {
        name: 'supplier_id',
        label: 'Preferred supplier (optional)',
        type: 'select',
        options: data.suppliers
          .filter((s) => s.property_id === propertyId && !s.archived)
          .map((s) => ({ value: s.id, label: s.name })),
        default: item?.supplier_id ?? '',
      },
      {
        name: 'unit_cost',
        label: 'Standard unit cost ($)',
        default: decimal(item?.unit_cost_cents),
        required: true,
      },
      {
        name: 'reorder',
        label: 'Reorder threshold',
        default: quantity(item?.reorder_milli ?? '0'),
        required: true,
      },
      {
        name: 'restock',
        label: 'Suggested restock quantity',
        default: quantity(item?.restock_milli ?? '0'),
        required: true,
      },
      { name: 'notes', label: 'Item notes', type: 'textarea', default: item?.notes ?? '' },
      {
        name: 'archived',
        label: 'Archive zero-stock item',
        type: 'checkbox',
        default: item?.archived ?? false,
      },
      reason,
    ];
    onSave = (v) =>
      save('save_item', {
        ...v,
        id: item?.id ?? null,
        version: item?.version ?? null,
        supplier_id: v.supplier_id || null,
        unit_cost: undefined,
        reorder: undefined,
        restock: undefined,
        unit_cost_cents: collectionDollars(String(v.unit_cost)),
        reorder_milli: quantityToMilli(String(v.reorder)),
        restock_milli: quantityToMilli(String(v.restock)),
      });
  }
  if (editor.type === 'save_plan') {
    title = plan ? 'Edit recurring plan' : 'Add recurring plan';
    description =
      'Create each due occurrence explicitly from the calendar. Intervals count calendar days (30 days is not a calendar month). Generated work and checklist snapshots are retained when a plan changes.';
    fields = [
      {
        name: 'kind',
        label: 'Plan type',
        type: 'select',
        options: choices(['maintenance', 'checklist']),
        default: plan?.kind ?? editor.value ?? 'maintenance',
        required: true,
      },
      { name: 'label', label: 'Plan name', required: true, default: plan?.label ?? '' },
      { name: 'description', label: 'Plan instructions', type: 'textarea', default: plan?.description ?? '' },
      { name: 'category', label: 'Plan category', default: plan?.category ?? '' },
      {
        name: 'site_id',
        label: 'Related site (optional)',
        type: 'select',
        options: snapshot.sites
          .filter((s) => s.property_id === propertyId && !s.archived_at)
          .map((s) => ({ value: s.id, label: s.label })),
        default: plan?.site_id ?? '',
      },
      assign,
      {
        name: 'anchor_on',
        label: 'First occurrence date',
        type: 'date',
        default: plan?.anchor_on ?? today,
        required: true,
      },
      {
        name: 'interval_days',
        label: 'Repeat every (days)',
        type: 'number',
        min: '1',
        max: '366',
        default: String(plan?.interval_days ?? 1),
        required: true,
      },
      { name: 'ends_on', label: 'End date (optional)', type: 'date', default: plan?.ends_on ?? '' },
      {
        name: 'items_text',
        label: 'Checklist items (one per line)',
        type: 'textarea',
        default: plan?.items.join('\n') ?? '',
        help: 'Required for checklist plans. Maximum 50 items; each up to 200 characters.',
      },
      { name: 'active', label: 'Plan active', type: 'checkbox', default: plan?.active ?? true },
      reason,
    ];
    onSave = (v) =>
      save('save_plan', {
        ...v,
        id: plan?.id ?? null,
        version: plan?.version ?? null,
        site_id: v.site_id || null,
        assigned_to: v.assigned_to || null,
        ends_on: v.ends_on || null,
        interval_days: Number(v.interval_days),
        items_text: undefined,
        items: String(v.items_text)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
  }
  if (editor.type === 'save_equipment') {
    const e = data.equipment.find((e) => e.id === id);
    title = e ? 'Edit equipment' : 'Add equipment';
    fields = [
      { name: 'code', label: 'Equipment code', default: e?.code ?? '', required: true },
      { name: 'name', label: 'Equipment name', default: e?.name ?? '', required: true },
      { name: 'serial_number', label: 'Serial number', default: e?.serial_number ?? '' },
      {
        name: 'condition',
        label: 'Equipment condition',
        type: 'select',
        options: choices(['good', 'fair', 'needs_repair', 'out_of_service', 'retired']),
        default: e?.condition ?? 'good',
        required: true,
      },
      {
        name: 'next_service_on',
        label: 'Next service date (optional)',
        type: 'date',
        default: e?.next_service_on ?? '',
      },
      { name: 'notes', label: 'Equipment notes', type: 'textarea', default: e?.notes ?? '' },
      { name: 'archived', label: 'Archive equipment', type: 'checkbox', default: e?.archived ?? false },
      reason,
    ];
    onSave = (v) =>
      save('save_equipment', {
        ...v,
        id: e?.id ?? null,
        version: e?.version ?? null,
        next_service_on: v.next_service_on || null,
      });
  }
  if (editor.type === 'new_work' || editor.type === 'edit_work' || editor.type === 'maintenance_self_task') {
    const selfTask = editor.type === 'maintenance_self_task';
    const savedArea = getSavedMaintenanceDescription(work?.description ?? '');
    const serviceAreas = maintenanceAreas.map((a) => ({ value: a.value, label: a.label }));
    title = selfTask ? 'Create my maintenance task' : work ? 'Edit work order' : 'New maintenance request';
    description = selfTask
      ? 'Create a task assigned to you. The property manager can review and close it. Customer billing and payment information is not available here.'
      : 'Choose the service type and exact work area. Tasks for bathrooms, laundry, dumpsters and grounds do not require a resident or site.';
    fields = [
      { name: 'title', label: 'Work title', required: true, default: work?.title ?? '' },
      {
        name: 'description',
        label: 'Problem / work description',
        type: 'textarea',
        required: true,
        default: savedArea.description,
      },
      {
        name: 'category', label: 'Type of maintenance job', type: 'select', required: true,
        options: [
          ...maintenanceCategories.map((v) => ({ value: v, label: v })),
          ...(work?.category && !maintenanceCategories.includes(work.category as typeof maintenanceCategories[number])
            ? [{ value: work.category, label: work.category }] : []),
        ],
        default: work?.category ?? 'General repairs',
      },
      { name: 'work_area', label: 'What area needs service?', type: 'select', required: true,
        options: serviceAreas, default: savedArea.area },
      { name: 'area_detail', label: 'Exact spot (building, zone, row, or landmark)',
        default: savedArea.detail,
        help: 'Examples: Laundry building B, restroom near gate, row 4, irrigation zone 2.' },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        options: choices(['low', 'normal', 'high', 'urgent']),
        default: work?.priority ?? 'normal',
        required: true,
      },
      ...(!work
        ? [
            {
              name: 'site_id',
              label: 'Site / unit (optional)',
              type: 'select' as const,
              options: snapshot.sites
                .filter((s) => s.property_id === propertyId && !s.archived_at)
                .map((s) => ({ value: s.id, label: s.label })),
            },
            ...(!selfTask ? [{
              name: 'customer_id',
              label: 'Customer (optional)',
              type: 'select' as const,
              options: snapshot.customers
                .filter((c) => c.property_id === propertyId)
                .map((c) => ({ value: c.id, label: customerName(c) })),
            }] : []),
            {
              name: 'requested_on',
              label: 'Request date',
              type: 'date' as const,
              default: today,
              max: today,
              min: '2000-01-01',
              required: true,
            },
          ]
        : []),
      {
        name: 'due_on',
        label: 'Scheduled / due date (optional)',
        type: 'date',
        default: work?.due_on ?? today,
      },
      ...(!selfTask ? [assign] : []),
      {
        name: 'parts_required',
        label: 'Parts required',
        type: 'textarea',
        default: work?.parts_required ?? '',
      },
      reason,
    ];
    onSave = (v) => {
      const fullDescription = formatMaintenanceDescription(String(v.work_area), String(v.area_detail), String(v.description));
      return save(editor.type, {
        ...v,
        description: fullDescription,
        work_area: selfTask ? v.work_area : undefined,
        area_detail: undefined,
        due_on: v.due_on || null,
        assigned_to: selfTask ? undefined : (v.assigned_to || null),
        ...(work
          ? { work_order_id: work.id, version: work.version }
          : { site_id: v.site_id || null, ...(!selfTask ? { customer_id: v.customer_id || null } : {}) }),
      });
    };
  }
  if (editor.type === 'work_status' && work) {
    title = `${editor.value === 'closed' ? 'Approve & close' : opsLabel(editor.value ?? '')} ${work.number}`;
    description =
      editor.value === 'closed'
        ? 'Confirm completion, recorded time, materials, photos and actual costs. Approval is retained in history.'
        : 'Record the status change and reason. Reopening keeps earlier approvals and completion evidence.';
    fields = [reason];
    onSave = (v) =>
      save('work_status', { ...v, work_order_id: work.id, version: work.version, status: editor.value });
  }
  if (editor.type === 'work_note' && work) {
    title = `Work note & time · ${work.number}`;
    fields = [
      {
        name: 'minutes',
        label: 'Minutes worked (0 for note only)',
        type: 'number',
        min: '0',
        max: '1440',
        default: '0',
        required: true,
      },
      day,
      reason,
    ];
    onSave = (v) => save('work_note', { ...v, minutes: Number(v.minutes), work_order_id: work.id });
  }
  if (editor.type === 'work_cost' && work) {
    title = editor.value === 'estimate' ? 'Record work estimate' : 'Record actual expense';
    description = 'Operational cost record only. This does not charge a tenant or send a payment.';
    fields = [amount, reference, reason];
    onSave = (v) =>
      save('work_cost', {
        amount_cents: collectionDollars(String(v.amount)),
        reference: v.reference,
        reason: v.reason,
        work_order_id: work.id,
        kind: editor.value ?? 'expense',
      });
  }
  if (editor.type === 'reverse_cost') {
    title = 'Reverse actual expense';
    fields = [reference, reason];
    onSave = (v) => save('reverse_cost', { ...v, cost_id: id, work_order_id: ref });
  }
  if (['receive_stock', 'adjust_stock', 'transfer_stock'].includes(editor.type) && item) {
    title =
      editor.type === 'receive_stock'
        ? 'Receive stock'
        : editor.type === 'adjust_stock'
          ? 'Adjust stock'
          : 'Transfer stock';
    description =
      editor.type === 'adjust_stock'
        ? 'Use a signed quantity: positive adds stock; negative removes it. The original movement history remains.'
        : editor.type === 'transfer_stock'
          ? 'Both properties must be active with manager access, and both items must use the same SKU and unit. Both movements save together.'
          : 'Record a delivery already received. This does not place an order or pay a supplier.';
    fields = [
      qty,
      ...(editor.type === 'receive_stock'
        ? [
            {
              name: 'unit_cost',
              label: 'Received unit cost ($)',
              required: true,
              default: decimal(item.unit_cost_cents),
            },
          ]
        : []),
      ...(editor.type === 'transfer_stock'
        ? [
            {
              name: 'destination_item_id',
              label: 'Destination property / item',
              type: 'select' as const,
              required: true,
              options: data.items
                .filter(
                  (i) =>
                    i.property_id !== propertyId &&
                    !i.archived &&
                    i.sku.toLowerCase() === item.sku.toLowerCase() &&
                    i.unit === item.unit
                )
                .map((i) => ({
                  value: i.id,
                  label: `${snapshot.properties.find((p) => p.id === i.property_id)?.name} · ${i.sku} · ${i.name}`,
                })),
            },
          ]
        : []),
      day,
      reference,
      reason,
    ];
    onSave = (v) =>
      save(editor.type, {
        ...v,
        item_id: item.id,
        quantity: undefined,
        quantity_milli: quantityToMilli(String(v.quantity), editor.type === 'adjust_stock'),
        ...(editor.type === 'receive_stock'
          ? { unit_cost: undefined, unit_cost_cents: collectionDollars(String(v.unit_cost)) }
          : {}),
        ...(editor.type === 'transfer_stock'
          ? { destination_property_id: data.items.find((i) => i.id === v.destination_item_id)?.property_id }
          : {}),
      });
  }
  if (editor.type === 'use_material' || editor.type === 'return_material') {
    title = editor.type === 'use_material' ? 'Use work materials' : 'Return unused work materials';
    fields = [
      ...(editor.type === 'use_material'
        ? [
            {
              name: 'item_id',
              label: 'Material item',
              type: 'select' as const,
              required: true,
              options: data.context.parts
                .filter((i) => i.property_id === propertyId)
                .map((i) => ({
                  value: i.id,
                  label: `${i.sku} · ${i.name} · ${quantity(i.quantity_milli)} ${i.unit} available`,
                })),
            },
          ]
        : []),
      qty,
      day,
      reference,
      reason,
    ];
    onSave = (v) =>
      save(editor.type, {
        ...v,
        quantity: undefined,
        quantity_milli: quantityToMilli(String(v.quantity)),
        work_order_id: editor.type === 'use_material' ? id : ref,
        ...(editor.type === 'return_material' ? { material_id: id } : {}),
      });
  }
  if (editor.type === 'purchase_request') {
    title = 'Request parts / supplies';
    fields = [
      {
        name: 'item_id',
        label: 'Requested item',
        type: 'select',
        required: true,
        default: ref ?? '',
        options: data.context.parts
          .filter((i) => i.property_id === propertyId)
          .map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` })),
      },
      qty,
      { name: 'needed_on', label: 'Needed date', type: 'date', default: today, required: true },
      reason,
    ];
    onSave = (v) =>
      save('purchase_request', {
        ...v,
        quantity: undefined,
        quantity_milli: quantityToMilli(String(v.quantity)),
        work_order_id: id ?? null,
      });
  }
  if (editor.type === 'decide_purchase' && request) {
    title = `${opsLabel(editor.value ?? 'approved')} purchase request`;
    fields = [reason];
    onSave = (v) =>
      save('decide_purchase', { ...v, id: request.id, version: request.version, status: editor.value });
  }
  if (editor.type === 'purchase_status' && order) {
    title =
      editor.value === 'ordered'
        ? 'Record order placed'
        : editor.value === 'approved'
          ? 'Approve purchase order'
          : 'Cancel purchase order';
    description =
      editor.value === 'ordered'
        ? 'Record the supplier confirmation after placing this order through your existing process. ForgeOS does not send an order or payment.'
        : 'Saved lines and supplier details remain in history. Received stock must be returned before cancellation.';
    fields = [
      {
        ...reference,
        label: 'Order confirmation / supporting reference',
        required: editor.value === 'ordered',
      },
      reason,
    ];
    onSave = (v) =>
      save('purchase_status', { ...v, id: order.id, version: order.version, status: editor.value });
  }
  if (editor.type === 'receive_purchase' || editor.type === 'return_purchase') {
    title = editor.type === 'receive_purchase' ? 'Receive purchase delivery' : 'Return purchase receipt';
    fields = [qty, day, reference, reason];
    onSave = (v) =>
      save(editor.type, {
        ...v,
        quantity: undefined,
        quantity_milli: quantityToMilli(String(v.quantity)),
        ...(editor.type === 'receive_purchase' ? { line_id: id } : { receipt_id: id }),
      });
  }
  if (editor.type === 'checkout_equipment' && equipment) {
    title = `Check out ${equipment.name}`;
    fields = [
      {
        name: 'employee_id',
        label: 'Employee checking out',
        type: 'select',
        required: true,
        default: !ui.office ? snapshot.userId : '',
        options: employees,
      },
      ...(!ref
        ? [
            {
              name: 'work_order_id',
              label: 'Related work order (optional)',
              type: 'select' as const,
              options: data.work
                .filter(
                  (w) =>
                    w.property_id === propertyId && !['completed', 'closed', 'cancelled'].includes(w.status)
                )
                .map((w) => ({ value: w.id, label: `${w.number} · ${w.title}` })),
            },
          ]
        : []),
      day,
      {
        name: 'due_on',
        label: 'Expected return date',
        type: 'date',
        default: addDays(today, 1),
        required: true,
      },
      reason,
    ];
    onSave = (v) =>
      save('checkout_equipment', {
        ...v,
        equipment_id: equipment.id,
        work_order_id: ref || v.work_order_id || null,
      });
  }
  if (editor.type === 'return_equipment' && loan) {
    title = 'Return equipment';
    fields = [
      day,
      {
        name: 'condition',
        label: 'Return condition',
        type: 'select',
        options: choices(['good', 'fair', 'needs_repair', 'out_of_service']),
        default: 'good',
        required: true,
      },
      reason,
    ];
    onSave = (v) => save('return_equipment', { ...v, loan_id: loan.id });
  }
  if (editor.type === 'service_equipment' && equipment) {
    title = 'Record equipment service';
    fields = [
      {
        name: 'work_order_id',
        label: 'Completed repair work order (optional)',
        type: 'select',
        options: data.work
          .filter((w) => w.property_id === propertyId && ['completed', 'closed'].includes(w.status))
          .map((w) => ({ value: w.id, label: `${w.number} · ${w.title}` })),
      },
      day,
      {
        name: 'condition',
        label: 'Serviced condition',
        type: 'select',
        options: choices(['good', 'fair', 'needs_repair', 'out_of_service', 'retired']),
        default: 'good',
        required: true,
      },
      {
        name: 'next_service_on',
        label: 'Next service date (optional)',
        type: 'date',
        default: addDays(today, 30),
      },
      reason,
    ];
    onSave = (v) =>
      save('service_equipment', {
        ...v,
        equipment_id: equipment.id,
        work_order_id: v.work_order_id || null,
        next_service_on: v.next_service_on || null,
      });
  }
  if (editor.type === 'generate_occurrence') {
    title = `Create ${plan?.kind === 'checklist' ? 'checklist run' : 'preventive work'} · ${editor.value}`;
    description = `${plan?.label ?? ''}. This occurrence can be created once. Existing work/results are retained if its plan changes.`;
    fields = [reason];
    onSave = (v) => save('generate_occurrence', { ...v, plan_id: id, scheduled_for: editor.value });
  }
  if (editor.type === 'checklist_entry') {
    const finding = editor.value;
    const findings: Record<string, { label: string; status: 'done' | 'skipped'; prefix: string }> = {
      pass: { label: 'Pass', status: 'done', prefix: '[Inspection: Pass]' },
      fail: { label: 'Fail', status: 'skipped', prefix: '[Inspection: Fail]' },
      needs_attention: { label: 'Needs attention', status: 'skipped', prefix: '[Inspection: Needs attention]' },
    };
    const findingType = finding ? findings[finding] : undefined;
    title = findingType ? `Record inspection: ${findingType.label}` : `${opsLabel(finding ?? 'done')} checklist item`;
    description = (run?.items.find((i) => i.key === ref)?.label ?? '') +
      (findingType ? ' · Add findings, observations and any follow-up needed. This result is saved in checklist history.' : '');
    fields = [reason];
    onSave = (v) => save('checklist_entry', {
      ...v,
      reason: findingType ? `${findingType.prefix} ${String(v.reason ?? '').trim()}` : v.reason,
      run_id: id, item_key: ref, status: findingType?.status ?? finding,
    });
  }
  if (editor.type === 'checklist_status' && run) {
    title = `${opsLabel(editor.value ?? 'closed')} checklist run`;
    description =
      'Closing requires a completed or explicitly skipped record for every item. Reopening retains all earlier results.';
    fields = [reason];
    onSave = (v) =>
      save('checklist_status', { ...v, run_id: run.id, version: run.version, status: editor.value });
  }
  if (editor.type === 'void_work_photo') {
    title = 'Void work photograph';
    description =
      'The original metadata and private object remain retained. The voided image is no longer viewable.';
    fields = [reason];
    onSave = (v) => save('void_work_photo', { ...v, id });
  }
  if (!title) return null;
  return (
    <Modal title={title} onClose={close}>
      <p>{description}</p>
      <RecordForm
        fields={fields}
        submit={title}
        onCancel={close}
        onSave={(v) => onSave(v).then(() => undefined)}
        locked={staff ? ['user_id'] : plan ? ['kind'] : []}
      />
    </Modal>
  );
}
