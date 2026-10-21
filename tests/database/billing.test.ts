import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Calculation } from '../../src/lib/billing-domain';
import { randomUUID } from 'node:crypto';
import { database, asUser, foundation, identities } from '../support/database.mjs';
let db: PGlite;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
async function rpc(name: string, command: string, payload: Record<string, unknown>, user = identities.owner) {
  return asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query<{ id: string }>(`select public.${name}($1,$2::jsonb) as id`, [
          command,
          JSON.stringify(payload),
        ])
      ).rows[0].id
  );
}
const command = (
  scope: Record<string, string>,
  action: string,
  extra: Record<string, unknown> = {},
  user = identities.owner
) => rpc('billing_command', action, { ...scope, request_id: randomUUID(), ...extra }, user);
async function setup(rate = 65000, period = 'monthly') {
  const f = await foundation(db);
  const scope = { organization_id: f.org, property_id: f.property };
  const records = await asUser(db, identities.owner, async (tx) => {
    await tx.query("update properties set timezone='UTC' where id=$1", [f.property]);
    const site = (
      await tx.query<{ id: string }>(
        "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'Billing 01','rv') returning id",
        [f.org, f.property]
      )
    ).rows[0].id;
    const customer = (
      await tx.query<{ id: string }>(
        "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'José','Example') returning id",
        [f.org, f.property]
      )
    ).rows[0].id;
    const stay = (
      await tx.query<{ id: string }>(
        "insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,agreed_rate_cents,billing_period) values($1,$2,$3,$4,'2024-01-01',$5,$6) returning id",
        [f.org, f.property, site, customer, rate, period]
      )
    ).rows[0].id;
    return { site, customer, stay };
  });
  await command(scope, 'configure_policy', {
    proration: 'actual_calendar_days',
    due_days: 15,
    rent_tax_bps: 0,
    tax_label: '',
    authorization_reference: '',
    reason: 'Owner approved billing policy',
  });
  return { ...f, ...records, scope };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function rate(s: Setup, extra: Record<string, unknown> = {}) {
  return command(s.scope, 'new_rate', {
    utility: 'electric',
    starts_on: '2024-01-01',
    ends_on: null,
    label: 'Approved electric schedule',
    billed_unit: 'kWh',
    conversions: [{ unit: 'kWh', factor: '1' }],
    tiers: [{ up_to: null, unit_price: '0.20' }],
    monthly_base_cents: '0',
    sewer_unit_price: '0',
    sewer_base_cents: '0',
    tax_bps: 0,
    tax_label: '',
    authorization_reference: '',
    included_in_rent: false,
    reason: 'Contract rate authorization',
    replaces_id: null,
    ...extra,
  });
}
function input(s: Setup, extra: Record<string, unknown> = {}) {
  return {
    stay_id: s.stay,
    starts_on: '2024-02-01',
    ends_on: '2024-03-01',
    due_on: '2024-03-15',
    rent_mode: 'recorded',
    manual_rent_cents: null,
    rent_reason: '',
    include_utilities: false,
    utilities_reason: 'Utilities will be billed separately',
    accept_estimates: false,
    adjustments: [],
    ...extra,
  };
}
async function revision(id: string) {
  return (
    await db.query<{ id: string; revision: number; calculation: Calculation; total_cents: number }>(
      'select v.* from invoice_revisions v join invoices i on i.current_revision_id=v.id where i.id=$1',
      [id]
    )
  ).rows[0];
}
async function action(s: Setup, id: string, action: string, extra: Record<string, unknown> = {}) {
  return command(s.scope, action, {
    invoice_id: id,
    revision_id: (await revision(id)).id,
    reason: 'Supervisor verified source records',
    ...extra,
  });
}
async function meter(
  s: Setup,
  utility = 'electric',
  unit = 'kWh',
  multiplier = '1',
  digits = 8,
  startsAt = '2024-01-01T00:00:00Z'
) {
  const id = await rpc('meter_command', 'new_meter', {
    ...s.scope,
    label: `${utility} meter`,
    utility,
    serial_number: randomUUID(),
    unit,
    register_digits: digits,
    multiplier,
    max_delta: null,
    installed_at: '2024-01-01T00:00:00Z',
    notes: '',
  });
  const assignment = await rpc('meter_command', 'new_assignment', {
    ...s.scope,
    meter_id: id,
    site_id: s.site,
    starts_at: startsAt,
  });
  await asUser(db, identities.owner, (tx) =>
    tx.query(`update sites_units set ${utility}=true where id=$1`, [s.site])
  );
  return { id, assignment };
}
// Historical fictional captures seed the same immutable tables; review and all billing use real RPCs.
async function reading(
  s: Setup,
  m: Awaited<ReturnType<typeof meter>>,
  day: string,
  value: string,
  flag = 'none',
  kind = 'actual',
  clock = '12:00:00'
) {
  const route = await rpc('meter_command', 'new_route', {
    ...s.scope,
    label: 'Historical test route',
    assigned_to: identities.owner,
    starts_on: day,
    ends_on: new Date(new Date(day + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10),
    cadence: 'custom',
    assignments: [m.assignment],
  });
  const item = (await db.query<{ id: string }>('select id from meter_route_items where route_id=$1', [route]))
    .rows[0].id;
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [identities.owner]);
    await tx.query(
      'insert into meter_readings(id,organization_id,property_id,route_item_id,assignment_id,meter_id,captured_at,captured_by,device_id,value,kind,flag) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        id,
        s.org,
        s.property,
        item,
        m.assignment,
        m.id,
        day + 'T' + clock + 'Z',
        identities.owner,
        randomUUID(),
        value,
        kind,
        flag,
      ]
    );
  });
  const review = await rpc('meter_command', 'review', {
    ...s.scope,
    reading_id: id,
    previous_review_id: null,
    decision: 'accepted',
    corrected_value: null,
    reason: 'Verified historical test evidence',
  });
  return { id, review };
}

