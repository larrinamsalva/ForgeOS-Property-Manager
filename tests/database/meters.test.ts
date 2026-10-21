import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { database, asUser, foundation, identities } from '../support/database.mjs';
let db: PGlite;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
async function command(command: string, payload: Record<string, unknown>, user = identities.owner) {
  return asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query<{ id: string }>('select meter_command($1,$2::jsonb) as id', [
          command,
          JSON.stringify(payload),
        ])
      ).rows[0].id
  );
}
async function setup() {
  const f = await foundation(db);
  await asUser(db, identities.owner, (tx) =>
    tx.query<Record<string, unknown>>("update properties set timezone='UTC' where id=$1", [f.property])
  );
  const site = await asUser(
    db,
    identities.owner,
    async (tx) =>
      (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'M-1','rv') returning id",
          [f.org, f.property]
        )
      ).rows[0].id
  );
  await asUser(db, identities.owner, (tx) =>
    tx.query<Record<string, unknown>>("select grant_property_access($1,$2,$3,'meter_technician')", [
      f.org,
      f.property,
      identities.technician,
    ])
  );
  const scope = { organization_id: f.org, property_id: f.property };
  const starts = new Date(Date.now() - 20 * 86400000).toISOString();
  const meter = await command('new_meter', {
    ...scope,
    label: 'Electric pedestal',
    utility: 'electric',
    serial_number: randomUUID(),
    unit: 'kWh',
    register_digits: 12,
    multiplier: '1.250001',
    max_delta: '100',
    installed_at: starts,
    notes: '',
  });
  const assignment = await command('new_assignment', {
    ...scope,
    meter_id: meter,
    site_id: site,
    starts_at: starts,
  });
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const route = await command('new_route', {
    ...scope,
    label: 'Morning route',
    assigned_to: identities.technician,
    starts_on: today,
    ends_on: end,
    cadence: 'custom',
    assignments: [assignment],
  });
  const item = (await db.query<{ id: string }>('select id from meter_route_items where route_id=$1', [route]))
    .rows[0].id;
  return { ...f, scope, site, meter, assignment, route, item, today };
}
function payload(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    ...s.scope,
    route_item_id: s.item,
    assignment_id: s.assignment,
    captured_at: new Date().toISOString(),
    device_id: randomUUID(),
    previous_reading_id: null,
    previous_review_id: null,
    value: '123456789012.123456',
    kind: 'actual',
    flag: 'none',
    notes: '',
    photo: null,
    ...extra,
  };
}
async function capture(p: Record<string, unknown>, user = identities.technician) {
  return asUser(
    db,
    user,
    async (tx) =>
      (await tx.query<{ id: string }>('select submit_meter_reading($1::jsonb) as id', [JSON.stringify(p)]))
        .rows[0].id
  );
}
async function nextRoute(s: Awaited<ReturnType<typeof setup>>) {
  const route = await command('new_route', {
    ...s.scope,
    label: 'Second route',
    assigned_to: identities.technician,
    starts_on: s.today,
    ends_on: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    cadence: 'weekly',
    assignments: [s.assignment],
  });
  return (await db.query<{ id: string }>('select id from meter_route_items where route_id=$1', [route]))
    .rows[0].id;
}
describe('tablet routes, immutable captures, historical attribution and private evidence', () => {
  it('retains exact register decimals, retries exactly once and rejects operation or stop collisions', async () => {
    const s = await setup();
    const p = payload(s);
    const id = await capture(p);
    expect(await capture(p)).toBe(id);
    expect(
      (await db.query<Record<string, unknown>>('select value from meter_readings where id=$1', [id])).rows[0]
        .value
    ).toBe('123456789012.123456');
    expect(
      (
        await db.query<Record<string, unknown>>('select id from private.meter_sync_operations where id=$1', [
          id,
        ])
      ).rows
    ).toHaveLength(1);
    await expect(capture({ ...p, value: '22' })).rejects.toThrow('operation_conflict');
    await expect(capture({ ...p, id: randomUUID() })).rejects.toThrow('capture_conflict');
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>("update meter_readings set value='0' where id=$1", [id])
      )
    ).rejects.toThrow();
  });
  it('denies wrong technician, foreign organization, unassigned roles and revoked access', async () => {
    const s = await setup();
    await expect(capture(payload(s), identities.owner)).rejects.toThrow();
    await expect(
      command('new_route', { ...s.scope, label: 'Intrusion' }, identities.technician)
    ).rejects.toThrow();
    await expect(capture({ ...payload(s), organization_id: randomUUID() })).rejects.toThrow();
    await asUser(db, identities.technician, async (tx) => {
      expect((await tx.query<Record<string, unknown>>('select * from customers')).rows).toHaveLength(0);
      expect((await tx.query<Record<string, unknown>>('select * from sites_units')).rows).toHaveLength(0);
      expect(
        (await tx.query<Record<string, unknown>>('select meter_occupancy($1) as value', [s.org])).rows[0]
          .value
      ).toEqual([]);
    });
    await asUser(db, identities.owner, (tx) =>
      tx.query<Record<string, unknown>>('select revoke_property_access($1,$2,$3)', [
        s.org,
        s.property,
        identities.technician,
      ])
    );
    await expect(capture(payload(s))).rejects.toThrow();
    await asUser(db, identities.technician, async (tx) =>
      expect(
        (await tx.query<Record<string, unknown>>('select * from meter_routes where id=$1', [s.route])).rows
      ).toHaveLength(0)
    );
  });
  it('retains dated replacement history and rejects stale offline captures', async () => {
    const s = await setup();
    await expect(
      command('new_assignment', {
        ...s.scope,
        meter_id: s.meter,
        site_id: s.site,
        starts_at: new Date().toISOString(),
      })
    ).rejects.toThrow();
    await command('close_assignment', {
      ...s.scope,
      assignment_id: s.assignment,
      ends_at: new Date(Date.now() - 1000).toISOString(),
      remove_meter: true,
      reason: 'Meter replacement',
    });
    await expect(capture(payload(s))).rejects.toThrow('assignment_conflict');
    expect(
      (await db.query<Record<string, unknown>>('select removed_at from meters where id=$1', [s.meter]))
        .rows[0].removed_at
    ).toBeTruthy();
    expect(
      (
        await db.query<Record<string, unknown>>('select close_reason from meter_assignments where id=$1', [
          s.assignment,
        ])
      ).rows[0].close_reason
    ).toBe('Meter replacement');
  });
  it('attributes delayed reading to the actual occupant on the capture day, not the current one', async () => {
    const s = await setup();
    const people = await asUser(db, identities.owner, async (tx) => {
      const customer = (
        await tx.query<{ id: string }>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Past','Resident') returning id",
          [s.org, s.property]
        )
      ).rows[0].id;
      const stay = (
        await tx.query<{ id: string }>(
          'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,ends_on) values($1,$2,$3,$4,current_date-4,current_date-1) returning id',
          [s.org, s.property, s.site, customer]
        )
      ).rows[0].id;
      return { customer, stay };
    });
    const at = new Date(Date.now() - 2 * 86400000).toISOString();
    await db.transaction(async (tx) => {
      await tx.query<Record<string, unknown>>("select set_config('request.jwt.claim.sub',$1,true)", [
        identities.owner,
      ]);
      await tx.exec('alter table meter_routes disable trigger a_stamp');
      await tx.query<Record<string, unknown>>(
        "update meter_routes set starts_on=current_date-3,created_at=now()-interval '3 days' where id=$1",
        [s.route]
      );
      await tx.exec('alter table meter_routes enable trigger a_stamp');
    });
    const id = await capture(payload(s, { captured_at: at }));
    const attribution = (
      await db.query<Record<string, unknown>>(
        'select * from private.meter_reading_occupancy where reading_id=$1',
        [id]
      )
    ).rows[0];
    expect(attribution.customer_id).toBe(people.customer);
    expect(attribution.stay_id).toBe(people.stay);
    await asUser(db, identities.owner, async (tx) =>
      expect(
        (await tx.query<Record<string, unknown>>('select meter_occupancy($1) as entries', [s.org])).rows[0]
          .entries
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ reading_id: id, customer_id: people.customer })])
      )
    );
  });
  it('requires explicit lower-register exceptions, flags zero and unusual readings, and validates register bounds', async () => {
    const s = await setup();
    const first = payload(s, { value: '200' });
    await capture(first);
    const item = await nextRoute(s);
    const next = payload(s, { route_item_id: item, previous_reading_id: first.id, value: '100' });
    await expect(capture(next)).rejects.toThrow('lower_reading');
    await expect(capture({ ...next, value: '1000000000000' })).rejects.toThrow('invalid_reading');
    await expect(capture({ ...next, flag: 'rollover' })).rejects.toThrow('reason_required');
    const id = await capture({ ...next, flag: 'rollover', notes: 'Counter rolled past its maximum' });
    expect(
      (await db.query<Record<string, unknown>>('select exceptions from meter_readings where id=$1', [id]))
        .rows[0].exceptions
    ).toContain('lower_register');
    const zero = await capture(
      payload(s, { route_item_id: await nextRoute(s), previous_reading_id: id, value: '100' })
    );
    expect(
      (await db.query<Record<string, unknown>>('select exceptions from meter_readings where id=$1', [zero]))
        .rows[0].exceptions
    ).toContain('zero');
    const large = await capture(
      payload(s, { route_item_id: await nextRoute(s), previous_reading_id: zero, value: '999' })
    );
    expect(
      (await db.query<Record<string, unknown>>('select exceptions from meter_readings where id=$1', [large]))
        .rows[0].exceptions
    ).toContain('unusual');
  });
  it('detects concurrent readings and supervisor edits to the downloaded baseline', async () => {
    const s = await setup();
    const first = payload(s, { value: '10' });
    await capture(first);
    const item = await nextRoute(s);
    await expect(capture(payload(s, { route_item_id: item, value: '11' }))).rejects.toThrow(
      'baseline_conflict'
    );
    const review = await command('review', {
      ...s.scope,
      reading_id: first.id,
      previous_review_id: null,
      decision: 'accepted',
      corrected_value: '9.999999',
      reason: 'Checked photograph',
    });
    await expect(
      capture(payload(s, { route_item_id: item, previous_reading_id: first.id, value: '11' }))
    ).rejects.toThrow('baseline_conflict');
    await capture(
      payload(s, {
        route_item_id: item,
        previous_reading_id: first.id,
        previous_review_id: review,
        value: '11',
      })
    );
    await expect(
      command('review', {
        ...s.scope,
        reading_id: first.id,
        previous_review_id: null,
        decision: 'rejected',
        reason: 'Stale review',
      })
    ).rejects.toThrow('review_conflict');
  });
  it('preserves original readings and all corrections; technicians cannot estimate or approve', async () => {
    const s = await setup();
    await expect(capture(payload(s, { kind: 'estimated', notes: 'Estimate' }))).rejects.toThrow();
    const id = await capture(payload(s, { value: '0' }));
    await expect(
      command(
        'review',
        { ...s.scope, reading_id: id, previous_review_id: null, decision: 'accepted', reason: 'Bypass' },
        identities.technician
      )
    ).rejects.toThrow();
    const first = await command('review', {
      ...s.scope,
      reading_id: id,
      previous_review_id: null,
      decision: 'accepted',
      corrected_value: '1.000001',
      reason: 'Verified on site',
    });
    await command('review', {
      ...s.scope,
      reading_id: id,
      previous_review_id: first,
      decision: 'accepted',
      corrected_value: '1.000002',
      reason: 'Corrected transposition',
    });
    expect(
      (await db.query<Record<string, unknown>>('select value from meter_readings where id=$1', [id])).rows[0]
        .value
    ).toBe('0');
    expect(
      (
        await db.query<Record<string, unknown>>('select id from meter_reading_reviews where reading_id=$1', [
          id,
        ])
      ).rows
    ).toHaveLength(2);
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>('delete from meter_reading_reviews where reading_id=$1', [id])
      )
    ).rejects.toThrow();
  });
  it('records missing meters and route progress without accepting an absent register', async () => {
    const s = await setup();
    await expect(capture(payload(s, { value: null }))).rejects.toThrow('value_required');
    const id = await capture(
      payload(s, { value: null, flag: 'missing', notes: 'Meter missing at pedestal' })
    );
    await expect(
      command('review', {
        ...s.scope,
        reading_id: id,
        previous_review_id: null,
        decision: 'accepted',
        reason: 'Cannot approve missing',
      })
    ).rejects.toThrow('value_required');
    await command('review', {
      ...s.scope,
      reading_id: id,
      previous_review_id: null,
      decision: 'rejected',
      reason: 'Work order required',
    });
    expect(
      (
        await db.query<Record<string, unknown>>(
          'select count(*)::int as n from meter_route_items i left join meter_readings r on r.route_item_id=i.id where i.route_id=$1 and r.id is null',
          [s.route]
        )
      ).rows[0].n
    ).toBe(0);
  });
  it('protects pending photos, enforces private object policies and retries completion', async () => {
    const s = await setup();
    const p = payload(s, {
      value: '20',
      photo: { mime: 'image/jpeg', byte_size: 123, sha256: 'a'.repeat(64) },
    });
    const id = await capture(p);
    const path = `${s.org}/${s.property}/${identities.technician}/${id}`;
    await expect(
      command('review', {
        ...s.scope,
        reading_id: id,
        previous_review_id: null,
        decision: 'accepted',
        reason: 'Photo incomplete',
      })
    ).rejects.toThrow('photo_pending');
    await expect(
      asUser(db, identities.technician, (tx) =>
        tx.query<Record<string, unknown>>('select complete_meter_photo($1)', [id])
      )
    ).rejects.toThrow('photo_missing');
    await expect(
      asUser(db, identities.other, (tx) =>
        tx.query<Record<string, unknown>>(
          "insert into storage.objects(bucket_id,name,metadata) values('meter-photos',$1,$2::jsonb)",
          [path, JSON.stringify({ size: 123, mimetype: 'image/jpeg' })]
        )
      )
    ).rejects.toThrow();
    await asUser(db, identities.technician, (tx) =>
      tx.query<Record<string, unknown>>(
        "insert into storage.objects(bucket_id,name,metadata) values('meter-photos',$1,$2::jsonb)",
        [path, JSON.stringify({ size: 123, mimetype: 'image/jpeg' })]
      )
    );
    await asUser(db, identities.technician, (tx) =>
      tx.query<Record<string, unknown>>('select complete_meter_photo($1)', [id])
    );
    await asUser(db, identities.technician, (tx) =>
      tx.query<Record<string, unknown>>('select complete_meter_photo($1)', [id])
    );
    await command('review', {
      ...s.scope,
      reading_id: id,
      previous_review_id: null,
      decision: 'accepted',
      reason: 'Verified image',
    });
    await asUser(db, identities.other, async (tx) =>
      expect(
        (await tx.query<Record<string, unknown>>('select * from storage.objects where name=$1', [path])).rows
      ).toHaveLength(0)
    );
    await expect(
      asUser(db, identities.technician, (tx) =>
        tx.query<Record<string, unknown>>('delete from storage.objects where name=$1', [path])
      )
    ).rejects.toThrow();
  });
  it('rejects closed routes, expired captures and assignment history rewrites after capture', async () => {
    const s = await setup();
    await expect(
      capture(payload(s, { captured_at: new Date(Date.now() - 15 * 86400000).toISOString() }))
    ).rejects.toThrow('capture_window');
    const original = payload(s, { value: '25' });
    const id = await capture(original);
    await expect(
      command('close_assignment', {
        ...s.scope,
        assignment_id: s.assignment,
        ends_at: new Date(Date.now() - 10000).toISOString(),
        reason: 'Rewrite old assignment',
        remove_meter: false,
      })
    ).rejects.toThrow('assignment_has_readings');
    await command('cancel_route', { ...s.scope, route_id: s.route, reason: 'Reassigned route' });
    expect(await capture(original)).toBe(id);
    await expect(capture({ ...payload(s), id: crypto.randomUUID() })).rejects.toThrow();
  });
  it('reports conflicting offline operations idempotently and preserves supervisor reconciliation', async () => {
    const s = await setup();
    const first = payload(s, { value: '30' });
    await capture(first);
    const second = payload(s, { value: '31' });
    await expect(capture(second)).rejects.toThrow('capture_conflict');
    const report = () =>
      asUser(
        db,
        identities.technician,
        async (tx) =>
          (
            await tx.query<{ id: string }>('select report_meter_conflict($1::jsonb,$2) as id', [
              JSON.stringify(second),
              'capture_conflict',
            ])
          ).rows[0].id
      );
    expect(await report()).toBe(second.id);
    expect(await report()).toBe(second.id);
    await expect(
      command(
        'resolve_conflict',
        {
          ...s.scope,
          conflict_id: second.id,
          decision: 'discarded',
          reading_id: null,
          reason: 'Forged resolution',
        },
        identities.technician
      )
    ).rejects.toThrow();
    await expect(
      command('resolve_conflict', {
        ...s.scope,
        conflict_id: second.id,
        decision: 'duplicate',
        reading_id: crypto.randomUUID(),
        reason: 'Wrong receipt',
      })
    ).rejects.toThrow('invalid_resolution');
    await command('resolve_conflict', {
      ...s.scope,
      conflict_id: second.id,
      decision: 'duplicate',
      reading_id: first.id,
      reason: 'Same observation; retained original receipt',
    });
    expect(
      (
        await db.query<Record<string, unknown>>('select payload from meter_sync_conflicts where id=$1', [
          second.id,
        ])
      ).rows[0].payload
    ).toEqual(second);
    expect(
      (
        await db.query<Record<string, unknown>>(
          'select id from meter_conflict_resolutions where conflict_id=$1',
          [second.id]
        )
      ).rows
    ).toHaveLength(1);
    await expect(
      asUser(db, identities.other, (tx) =>
        tx.query('select report_meter_conflict($1::jsonb,$2)', [JSON.stringify(second), 'capture_conflict'])
      )
    ).rejects.toThrow();
    await asUser(db, identities.other, async (tx) =>
      expect(
        (await tx.query('select id from meter_sync_conflicts where id=$1', [second.id])).rows
      ).toHaveLength(0)
    );
  });
  it('retains lower-register validation across missing and rejected observations', async () => {
    const s = await setup();
    const known = payload(s, { value: '400' });
    await capture(known);
    const missing = payload(s, {
      route_item_id: await nextRoute(s),
      previous_reading_id: known.id,
      value: null,
      flag: 'missing',
      notes: 'Could not locate meter',
    });
    await capture(missing);
    const next = payload(s, {
      route_item_id: await nextRoute(s),
      previous_reading_id: missing.id,
      value: '50',
    });
    await expect(capture(next)).rejects.toThrow('lower_reading');
    await command('review', {
      ...s.scope,
      reading_id: known.id,
      previous_review_id: null,
      decision: 'rejected',
      corrected_value: null,
      reason: 'Initial register was a transposition',
    });
    expect(await capture(next)).toBe(next.id);
  });
});
