import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { database, asUser, foundation, identities } from '../support/database.mjs';
import { addDays, dateAtProperty } from '../../src/lib/domain';
let db: PGlite;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
async function setup() {
  const a = await foundation(db);
  const records = await asUser(db, identities.owner, async (tx) => {
    const site = String(
      (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind,max_rv_length_ft) values($1,$2,'RV-01','rv',45) returning id",
          [a.org, a.property]
        )
      ).rows[0].id
    );
    const second = String(
      (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'RV-02','rv') returning id",
          [a.org, a.property]
        )
      ).rows[0].id
    );
    const apartment = String(
      (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'A-01','apartment') returning id",
          [a.org, a.property]
        )
      ).rows[0].id
    );
    const customer = String(
      (
        await tx.query<{ id: string }>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'River','Sample') returning id",
          [a.org, a.property]
        )
      ).rows[0].id
    );
    return { site, second, apartment, customer };
  });
  return { ...a, ...records, today: dateAtProperty('America/Los_Angeles') };
}
type Data = Awaited<ReturnType<typeof setup>>;
async function booking(
  a: Data,
  from = addDays(a.today, 1),
  until = addDays(a.today, 3),
  status = 'confirmed',
  site = a.site
) {
  return asUser(db, identities.owner, async (tx) =>
    String(
      (
        await tx.query<{ id: string }>(
          'insert into reservations(organization_id,property_id,site_id,customer_id,starts_on,ends_on,status) values($1,$2,$3,$4,$5,$6,$7) returning id',
          [a.org, a.property, site, a.customer, from, until, status]
        )
      ).rows[0].id
    )
  );
}
async function movein(a: Data, planned: string | null = null, site = a.site, starts = addDays(a.today, -2)) {
  return asUser(db, identities.owner, async (tx) =>
    String(
      (
        await tx.query<{ id: string }>(
          'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,planned_ends_on) values($1,$2,$3,$4,$5,$6) returning id',
          [a.org, a.property, site, a.customer, starts, planned]
        )
      ).rows[0].id
    )
  );
}
const owner = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(db, identities.owner, fn);
describe('Reservations, shared availability, handovers and lease history', () => {
  it('allows adjacent bookings, keeps tentative records nonblocking, and rejects overlapping confirmation', async () => {
    const a = await setup();
    await booking(a);
    await booking(a, addDays(a.today, 3), addDays(a.today, 5));
    const tentative = await booking(a, addDays(a.today, 2), addDays(a.today, 4), 'tentative');
    await expect(
      owner((tx) => tx.query("update reservations set status='confirmed' where id=$1", [tentative]))
    ).rejects.toThrow(/exclusion|conflict/i);
    await expect(booking(a, addDays(a.today, 2), addDays(a.today, 4))).rejects.toThrow(/exclusion|conflict/i);
    await expect(booking(a, a.today, a.today)).rejects.toThrow();
    await expect(booking(a, addDays(a.today, -1), addDays(a.today, 1))).rejects.toThrow('booking_in_past');
  });
  it('releases cancelled holds, requires a reason, retains history and disallows fabricated lifecycle states', async () => {
    const a = await setup();
    const id = await booking(a);
    await expect(
      owner((tx) => tx.query("update reservations set status='cancelled' where id=$1", [id]))
    ).rejects.toThrow('invalid_transition');
    await expect(
      owner((tx) => tx.query("update reservations set status='checked_in' where id=$1", [id]))
    ).rejects.toThrow('invalid_transition');
    await owner((tx) =>
      tx.query("update reservations set status='cancelled',cancellation_reason='Plans changed' where id=$1", [
        id,
      ])
    );
    await booking(a);
    await expect(
      owner((tx) => tx.query("update reservations set status='confirmed' where id=$1", [id]))
    ).rejects.toThrow('history_immutable');
    await expect(owner((tx) => tx.query('delete from reservations where id=$1', [id]))).rejects.toThrow();
    const rows = await owner((tx) =>
      tx.query<{ status: string; confirmation_code: string }>(
        'select status,confirmation_code from reservations where id=$1',
        [id]
      )
    );
    expect(rows.rows[0].status).toBe('cancelled');
    expect(rows.rows[0].confirmation_code).toMatch(/^FG-[A-F0-9]{12}$/);
    expect(
      (
        await owner((tx) =>
          tx.query("select id from audit_events where entity='reservations' and entity_id=$1", [id])
        )
      ).rows
    ).toHaveLength(2);
  });
  it('prevents direct move-ins from consuming a reserved range and prevents extensions into a future booking', async () => {
    const a = await setup();
    await booking(a, addDays(a.today, 3), addDays(a.today, 6));
    await expect(movein(a)).rejects.toThrow(/exclusion|conflict/i);
    const stay = await movein(a, addDays(a.today, 3));
    await expect(
      owner((tx) =>
        tx.query('select change_stay_plan($1,$2,$3)', [stay, addDays(a.today, 4), 'Extension requested'])
      )
    ).rejects.toThrow(/exclusion|conflict/i);
    const result = await owner((tx) =>
      tx.query<{ departure: string }>(
        'select planned_ends_on::text as departure from occupancy_stays where id=$1',
        [stay]
      )
    );
    expect(result.rows[0].departure).toBe(addDays(a.today, 3));
    await owner((tx) =>
      tx.query('select change_stay_plan($1,$2,$3)', [stay, addDays(a.today, 2), 'Shorter visit'])
    );
    await expect(
      owner((tx) =>
        tx.query('update occupancy_stays set planned_ends_on=$1 where id=$2', [addDays(a.today, 4), stay])
      )
    ).rejects.toThrow();
  });
  it('checks in exactly once and atomically completes booking, stay and handover history', async () => {
    const a = await setup();
    const id = await booking(a, a.today, addDays(a.today, 3));
    const checkin = () =>
      owner((tx) =>
        tx.query<{ id: string }>('select check_in_reservation($1,$2,$3) as id', [
          id,
          a.today,
          JSON.stringify({
            occupants: 'Two adults',
            arrival_condition: 'Clean',
            initial_meter_notes: 'Photo reference A1',
          }),
        ])
      );
    const first = (await checkin()).rows[0].id;
    expect((await checkin()).rows[0].id).toBe(first);
    const state = await owner((tx) =>
      tx.query<{ status: string }>('select status from reservations where id=$1', [id])
    );
    expect(state.rows[0].status).toBe('checked_in');
    await owner((tx) =>
      tx.query('select change_stay_plan($1,$2,$3)', [
        first,
        addDays(a.today, 5),
        'Guest extended checked-in stay',
      ])
    );
    expect(
      (
        await owner((tx) =>
          tx.query<{ ends_on: string }>('select ends_on::text as ends_on from reservations where id=$1', [id])
        )
      ).rows[0].ends_on
    ).toBe(addDays(a.today, 3));
    await owner((tx) =>
      tx.query('select complete_stay_checklist($1,$2,$3)', [
        first,
        a.today,
        JSON.stringify({
          departure_condition: 'Window needs repair',
          maintenance_needed: true,
          deposit_notes: 'Review recorded separately',
          final_meter_notes: 'Photo reference A2',
        }),
      ])
    );
    const result = await owner((tx) =>
      tx.query<{ status: string; physical_status: string; maintenance_needed: boolean }>(
        'select r.status,u.physical_status,s.maintenance_needed from reservations r join occupancy_stays s on s.reservation_id=r.id join sites_units u on u.id=s.site_id where r.id=$1',
        [id]
      )
    );
    expect(result.rows[0]).toMatchObject({
      status: 'completed',
      physical_status: 'in_preparation',
      maintenance_needed: true,
    });
    await expect(owner((tx) => tx.query('select complete_stay($1,$2)', [first, a.today]))).rejects.toThrow(
      'history_immutable'
    );
    await expect(
      owner((tx) => tx.query("update reservations set notes='Rewrite' where id=$1", [id]))
    ).rejects.toThrow('history_immutable');
  });
  it('rejects early check-in, unavailable sites, overdue occupants, and premature no-show', async () => {
    const a = await setup();
    const future = await booking(a);
    await expect(
      owner((tx) => tx.query('select check_in_reservation($1,$2,$3)', [future, a.today, '{}']))
    ).rejects.toThrow('invalid_checkin');
    await expect(
      owner((tx) =>
        tx.query("update reservations set status='no_show',cancellation_reason='Absent' where id=$1", [
          future,
        ])
      )
    ).rejects.toThrow('invalid_transition');
    const due = await booking(a, a.today, addDays(a.today, 3), 'confirmed', a.second);
    await movein(a, a.today, a.second, addDays(a.today, -1));
    await expect(
      owner((tx) => tx.query('select check_in_reservation($1,$2,$3)', [due, a.today, '{}']))
    ).rejects.toThrow('site_occupied');
    await expect(booking(a, addDays(a.today, 4), addDays(a.today, 5), 'confirmed', a.second)).rejects.toThrow(
      'overdue_departure'
    );
    await owner((tx) =>
      tx.query("update sites_units set physical_status='blocked' where id=$1", [a.apartment])
    );
    await expect(
      booking(a, addDays(a.today, 1), addDays(a.today, 3), 'confirmed', a.apartment)
    ).rejects.toThrow('site_unavailable');
  });
  it('requires compatible site moves and valid RV length, then safely releases a no-show', async () => {
    const a = await setup();
    const id = await booking(a, a.today, addDays(a.today, 2));
    await expect(
      owner((tx) => tx.query('update reservations set site_id=$1 where id=$2', [a.apartment, id]))
    ).rejects.toThrow('incompatible_site');
    await expect(
      owner((tx) => tx.query('update reservations set rv_length_ft=60 where id=$1', [id]))
    ).rejects.toThrow('incompatible_site');
    await owner((tx) => tx.query('update reservations set site_id=$1 where id=$2', [a.second, id]));
    await booking(a, a.today, addDays(a.today, 2));
    await owner((tx) =>
      tx.query("update reservations set status='no_show',cancellation_reason='Did not arrive' where id=$1", [
        id,
      ])
    );
    await booking(a, a.today, addDays(a.today, 2), 'confirmed', a.second);
  });
  it('blocks archives and blocking physical-state changes while a confirmed booking exists', async () => {
    const a = await setup();
    await booking(a);
    for (const [table, id] of [
      ['properties', a.property],
      ['sites_units', a.site],
      ['customers', a.customer],
    ])
      await expect(
        owner((tx) => tx.query(`update ${table} set archived_at=now() where id=$1`, [id]))
      ).rejects.toThrow('archive_active');
    await expect(
      owner((tx) => tx.query("update sites_units set physical_status='out_of_service' where id=$1", [a.site]))
    ).rejects.toThrow('site_unavailable');
  });
  it('transfers in one transaction, preserves the old stay, and rolls back completely on conflict', async () => {
    const a = await setup();
    const stay = await movein(a, addDays(a.today, 5));
    const hold = await booking(a, addDays(a.today, 2), addDays(a.today, 4), 'confirmed', a.second);
    const transfer = () =>
      owner((tx) =>
        tx.query<{ id: string }>('select transfer_stay($1,$2,$3,$4,$5) as id', [
          stay,
          a.second,
          a.today,
          72500,
          'Requested quieter site',
        ])
      );
    await expect(transfer()).rejects.toThrow(/exclusion|conflict/i);
    expect(
      (
        await owner((tx) =>
          tx.query<{ ends_on: null }>('select ends_on from occupancy_stays where id=$1', [stay])
        )
      ).rows[0].ends_on
    ).toBeNull();
    await owner((tx) =>
      tx.query("update reservations set status='cancelled',cancellation_reason='Relocated' where id=$1", [
        hold,
      ])
    );
    const moved = (await transfer()).rows[0].id;
    const history = await owner((tx) =>
      tx.query<{ previous_stay_id: string; agreed_rate_cents: number }>(
        'select previous_stay_id,agreed_rate_cents from occupancy_stays where id=$1',
        [moved]
      )
    );
    expect(history.rows[0]).toMatchObject({ previous_stay_id: stay, agreed_rate_cents: 72500 });
    expect(
      (await owner((tx) => tx.query('select id from occupancy_stays where customer_id=$1', [a.customer])))
        .rows
    ).toHaveLength(2);
    await expect(transfer()).rejects.toThrow('invalid_transfer');
  });
  it('records immutable, nonoverlapping lease terms and adjacent renewals with reversible void records', async () => {
    const a = await setup();
    const stay = await movein(a, addDays(a.today, 70));
    const term = async (from: string, until: string, prior: string | null = null) =>
      owner(async (tx) =>
        String(
          (
            await tx.query<{ id: string }>(
              'insert into lease_terms(organization_id,property_id,stay_id,customer_id,site_id,starts_on,ends_on,agreed_rate_cents,renewed_from_id) values($1,$2,$3,$4,$5,$6,$7,65000,$8) returning id',
              [a.org, a.property, stay, a.customer, a.site, from, until, prior]
            )
          ).rows[0].id
        )
      );
    const first = await term(a.today, addDays(a.today, 30));
    await expect(term(addDays(a.today, 20), addDays(a.today, 40))).rejects.toThrow(/exclusion|conflict/i);
    await expect(term(addDays(a.today, 31), addDays(a.today, 60), first)).rejects.toThrow('invalid_renewal');
    const renewal = await term(addDays(a.today, 30), addDays(a.today, 60), first);
    await expect(
      owner((tx) => tx.query('update lease_terms set agreed_rate_cents=1 where id=$1', [first]))
    ).rejects.toThrow('history_immutable');
    await expect(
      owner((tx) =>
        tx.query("update lease_terms set status='voided',void_reason='Correction' where id=$1", [first])
      )
    ).rejects.toThrow('void_renewal_first');
    await owner((tx) =>
      tx.query("update lease_terms set status='voided',void_reason='Wrong dates recorded' where id=$1", [
        renewal,
      ])
    );
    expect(
      (await owner((tx) => tx.query('select id from lease_terms where stay_id=$1', [stay]))).rows
    ).toHaveLength(2);
    await expect(owner((tx) => tx.query('delete from lease_terms where id=$1', [renewal]))).rejects.toThrow();
    await term(addDays(a.today, 30), addDays(a.today, 60), first);
    await owner((tx) =>
      tx.query("select grant_property_access($1,$2,$3,'office')", [a.org, a.property, identities.office])
    );
    await expect(
      asUser(db, identities.office, (tx) =>
        tx.query("update lease_terms set status='voided',void_reason='Not authorized' where id=$1", [first])
      )
    ).rejects.toThrow();
  });
  it('enforces property roles for all new records, rejects cross-property keys, and denies private allocations', async () => {
    const a = await setup();
    const b = await setup();
    const id = await booking(a);
    await owner((tx) =>
      tx.query("select grant_property_access($1,$2,$3,'office')", [a.org, a.property, identities.office])
    );
    await owner((tx) =>
      tx.query("select grant_property_access($1,$2,$3,'maintenance')", [
        a.org,
        a.property,
        identities.technician,
      ])
    );
    for (const who of [identities.other, identities.technician])
      await asUser(db, who, async (tx) => {
        expect((await tx.query('select id from reservations where id=$1', [id])).rows).toHaveLength(0);
        expect((await tx.query('select id from lease_terms')).rows).toHaveLength(0);
      });
    await expect(
      asUser(db, identities.technician, (tx) =>
        tx.query('select check_in_reservation($1,$2,$3)', [id, a.today, '{}'])
      )
    ).rejects.toThrow();
    await expect(
      owner((tx) => tx.query('update reservations set customer_id=$1 where id=$2', [b.customer, id]))
    ).rejects.toThrow();
    expect(
      (await asUser(db, identities.office, (tx) => tx.query('select id from reservations where id=$1', [id])))
        .rows
    ).toHaveLength(1);
    await expect(owner((tx) => tx.query('select * from private.site_allocations'))).rejects.toThrow();
    expect(
      (
        await db.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where oid='private.site_allocations'::regclass"
        )
      ).rows[0].relrowsecurity
    ).toBe(true);
    for (const table of ['reservations', 'lease_terms'])
      await expect(
        db.transaction(async (tx) => {
          await tx.exec('set local role anon');
          await tx.query(`select * from public.${table}`);
        })
      ).rejects.toThrow();
    await owner((tx) =>
      tx.query('select revoke_property_access($1,$2,$3)', [a.org, a.property, identities.office])
    );
    expect(
      (await asUser(db, identities.office, (tx) => tx.query('select id from reservations where id=$1', [id])))
        .rows
    ).toHaveLength(0);
  });
});