describe('exact, supervised, unissued billing', () => {
  it('prorates leap months, weekly and nightly rent without floating point totals', async () => {
    const s = await setup();
    const invoice = await command(s.scope, 'create_draft', input(s));
    expect(String((await revision(invoice)).total_cents)).toBe('65000');
    const weekly = await setup(10000, 'weekly');
    const w = await command(
      weekly.scope,
      'create_draft',
      input(weekly, { starts_on: '2024-02-01', ends_on: '2024-02-04' })
    );
    expect(String((await revision(w)).total_cents)).toBe('4286');
    const nightly = await setup(1500, 'nightly');
    const n = await command(
      nightly.scope,
      'create_draft',
      input(nightly, { starts_on: '2024-02-01', ends_on: '2024-02-04' })
    );
    expect(String((await revision(n)).total_cents)).toBe('4500');
  });
  it('calculates precise tiers, multipliers, fixed service and explicitly authorized line tax', async () => {
    const s = await setup();
    const m = await meter(s, 'electric', 'kWh', '1.25');
    await reading(s, m, '2024-02-01', '10000');
    await reading(s, m, '2024-03-01', '10420.000001');
    await rate(s, {
      tiers: [
        { up_to: '100', unit_price: '0.10' },
        { up_to: null, unit_price: '0.20' },
      ],
      monthly_base_cents: '500',
      tax_bps: 725,
      tax_label: 'Authorized utility tax',
      authorization_reference: 'Property authorization 24-01',
    });
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const calc = (await revision(id)).calculation;
    const line = calc.lines.find((l) => l.description === 'Electric usage');
    expect(line?.quantity).toBe('525.00000125');
    expect(line?.subtotal_cents).toBe('9500');
    expect(line?.tax_cents).toBe('689');
    expect(line?.source.segments?.[0].delta).toBe('420.000001');
    expect(calc.reading_ids).toHaveLength(2);
    expect(calc.total_cents).toBe('75725');
  });
  it('converts water and gas units with approved sewer, and supports utilities included in rent', async () => {
    const s = await setup();
    const water = await meter(s, 'water', 'cuft');
    const gas = await meter(s, 'gas', 'cuft', '2');
    await reading(s, water, '2024-02-01', '100');
    await reading(s, water, '2024-03-01', '110');
    await reading(s, gas, '2024-02-01', '500');
    await reading(s, gas, '2024-03-01', '550');
    await rate(s, {
      utility: 'water',
      billed_unit: 'gallons',
      conversions: [{ unit: 'cuft', factor: '7.48052' }],
      tiers: [{ up_to: null, unit_price: '0.005' }],
      sewer_unit_price: '0.002',
      sewer_base_cents: '200',
    });
    await rate(s, {
      utility: 'gas',
      billed_unit: 'therms',
      conversions: [{ unit: 'cuft', factor: '0.01' }],
      tiers: [{ up_to: null, unit_price: '1.50' }],
    });
    await asUser(db, identities.owner, (tx) =>
      tx.query('update sites_units set electric=true where id=$1', [s.site])
    );
    await rate(s, { included_in_rent: true, tiers: [{ up_to: null, unit_price: '0' }] });
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const calc = (await revision(id)).calculation;
    expect(calc.lines.find((l) => l.category === 'water')?.quantity).toBe('74.8052');
    expect(calc.lines.find((l) => l.category === 'gas')?.subtotal_cents).toBe('150');
    expect(calc.lines.find((l) => l.category === 'sewer')?.subtotal_cents).toBe('215');
    expect(calc.total_cents).toBe('65402');
  });
  it('requires approved boundary readings, explicit conversion and estimated-reading consent', async () => {
    const s = await setup();
    const m = await meter(s, 'electric', 'Wh');
    await rate(s);
    await reading(s, m, '2024-02-01', '10');
    await expect(command(s.scope, 'create_draft', input(s, { include_utilities: true }))).rejects.toThrow(
      'approved_boundary_readings_required'
    );
    await reading(s, m, '2024-03-01', '20', 'none', 'estimated');
    await expect(command(s.scope, 'create_draft', input(s, { include_utilities: true }))).rejects.toThrow(
      'estimated_reading_acknowledgement'
    );
    await expect(
      command(s.scope, 'create_draft', input(s, { include_utilities: true, accept_estimates: true }))
    ).rejects.toThrow('unit_conversion_required');
  });
  it('requires documented reset and rollover arithmetic and retains their evidence', async () => {
    const s = await setup();
    const m = await meter(s, 'electric', 'kWh', '1', 3);
    await rate(s);
    await reading(s, m, '2024-02-01', '990');
    const close = await reading(s, m, '2024-03-01', '10', 'rollover');
    await expect(command(s.scope, 'create_draft', input(s, { include_utilities: true }))).rejects.toThrow(
      'register_event_required'
    );
    await command(s.scope, 'register_event', {
      reading_id: close.id,
      review_id: close.review,
      before_value: null,
      after_value: null,
      rollover_count: 1,
      reason: 'One verified register rollover',
    });
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    expect((await revision(id)).calculation.lines.find((l) => l.category === 'electric')?.quantity).toBe(
      '20'
    );
    const reset = await setup();
    const rm = await meter(reset);
    await rate(reset);
    await reading(reset, rm, '2024-02-01', '500');
    const rr = await reading(reset, rm, '2024-03-01', '20', 'reset');
    await command(reset.scope, 'register_event', {
      reading_id: rr.id,
      review_id: rr.review,
      before_value: '550',
      after_value: '0',
      rollover_count: null,
      reason: 'Documented reset service record',
    });
    const ri = await command(reset.scope, 'create_draft', input(reset, { include_utilities: true }));
    expect((await revision(ri)).calculation.lines.find((l) => l.category === 'electric')?.quantity).toBe(
      '70'
    );
  });
  it('splits dated rates only at approved readings and prevents overlapping rate schedules', async () => {
    const s = await setup();
    const m = await meter(s);
    await reading(s, m, '2024-02-01', '0');
    await reading(s, m, '2024-03-01', '100');
    const old = await rate(s);
    await expect(rate(s)).rejects.toThrow();
    await rate(s, {
      starts_on: '2024-02-15',
      replaces_id: old,
      tiers: [{ up_to: null, unit_price: '0.40' }],
    });
    await expect(command(s.scope, 'create_draft', input(s, { include_utilities: true }))).rejects.toThrow(
      'rate_boundary_reading_required'
    );
    await reading(s, m, '2024-02-15', '40');
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const lines = (await revision(id)).calculation.lines.filter((l) => l.category === 'electric');
    expect(lines.map((l) => l.subtotal_cents)).toEqual(['800', '2400']);
  });
  it('makes retries idempotent, reserves overlapping rent and meter usage and releases claims on void', async () => {
    const s = await setup();
    const request = { ...input(s), request_id: randomUUID(), ...s.scope };
    const id = await rpc('billing_command', 'create_draft', request);
    expect(await rpc('billing_command', 'create_draft', request)).toBe(id);
    await expect(
      rpc('billing_command', 'create_draft', { ...request, due_on: '2024-03-16' })
    ).rejects.toThrow('operation_conflict');
    await expect(command(s.scope, 'create_draft', input(s))).rejects.toThrow();
    await action(s, id, 'void_invoice');
    expect(await command(s.scope, 'create_draft', input(s))).toBeTruthy();
  });
  it('detects stale sources before approval, appends refresh revisions, and protects billed readings', async () => {
    const s = await setup();
    const m = await meter(s);
    await rate(s);
    await reading(s, m, '2024-02-01', '100');
    const rd = await reading(s, m, '2024-03-01', '200');
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const newReview = await rpc('meter_command', 'review', {
      ...s.scope,
      reading_id: rd.id,
      previous_review_id: rd.review,
      decision: 'accepted',
      corrected_value: '210',
      reason: 'Verified corrected register value',
    });
    await expect(action(s, id, 'approve_invoice')).rejects.toThrow('invoice_sources_changed');
    await action(s, id, 'refresh_draft');
    expect((await revision(id)).revision).toBe(2);
    await action(s, id, 'approve_invoice');
    await expect(
      rpc('meter_command', 'review', {
        ...s.scope,
        reading_id: rd.id,
        previous_review_id: newReview,
        decision: 'accepted',
        corrected_value: '220',
        reason: 'Another correction',
      })
    ).rejects.toThrow('approved_reading_in_use');
  });
  it('posts immutable credits and exact reversing entries, bounds credits, and voids the net balance', async () => {
    const s = await setup();
    const id = await command(s.scope, 'create_draft', input(s));
    await action(s, id, 'approve_invoice');
    const credit = await action(s, id, 'credit', { amount_cents: '1000', reference: 'Approved concession' });
    await expect(action(s, id, 'credit', { amount_cents: '65000' })).rejects.toThrow('invalid_credit');
    await action(s, id, 'reverse_credit', { credit_id: credit });
    await expect(action(s, id, 'reverse_credit', { credit_id: credit })).rejects.toThrow();
    await action(s, id, 'credit', { amount_cents: '2500' });
    await action(s, id, 'void_invoice');
    const entries = (
      await db.query<{ amount_cents: number }>(
        'select amount_cents from billing_ledger_entries where invoice_id=$1',
        [id]
      )
    ).rows;
    expect(entries.reduce((sum, e) => sum + BigInt(e.amount_cents), 0n)).toBe(0n);
    await expect(action(s, id, 'credit', { amount_cents: '1' })).rejects.toThrow('invalid_credit');
  });
  it('denies foreign scopes, technicians, raw writes and office approval while allowing office preparation', async () => {
    const s = await setup();
    for (const [id, role] of [
      [identities.office, 'office'],
      [identities.technician, 'meter_technician'],
    ] as const)
      await asUser(db, identities.owner, (tx) =>
        tx.query('select grant_property_access($1,$2,$3,$4)', [s.org, s.property, id, role])
      );
    const id = await command(s.scope, 'create_draft', input(s), identities.office);
    await expect(
      command(
        s.scope,
        'approve_invoice',
        { invoice_id: id, revision_id: (await revision(id)).id, reason: 'Office attempt' },
        identities.office
      )
    ).rejects.toThrow();
    await expect(command(s.scope, 'create_draft', input(s), identities.technician)).rejects.toThrow();
    for (const user of [identities.technician, identities.other])
      expect((await asUser(db, user, (tx) => tx.query('select * from invoices'))).rows).toHaveLength(0);
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query('update invoice_revisions set total_cents=1 where invoice_id=$1', [id])
      )
    ).rejects.toThrow();
    await expect(
      command({ ...s.scope, property_id: randomUUID() }, 'create_draft', input(s))
    ).rejects.toThrow();
  });
});

