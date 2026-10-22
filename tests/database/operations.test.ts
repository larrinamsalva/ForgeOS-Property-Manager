import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { database, foundation, asUser, identities } from '../support/database.mjs';
import { addDays } from '../../src/lib/domain';
let db: PGlite, today: string;
beforeAll(async () => {
  db = await database();
  today = (await db.query<{ d: string }>('select current_date::text d')).rows[0].d;
});
afterAll(async () => {
  await db?.close();
});
const worker = identities.technician;
async function cmd(
  s: { scope: Record<string, string> },
  command: string,
  extra: Record<string, unknown> = {},
  user = identities.owner
) {
  return asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query<{ r: { id: string } }>('select operations_command($1,$2::jsonb) r', [
          command,
          JSON.stringify({
            ...s.scope,
            request_id: randomUUID(),
            reason: 'Fictional authorized operations record',
            ...extra,
          }),
        ])
      ).rows[0].r.id
  );
}
async function setup() {
  const f = await foundation(db);
  const scope = { organization_id: f.org, property_id: f.property };
  const s = { ...f, scope };
  await asUser(db, identities.owner, async (tx) => {
    await tx.query("update properties set timezone='UTC' where id=$1", [f.property]);
    for (const [user, role] of [
      [worker, 'maintenance'],
      [identities.office, 'office'],
      [identities.manager, 'manager'],
    ])
      await tx.query('select grant_property_access($1,$2,$3,$4)', [f.org, f.property, user, role]);
  });
  for (const [user, code] of [
    [worker, 'M01'],
    [identities.manager, 'B01'],
    [identities.office, 'O01'],
  ])
    await cmd(s, 'save_staff', {
      id: null,
      version: null,
      user_id: user,
      employee_code: code,
      name: code === 'M01' ? 'Morgan Maintenance' : code,
      email: '',
      phone: '',
      employment_status: 'active',
      starts_on: today,
      supervisor_id: identities.manager,
      notes: '',
    });
  return s;
}
async function item(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
  return cmd(s, 'save_item', {
    id: null,
    version: null,
    sku: 'PVC-01',
    name: 'PVC fittings',
    category: 'Plumbing',
    unit: 'each',
    location: 'Shop shelf',
    supplier_id: null,
    unit_cost_cents: '123',
    reorder_milli: '2000',
    restock_milli: '10000',
    notes: '',
    archived: false,
    ...extra,
  });
}
async function work(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
  return cmd(s, 'new_work', {
    title: 'Repair fictional water leak',
    description: 'Fictional inspection and repair of a leaking fitting',
    category: 'Plumbing',
    priority: 'normal',
    site_id: null,
    customer_id: null,
    requested_on: today,
    due_on: today,
    assigned_to: worker,
    parts_required: 'Two fittings',
    ...extra,
  });
}
async function version(table: string, id: string) {
  return (await db.query<{ version: number }>(`select version from ${table} where id=$1`, [id])).rows[0]
    .version;
}
async function status(
  s: Awaited<ReturnType<typeof setup>>,
  id: string,
  value: string,
  user = identities.owner
) {
  return cmd(
    s,
    'work_status',
    { work_order_id: id, version: await version('work_orders', id), status: value },
    user
  );
}
async function receive(
  s: Awaited<ReturnType<typeof setup>>,
  id: string,
  quantity = '10000',
  extra: Record<string, unknown> = {}
) {
  return cmd(s, 'receive_stock', {
    item_id: id,
    quantity_milli: quantity,
    unit_cost_cents: '123',
    effective_on: today,
    reference: 'Fictional delivery',
    ...extra,
  });
}
async function quantity(id: string) {
  return String((await db.query<{ q: string }>('select private.stock_quantity($1)::text q', [id])).rows[0].q);
}
async function supplier(s: Awaited<ReturnType<typeof setup>>) {
  return cmd(s, 'save_supplier', {
    id: null,
    version: null,
    name: 'Fictional Supply Co',
    contact: 'Dispatch',
    email: 'vendor@example.com',
    phone: '',
    address: '123 Example Lane',
    notes: '',
    archived: false,
  });
}
async function equipment(s: Awaited<ReturnType<typeof setup>>) {
  return cmd(s, 'save_equipment', {
    id: null,
    version: null,
    code: 'EQ-01',
    name: 'Inspection tool',
    serial_number: 'FICTION-01',
    condition: 'good',
    next_service_on: addDays(today, 30),
    notes: '',
    archived: false,
  });
}
async function plan(s: Awaited<ReturnType<typeof setup>>, kind = 'checklist') {
  return cmd(s, 'save_plan', {
    id: null,
    version: null,
    kind,
    label: 'Morning grounds inspection',
    description: 'Fictional recurring inspection',
    category: 'Grounds',
    site_id: null,
    assigned_to: worker,
    anchor_on: today,
    interval_days: 1,
    ends_on: null,
    items: kind === 'checklist' ? ['Inspect water lines', 'Inspect exterior lights'] : [],
    active: true,
  });
}
describe('property operations transactions and access', () => {
  it('assigns scoped work and limits a maintenance employee to their jobs, without tenant or cost access', async () => {
    const s = await setup(),
      w = await work(s),
      unassigned = await work(s, { assigned_to: null }),
      i = await item(s);
    await receive(s, i);
    await asUser(db, worker, async (tx) => {
      expect((await tx.query('select id from work_orders where id=$1', [w])).rows).toHaveLength(1);
      expect((await tx.query('select id from work_orders where id=$1', [unassigned])).rows).toHaveLength(0);
      for (const table of [
        'customers',
        'occupancy_stays',
        'inventory_items',
        'inventory_movements',
        'suppliers',
        'work_order_costs',
        'purchase_order_lines',
      ])
        expect(
          (await tx.query(`select id from ${table} where property_id=$1`, [s.property])).rows
        ).toHaveLength(0);
      const c = (
        await tx.query<{ c: { parts: { id: string; quantity_milli: string }[] } }>(
          'select operations_context($1) c',
          [s.org]
        )
      ).rows[0].c;
      expect(c.parts[0]).toMatchObject({ id: i, quantity_milli: '10000' });
      expect(c.parts[0]).not.toHaveProperty('unit_cost_cents');
    });
    await expect(cmd(s, 'new_work', { title: 'Intrusion' }, worker)).rejects.toThrow();
    await expect(cmd(s, 'adjust_stock', { item_id: i, quantity_milli: '1000' }, worker)).rejects.toThrow();
    await asUser(db, identities.owner, (tx) =>
      tx.query('select grant_property_access($1,$2,$3,$4)', [
        s.org,
        s.property,
        identities.owner,
        'maintenance',
      ])
    );
    await cmd(s, 'save_staff', {
      id: null,
      version: null,
      user_id: identities.owner,
      employee_code: 'OWNER',
      name: 'Fictional owner',
      email: '',
      phone: '',
      employment_status: 'active',
      starts_on: today,
      supervisor_id: null,
      notes: '',
    });
    await asUser(db, identities.owner, async (tx) => {
      const context = (
        await tx.query<{ c: { roles: { user_id: string; role: string }[] } }>(
          'select operations_context($1) c',
          [s.org]
        )
      ).rows[0].c;
      expect(context.roles.find((r) => r.user_id === identities.owner)?.role).toBe('owner');
      expect(context.roles.find((r) => r.user_id === worker)?.role).toBe('maintenance');
    });
  });
  it('requires manager completion approval and preserves status, labor and reopen history', async () => {
    const s = await setup(),
      w = await work(s);
    await status(s, w, 'in_progress', worker);
    await cmd(s, 'work_note', { work_order_id: w, minutes: 45, effective_on: today }, worker);
    await status(s, w, 'completed', worker);
    await expect(status(s, w, 'closed', worker)).rejects.toThrow();
    await expect(status(s, w, 'closed', identities.office)).rejects.toThrow('completion_approval_required');
    await status(s, w, 'closed');
    await expect(
      cmd(s, 'work_note', { work_order_id: w, minutes: 15, effective_on: today }, worker)
    ).rejects.toThrow();
    await status(s, w, 'in_progress');
    expect(
      (await db.query('select id from work_order_events where work_order_id=$1', [w])).rows
    ).toHaveLength(6);
  });
  it('records material usage and partial returns atomically without negative stock or duplicate costs', async () => {
    const s = await setup(),
      w = await work(s),
      i = await item(s, { unit_cost_cents: '1' });
    await receive(s, i, '1000', { unit_cost_cents: '1' });
    const material = await cmd(
      s,
      'use_material',
      { work_order_id: w, item_id: i, quantity_milli: '500', effective_on: today, reference: '' },
      worker
    );
    expect(await quantity(i)).toBe('500');
    await expect(
      cmd(
        s,
        'use_material',
        { work_order_id: w, item_id: i, quantity_milli: '501', effective_on: today, reference: '' },
        worker
      )
    ).rejects.toThrow('insufficient_stock');
    for (const q of ['250', '250'])
      await cmd(
        s,
        'return_material',
        { work_order_id: w, material_id: material, quantity_milli: q, effective_on: today, reference: '' },
        worker
      );
    expect(await quantity(i)).toBe('1000');
    expect(
      String(
        (
          await db.query<{ cost: string }>(
            'select sum(amount_cents)::text cost from work_order_costs where work_order_id=$1',
            [w]
          )
        ).rows[0].cost
      )
    ).toBe('0');
    await expect(
      cmd(
        s,
        'return_material',
        { work_order_id: w, material_id: material, quantity_milli: '1', effective_on: today, reference: '' },
        worker
      )
    ).rejects.toThrow('invalid_material_return');
  });
  it('guards backdated stock, optimistic catalog updates, and immutable inventory history', async () => {
    const s = await setup(),
      i = await item(s);
    await receive(s, i);
    await expect(
      cmd(s, 'adjust_stock', {
        item_id: i,
        quantity_milli: '-1000',
        effective_on: addDays(today, -1),
        reference: '',
      })
    ).rejects.toThrow('stock_date_overdraw');
    expect(await quantity(i)).toBe('10000');
    await expect(item(s, { id: i, version: 0 })).rejects.toThrow('operations_conflict');
    await expect(item(s, { id: i, version: 1, unit: 'feet' })).rejects.toThrow('stock_identity_immutable');
    await expect(
      asUser(db, identities.owner, (tx) => tx.query('delete from inventory_movements where item_id=$1', [i]))
    ).rejects.toThrow();
  });
  it('keeps separate estimates, actual expenses and exact reversals', async () => {
    const s = await setup(),
      w = await work(s);
    await cmd(s, 'work_cost', { work_order_id: w, kind: 'estimate', amount_cents: '5000', reference: '' });
    const cost = await cmd(s, 'work_cost', {
      work_order_id: w,
      kind: 'expense',
      amount_cents: '1234',
      reference: 'Invoice 01',
    });
    await cmd(s, 'reverse_cost', { work_order_id: w, cost_id: cost, reference: 'Corrected invoice' });
    await expect(
      cmd(s, 'reverse_cost', { work_order_id: w, cost_id: cost, reference: 'Again' })
    ).rejects.toThrow();
    const result = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<{
            r: { work_costs: { id: string; actual_cents: string; estimate_cents: string }[] };
          }>('select operations_summary($1) r', [s.org])
        ).rows[0].r
    );
    expect(result.work_costs[0]).toMatchObject({ id: w, actual_cents: '0', estimate_cents: '5000' });
  });
  it('approves and manually places purchase orders, receives partially and returns original-cost quantities', async () => {
    const s = await setup(),
      i = await item(s),
      vendor = await supplier(s);
    const r = await cmd(s, 'purchase_request', {
      work_order_id: null,
      item_id: i,
      quantity_milli: '3000',
      needed_on: today,
    });
    await cmd(s, 'decide_purchase', { id: r, version: 1, status: 'approved' });
    const po = await cmd(s, 'new_purchase', {
      supplier_id: vendor,
      expected_on: today,
      reference: '',
      lines: [{ item_id: i, quantity_milli: '3000', unit_cost_cents: '101', purchase_request_id: r }],
    });
    const line = (
      await db.query<{ id: string }>('select id from purchase_order_lines where purchase_order_id=$1', [po])
    ).rows[0].id;
    await expect(
      cmd(s, 'receive_purchase', {
        line_id: line,
        quantity_milli: '1000',
        effective_on: today,
        reference: 'Delivery',
      })
    ).rejects.toThrow('purchase_not_ordered');
    await cmd(s, 'purchase_status', { id: po, version: 1, status: 'approved', reference: '' });
    await cmd(s, 'purchase_status', {
      id: po,
      version: 2,
      status: 'ordered',
      reference: 'Vendor confirmation 01',
    });
    const receipt = await cmd(s, 'receive_purchase', {
      line_id: line,
      quantity_milli: '1000',
      effective_on: today,
      reference: 'Delivery 01',
    });
    await cmd(s, 'receive_purchase', {
      line_id: line,
      quantity_milli: '2000',
      effective_on: today,
      reference: 'Delivery 02',
    });
    expect(await quantity(i)).toBe('3000');
    await expect(
      cmd(s, 'receive_purchase', {
        line_id: line,
        quantity_milli: '1',
        effective_on: today,
        reference: 'Overdelivery',
      })
    ).rejects.toThrow('purchase_exceeds_order');
    await expect(
      cmd(s, 'purchase_status', { id: po, version: 3, status: 'cancelled', reference: '' })
    ).rejects.toThrow('purchase_has_receipts');
    await cmd(s, 'return_purchase', {
      receipt_id: receipt,
      quantity_milli: '1000',
      effective_on: today,
      reference: 'Returned original receipt',
    });
    expect(await quantity(i)).toBe('2000');
    expect(
      (await db.query<{ status: string }>('select status from purchase_requests where id=$1', [r])).rows[0]
        .status
    ).toBe('ordered');
  });
  it('creates recurring runs once, retains item snapshots, and requires complete checklist evidence', async () => {
    const s = await setup(),
      p = await plan(s);
    const r = await cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: today });
    expect(await cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: today })).toBe(r);
    await expect(
      cmd(s, 'checklist_status', { run_id: r, version: 1, status: 'closed' }, worker)
    ).rejects.toThrow('checklist_incomplete');
    await cmd(s, 'checklist_entry', { run_id: r, item_key: 'item-1', status: 'done' }, worker);
    await cmd(
      s,
      'checklist_entry',
      {
        run_id: r,
        item_key: 'item-2',
        status: 'skipped',
        reason: 'Fictional light already repaired, supervisor informed',
      },
      worker
    );
    await cmd(s, 'checklist_status', { run_id: r, version: 1, status: 'closed' }, worker);
    await expect(
      cmd(s, 'checklist_entry', { run_id: r, item_key: 'item-1', status: 'done' }, worker)
    ).rejects.toThrow('invalid_checklist_entry');
    await cmd(s, 'checklist_status', { run_id: r, version: 2, status: 'open' });
    await cmd(s, 'checklist_entry', { run_id: r, item_key: 'item-2', status: 'reopen' });
    const future = await cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: addDays(today, 1) });
    await expect(
      cmd(s, 'checklist_entry', { run_id: future, item_key: 'item-1', status: 'done' }, worker)
    ).rejects.toThrow('invalid_checklist_entry');
  });
  it('tracks one active equipment checkout, returns, repair and employee history', async () => {
    const s = await setup(),
      e = await equipment(s),
      w = await work(s);
    const loan = await cmd(
      s,
      'checkout_equipment',
      {
        equipment_id: e,
        employee_id: worker,
        work_order_id: w,
        effective_on: today,
        due_on: addDays(today, 1),
      },
      worker
    );
    await expect(
      cmd(
        s,
        'checkout_equipment',
        {
          equipment_id: e,
          employee_id: worker,
          work_order_id: w,
          effective_on: today,
          due_on: addDays(today, 1),
        },
        worker
      )
    ).rejects.toThrow();
    await cmd(
      s,
      'return_equipment',
      { loan_id: loan, effective_on: today, condition: 'needs_repair' },
      worker
    );
    await expect(
      cmd(
        s,
        'checkout_equipment',
        { equipment_id: e, employee_id: worker, work_order_id: w, effective_on: today, due_on: today },
        worker
      )
    ).rejects.toThrow('equipment_unavailable');
    await status(s, w, 'completed', worker);
    await cmd(s, 'service_equipment', {
      equipment_id: e,
      work_order_id: w,
      effective_on: today,
      next_service_on: addDays(today, 30),
      condition: 'good',
    });
    expect((await db.query('select id from equipment_events where equipment_id=$1', [e])).rows).toHaveLength(
      4
    );
  });
  it('binds retries to the actor and payload, keeps notifications private and revokes assignments immediately', async () => {
    const s = await setup(),
      w = await work(s);
    const payload = {
      ...s.scope,
      request_id: randomUUID(),
      reason: 'Fictional retry note',
      work_order_id: w,
      minutes: 10,
      effective_on: today,
    };
    const call = (values: Record<string, unknown>) =>
      asUser(
        db,
        worker,
        async (tx) =>
          (
            await tx.query<{ r: { id: string } }>('select operations_command($1,$2::jsonb) r', [
              'work_note',
              JSON.stringify(values),
            ])
          ).rows[0].r.id
      );
    expect(await call(payload)).toBe(await call(payload));
    await expect(call({ ...payload, minutes: 11 })).rejects.toThrow('operation_conflict');
    await asUser(db, worker, async (tx) =>
      expect(
        (await tx.query('select id from operations_notifications where property_id=$1', [s.property])).rows
      ).toHaveLength(1)
    );
    await asUser(db, identities.other, async (tx) =>
      expect((await tx.query('select id from operations_notifications')).rows).toHaveLength(0)
    );
    await asUser(db, identities.owner, (tx) =>
      tx.query('select revoke_property_access($1,$2,$3)', [s.org, s.property, worker])
    );
    await expect(
      cmd(s, 'work_note', { work_order_id: w, minutes: 1, effective_on: today }, worker)
    ).rejects.toThrow();
    await asUser(db, worker, async (tx) =>
      expect((await tx.query('select id from work_orders where id=$1', [w])).rows).toHaveLength(0)
    );
  });
  it('transfers matching stock as two linked movements and requires access to both properties', async () => {
    const s = await setup(),
      i = await item(s);
    await receive(s, i);
    const other = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            "insert into properties(organization_id,name,category,timezone) values($1,'Second Park','rv_park','UTC') returning id",
            [s.org]
          )
        ).rows[0].id
    );
    const t = { ...s, property: other, scope: { ...s.scope, property_id: other } },
      j = await item(t);
    await expect(
      cmd(
        s,
        'transfer_stock',
        {
          item_id: i,
          destination_property_id: other,
          destination_item_id: j,
          quantity_milli: '2000',
          effective_on: today,
          reference: '',
        },
        identities.manager
      )
    ).rejects.toThrow();
    await cmd(s, 'transfer_stock', {
      item_id: i,
      destination_property_id: other,
      destination_item_id: j,
      quantity_milli: '2000',
      effective_on: today,
      reference: '',
    });
    expect(await quantity(i)).toBe('8000');
    expect(await quantity(j)).toBe('2000');
    const rows = (
      await db.query<{ transfer_id: string; delta_milli: number }>(
        "select transfer_id,delta_milli from inventory_movements where kind in ('transfer_in','transfer_out') and item_id in ($1,$2)",
        [i, j]
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].transfer_id).toBe(rows[1].transfer_id);
    expect(rows.reduce((n, r) => n + Number(r.delta_milli), 0)).toBe(0);
  });
  it('serializes competing stock usage and rejects cross-property references', async () => {
    const s = await setup(),
      i = await item(s),
      w = await work(s);
    await receive(s, i);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        cmd(
          s,
          'use_material',
          { item_id: i, work_order_id: w, quantity_milli: '7500', effective_on: today, reference: '' },
          worker
        )
      )
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await quantity(i)).toBe('2500');
    const t = await setup(),
      foreign = await item(t);
    await expect(
      cmd(
        s,
        'use_material',
        { item_id: foreign, work_order_id: w, quantity_milli: '1000', effective_on: today, reference: '' },
        worker
      )
    ).rejects.toThrow('item_unavailable');
  });
  it('keeps checklist snapshots and occurrence claims when a plan changes', async () => {
    const s = await setup(),
      p = await plan(s);
    const run = await cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: today });
    await cmd(s, 'save_plan', {
      id: p,
      version: 1,
      kind: 'checklist',
      label: 'Updated checklist',
      description: 'Updated plan instructions',
      category: 'Grounds',
      site_id: null,
      assigned_to: worker,
      anchor_on: today,
      interval_days: 2,
      ends_on: null,
      items: ['New item'],
      active: true,
    });
    expect(
      (await db.query<{ items: unknown[] }>('select items from checklist_runs where id=$1', [run])).rows[0]
        .items
    ).toHaveLength(2);
    expect(await cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: today })).toBe(run);
    await expect(
      cmd(s, 'generate_occurrence', { plan_id: p, scheduled_for: addDays(today, 1) })
    ).rejects.toThrow('invalid_occurrence');
    const calendar = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<{ r: { scheduled_for: string }[] }>('select operations_schedule($1,$2,$3) r', [
            s.org,
            today,
            addDays(today, 4),
          ])
        ).rows[0].r
    );
    expect(calendar).toHaveLength(3);
  });
  it('blocks inactive staff assignments and prevents reading or marking another person’s notifications', async () => {
    const s = await setup();
    await work(s);
    const profile = (
      await db.query<{ id: string }>('select id from staff_profiles where property_id=$1 and user_id=$2', [
        s.property,
        worker,
      ])
    ).rows[0].id;
    const notice = (
      await db.query<{ id: string }>(
        'select id from operations_notifications where recipient_id=$1 and property_id=$2',
        [worker, s.property]
      )
    ).rows[0].id;
    await expect(cmd(s, 'read_notification', { id: notice })).rejects.toThrow();
    await cmd(s, 'save_staff', {
      id: profile,
      version: 1,
      user_id: worker,
      employee_code: 'M01',
      name: 'Morgan Maintenance',
      email: '',
      phone: '',
      employment_status: 'inactive',
      starts_on: today,
      supervisor_id: identities.manager,
      notes: 'Fictional staff inactive',
    });
    await expect(work(s)).rejects.toThrow('employee_unavailable');
    await asUser(db, worker, async (tx) =>
      expect(
        (await tx.query('select id from work_orders where property_id=$1', [s.property])).rows
      ).toHaveLength(0)
    );
  });
  it('protects original private work photographs and supports pending upload recovery', async () => {
    const s = await setup(),
      w = await work(s);
    const p = await cmd(
      s,
      'queue_work_photo',
      {
        work_order_id: w,
        kind: 'before',
        caption: 'Fictional leak',
        mime: 'image/png',
        byte_size: 8,
        sha256: 'a'.repeat(64),
      },
      worker
    );
    const path = (
      await db.query<{ object_path: string }>('select object_path from work_order_photos where id=$1', [p])
    ).rows[0].object_path;
    await expect(
      asUser(db, identities.other, (tx) =>
        tx.query("insert into storage.objects(bucket_id,name,metadata) values('work-photos',$1,$2::jsonb)", [
          path,
          JSON.stringify({ size: 8, mimetype: 'image/png' }),
        ])
      )
    ).rejects.toThrow();
    await asUser(db, worker, async (tx) => {
      await tx.query(
        "insert into storage.objects(bucket_id,name,metadata) values('work-photos',$1,$2::jsonb)",
        [path, JSON.stringify({ size: 8, mimetype: 'image/png' })]
      );
      expect(
        (await tx.query("select id from storage.objects where bucket_id='work-photos' and name=$1", [path]))
          .rows
      ).toHaveLength(1);
    });
    await asUser(db, worker, (tx) => tx.query('select complete_work_photo($1)', [p]));
    await cmd(s, 'void_work_photo', { id: p });
    await asUser(db, worker, async (tx) =>
      expect(
        (await tx.query("select id from storage.objects where bucket_id='work-photos' and name=$1", [path]))
          .rows
      ).toHaveLength(0)
    );
    expect(
      (await db.query("select id from storage.objects where bucket_id='work-photos' and name=$1", [path]))
        .rows
    ).toHaveLength(1);
  });
});