describe('billing history and calculation edge cases', () => {
  it('aggregates replacement meters into one set of tiers and one monthly base fee', async () => {
    const s = await setup();
    const old = await meter(s);
    await rate(s, {
      tiers: [
        { up_to: '50', unit_price: '0.10' },
        { up_to: null, unit_price: '0.20' },
      ],
      monthly_base_cents: '500',
    });
    await reading(s, old, '2024-02-01', '100');
    await reading(s, old, '2024-02-15', '140');
    await rpc('meter_command', 'close_assignment', {
      ...s.scope,
      assignment_id: old.assignment,
      ends_at: '2024-02-15T12:00:01Z',
      reason: 'Documented meter replacement',
      remove_meter: true,
    });
    const replacement = await meter(s, 'electric', 'kWh', '1', 8, '2024-02-15T12:00:01Z');
    await reading(s, replacement, '2024-02-15', '0', 'none', 'actual', '13:00:00');
    await reading(s, replacement, '2024-03-01', '60');
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const calc = (await revision(id)).calculation;
    const usage = calc.lines.find((l) => l.description === 'Electric usage');
    expect(usage?.quantity).toBe('100');
    expect(usage?.subtotal_cents).toBe('1500');
    expect(usage?.source.segments).toHaveLength(2);
    expect(calc.lines.filter((l) => l.description === 'Electric base service')).toHaveLength(1);
    expect(calc.total_cents).toBe('67000');
  });
  it('blocks meter assignment gaps and overlapping utilities-only drafts', async () => {
    const s = await setup();
    const m = await meter(s);
    await rate(s);
    await reading(s, m, '2024-02-01', '0');
    await reading(s, m, '2024-03-01', '100');
    const id = await command(
      s.scope,
      'create_draft',
      input(s, { include_utilities: true, rent_mode: 'none', rent_reason: 'Rent billed separately' })
    );
    await expect(
      command(
        s.scope,
        'create_draft',
        input(s, { include_utilities: true, rent_mode: 'none', rent_reason: 'Rent already billed' })
      )
    ).rejects.toThrow();
    await action(s, id, 'void_invoice');
    expect(
      await command(
        s.scope,
        'create_draft',
        input(s, {
          include_utilities: true,
          rent_mode: 'none',
          rent_reason: 'Replacement utilities-only draft',
        })
      )
    ).toBeTruthy();
    const gap = await setup();
    await meter(gap, 'electric', 'kWh', '1', 8, '2024-02-02T00:00:00Z');
    await rate(gap);
    await expect(command(gap.scope, 'create_draft', input(gap, { include_utilities: true }))).rejects.toThrow(
      'utility_assignment_gap'
    );
  });
  it('retains large fractional register values as strings without losing source precision', async () => {
    const s = await setup();
    const m = await meter(s, 'electric', 'kWh', '1.123456', 12);
    await rate(s, { tiers: [{ up_to: null, unit_price: '0.123456' }] });
    await reading(s, m, '2024-02-01', '999999999000.123456');
    await reading(s, m, '2024-03-01', '999999999001.123457');
    const id = await command(s.scope, 'create_draft', input(s, { include_utilities: true }));
    const line = (await revision(id)).calculation.lines.find((l) => l.category === 'electric');
    expect(line?.source.segments?.[0].from_reading.effective_value).toBe('999999999000.123456');
    expect(line?.source.segments?.[0].delta).toBe('1.000001');
    expect(line?.quantity).toBe('1.123457123456');
    expect(line?.subtotal_cents).toBe('14');
  });
  it('uses effective lease rent changes and requires custom agreement amounts', async () => {
    const s = await setup();
    // Lease creation is immutable under the production triggers; this is a normal authenticated insert.
    await asUser(db, identities.owner, (tx) =>
      tx.query(
        "insert into lease_terms(organization_id,property_id,stay_id,site_id,customer_id,starts_on,ends_on,billing_period,agreed_rate_cents,document_reference) values($1,$2,$3,$4,$5,'2024-02-15','2024-03-01','monthly',80000,'Reviewed agreement')",
        [s.org, s.property, s.stay, s.site, s.customer]
      )
    );
    const id = await command(s.scope, 'create_draft', input(s));
    const calc = (await revision(id)).calculation;
    expect(calc.lines.filter((l) => l.category === 'rent')).toHaveLength(2);
    expect(calc.total_cents).toBe('72758');
    const custom = await setup(0, 'custom');
    await expect(command(custom.scope, 'create_draft', input(custom))).rejects.toThrow(
      'custom_rent_required'
    );
    const manual = await command(
      custom.scope,
      'create_draft',
      input(custom, {
        rent_mode: 'manual',
        manual_rent_cents: '12345',
        rent_reason: 'Authorized seasonal agreement',
      })
    );
    expect((await revision(manual)).calculation.total_cents).toBe('12345');
  });
  it('requires tax references, increasing tiers and complete reset evidence at the SQL boundary', async () => {
    const s = await setup();
    await expect(rate(s, { tax_bps: 100 })).rejects.toThrow();
    await expect(rate(s, { included_in_rent: true })).rejects.toThrow('included_rate_nonzero');
    await expect(
      rate(s, {
        tiers: [
          { up_to: '100', unit_price: '0.10' },
          { up_to: '50', unit_price: '0.20' },
          { up_to: null, unit_price: '0.30' },
        ],
      })
    ).rejects.toThrow('invalid_tiers');
    const m = await meter(s);
    const rd = await reading(s, m, '2024-03-01', '0', 'reset');
    await expect(
      command(s.scope, 'register_event', {
        reading_id: rd.id,
        review_id: rd.review,
        before_value: null,
        after_value: null,
        rollover_count: null,
        reason: 'Incomplete reset evidence',
      })
    ).rejects.toThrow();
  });
  it('enforces RLS, exact grants and a private calculation engine on fresh migration', async () => {
    const tables = [
      'billing_policies',
      'utility_rate_plans',
      'meter_register_events',
      'invoices',
      'invoice_revisions',
      'billing_ledger_entries',
    ];
    for (const name of tables) {
      const flags = (
        await db.query<{ rls: boolean; write: boolean }>(
          "select c.relrowsecurity as rls,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1",
          [name]
        )
      ).rows[0];
      expect(flags.rls).toBe(true);
      expect(flags.write).toBe(false);
    }
    const privilege = (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','private.calculate_invoice(uuid,uuid,jsonb)','EXECUTE') as allowed"
      )
    ).rows[0];
    expect(privilege.allowed).toBe(false);
    const exposed = (
      await db.query(
        "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef"
      )
    ).rows;
    expect(exposed).toHaveLength(0);
  });
});

describe('half-cent rounding', () => {
  it('rounds rent, base service and sewer half cents exactly after calendar proration', async () => {
    const s = await setup(1);
    const electric = await meter(s);
    const water = await meter(s, 'water', 'gallons');
    for (const m of [electric, water]) {
      await reading(s, m, '2024-04-01', '0');
      await reading(s, m, '2024-04-16', '0');
    }
    await rate(s, { tiers: [{ up_to: null, unit_price: '0' }], monthly_base_cents: '1' });
    await rate(s, {
      utility: 'water',
      billed_unit: 'gallons',
      conversions: [{ unit: 'gallons', factor: '1' }],
      tiers: [{ up_to: null, unit_price: '0' }],
      sewer_base_cents: '1',
    });
    const id = await command(
      s.scope,
      'create_draft',
      input(s, {
        starts_on: '2024-04-01',
        ends_on: '2024-04-16',
        due_on: '2024-04-30',
        include_utilities: true,
      })
    );
    const calc = (await revision(id)).calculation;
    expect(calc.lines.find((l) => l.category === 'rent')?.subtotal_cents).toBe('1');
    expect(calc.lines.find((l) => l.description === 'Electric base service')?.subtotal_cents).toBe('1');
    expect(calc.lines.find((l) => l.category === 'sewer')?.subtotal_cents).toBe('1');
    expect(calc.total_cents).toBe('3');
  });
});

describe('statement snapshot', () => {
  it('returns one authorized header/revision/ledger snapshot and hides foreign or revoked access', async () => {
    const s = await setup();
    const id = await command(s.scope, 'create_draft', input(s));
    await action(s, id, 'approve_invoice');
    await action(s, id, 'credit', { amount_cents: '1001' });
    const read = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query<{ document: import('../../src/lib/billing-domain').BillingStatement | null }>(
              'select billing_statement($1) as document',
              [id]
            )
          ).rows[0].document
      );
    const document = await read(identities.owner);
    expect(document?.invoice.status).toBe('approved');
    expect(document?.invoice.current_revision_id).toBe(document?.revision.id);
    expect(document?.ledger.map((e) => e.kind)).toEqual(['approval', 'credit']);
    expect(await read(identities.other)).toBeNull();
    expect(await read(identities.technician)).toBeNull();
  });
});
