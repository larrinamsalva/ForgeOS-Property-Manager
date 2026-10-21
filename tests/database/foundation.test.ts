import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { database, asUser, foundation, identities } from '../support/database.mjs';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
describe('PostgreSQL foundation, constraints and real RLS', () => {
  it('bootstraps an authenticated owner and retains two independent properties and ten sites', async () => {
    const { org, property } = await foundation(db);
    await asUser(db, identities.owner, async (tx) => {
      await tx.query<Record<string, unknown>>(
        "insert into properties(organization_id,name,category) values($1,'Pine Creek Apartments','apartments')",
        [org]
      );
      for (let i = 1; i <= 10; i++)
        await tx.query<Record<string, unknown>>(
          "insert into sites_units(organization_id,property_id,label,kind,monthly_rate_cents) values($1,$2,$3,'rv',$4)",
          [org, property, String(i), 60000 + i * 100]
        );
    });
    await asUser(db, identities.owner, async (tx) => {
      expect(
        (await tx.query<Record<string, unknown>>('select id from properties where organization_id=$1', [org]))
          .rows
      ).toHaveLength(2);
      expect(
        (
          await tx.query<Record<string, unknown>>('select id from sites_units where property_id=$1', [
            property,
          ])
        ).rows
      ).toHaveLength(10);
      expect(
        (
          await tx.query<Record<string, unknown>>(
            'select role from organization_memberships where organization_id=$1',
            [org]
          )
        ).rows[0].role
      ).toBe('owner');
    });
  });
  it('rejects unauthenticated organization bootstrap', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query<Record<string, unknown>>("select set_config('request.jwt.claim.sub','',true)");
        await tx.query<Record<string, unknown>>("select create_organization('Intruder')");
      })
    ).rejects.toThrow();
  });
  it('isolates organizations and rejects moving a record across organizations', async () => {
    const a = await foundation(db);
    const b = await foundation(db, identities.other);
    await asUser(db, identities.other, async (tx) => {
      expect(
        (await tx.query<Record<string, unknown>>('select id from properties where id=$1', [a.property])).rows
      ).toHaveLength(0);
    });
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>('update properties set organization_id=$1 where id=$2', [
          b.org,
          a.property,
        ])
      )
    ).rejects.toThrow('history_immutable');
    await expect(
      asUser(db, identities.other, (tx) =>
        tx.query<Record<string, unknown>>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'X','rv')",
          [a.org, a.property]
        )
      )
    ).rejects.toThrow();
  });
  it('preserves contact edits in an append-only audit and prevents deleting records', async () => {
    const { org, property } = await foundation(db);
    const customer = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'River','Sample') returning id",
            [org, property]
          )
        ).rows[0].id
    );
    await asUser(db, identities.owner, (tx) =>
      tx.query<Record<string, unknown>>("update customers set phone='555-0100' where id=$1", [customer])
    );
    await asUser(db, identities.owner, async (tx) => {
      const events = (
        await tx.query<Record<string, unknown>>(
          'select before_data,after_data from audit_events where entity_id=$1 order by occurred_at',
          [customer]
        )
      ).rows;
      expect(events).toHaveLength(2);
      expect((events[1].after_data as { phone: string }).phone).toBe('555-0100');
    });
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>('delete from customers where id=$1', [customer])
      )
    ).rejects.toThrow();
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>("update audit_events set action='HIDDEN' where entity_id=$1", [
          customer,
        ])
      )
    ).rejects.toThrow();
  });
  it('rejects duplicate site numbers but permits the same number at another property', async () => {
    const a = await foundation(db);
    const b = await foundation(db);
    const insert = (org: string, property: string) =>
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'12','rv')",
          [org, property]
        )
      );
    await insert(a.org, a.property);
    await expect(insert(a.org, a.property)).rejects.toThrow();
    await insert(b.org, b.property);
  });
  it('permits office move-in, enforces overlap, locks archives and preserves move-out history', async () => {
    const { org, property } = await foundation(db);
    const { site, customer } = await asUser(db, identities.owner, async (tx) => {
      await tx.query<Record<string, unknown>>("select grant_property_access($1,$2,$3,'office')", [
        org,
        property,
        identities.office,
      ]);
      const site = (
        await tx.query<Record<string, unknown>>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'14','rv') returning id",
          [org, property]
        )
      ).rows[0].id;
      const customer = (
        await tx.query<Record<string, unknown>>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Sky','Example') returning id",
          [org, property]
        )
      ).rows[0].id;
      return { site, customer };
    });
    const stay = await asUser(
      db,
      identities.office,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on) values($1,$2,$3,$4,current_date-2) returning id',
            [org, property, site, customer]
          )
        ).rows[0].id
    );
    await expect(
      asUser(db, identities.office, (tx) =>
        tx.query<Record<string, unknown>>(
          'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on) values($1,$2,$3,$4,current_date-1)',
          [org, property, site, customer]
        )
      )
    ).rejects.toThrow();
    for (const [table, id] of [
      ['sites_units', site],
      ['customers', customer],
      ['properties', property],
    ])
      await expect(
        asUser(db, identities.owner, (tx) =>
          tx.query<Record<string, unknown>>(`update ${table} set archived_at=now() where id=$1`, [id])
        )
      ).rejects.toThrow('archive_active');
    await asUser(db, identities.office, (tx) =>
      tx.query<Record<string, unknown>>(
        "select complete_stay($1,(now() at time zone 'America/Los_Angeles')::date)",
        [stay]
      )
    );
    await asUser(db, identities.owner, async (tx) => {
      expect(
        (await tx.query<Record<string, unknown>>('select ends_on from occupancy_stays where id=$1', [stay]))
          .rows[0].ends_on
      ).toBeTruthy();
      expect(
        (
          await tx.query<Record<string, unknown>>('select physical_status from sites_units where id=$1', [
            site,
          ])
        ).rows[0].physical_status
      ).toBe('in_preparation');
      await tx.query<Record<string, unknown>>('update customers set archived_at=now() where id=$1', [
        customer,
      ]);
      expect(
        (
          await tx.query<Record<string, unknown>>('select id from occupancy_stays where customer_id=$1', [
            customer,
          ])
        ).rows
      ).toHaveLength(1);
    });
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>('update occupancy_stays set ends_on=null where id=$1', [stay])
      )
    ).rejects.toThrow();
  });
  it('scopes managers to their property and denies technicians customer/financial data and direct role escalation', async () => {
    const a = await foundation(db);
    const b = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            "insert into properties(organization_id,name,category) values($1,'Second Park','rv_park') returning id",
            [a.org]
          )
        ).rows[0].id
    );
    await asUser(db, identities.owner, async (tx) => {
      await tx.query<Record<string, unknown>>("select grant_property_access($1,$2,$3,'manager')", [
        a.org,
        a.property,
        identities.manager,
      ]);
      await tx.query<Record<string, unknown>>("select grant_property_access($1,$2,$3,'meter_technician')", [
        a.org,
        a.property,
        identities.technician,
      ]);
      await tx.query<Record<string, unknown>>(
        "insert into sites_units(organization_id,property_id,label,kind,monthly_rate_cents) values($1,$2,'9','rv',65000)",
        [a.org, a.property]
      );
    });
    await asUser(db, identities.manager, async (tx) => {
      expect(
        (await tx.query<Record<string, unknown>>('select id from properties where id=$1', [b])).rows
      ).toHaveLength(0);
    });
    await asUser(db, identities.technician, async (tx) => {
      expect(
        (await tx.query<Record<string, unknown>>('select * from customers where organization_id=$1', [a.org]))
          .rows
      ).toHaveLength(0);
      expect(
        (
          await tx.query<Record<string, unknown>>(
            'select monthly_rate_cents from sites_units where property_id=$1',
            [a.property]
          )
        ).rows
      ).toHaveLength(0);
      expect(
        (
          await tx.query<Record<string, unknown>>('select * from audit_events where organization_id=$1', [
            a.org,
          ])
        ).rows
      ).toHaveLength(0);
      expect(
        (
          await tx.query<Record<string, unknown>>(
            'update sites_units set monthly_rate_cents=1 where property_id=$1 returning id',
            [a.property]
          )
        ).rows
      ).toHaveLength(0);
    });
    await expect(
      asUser(db, identities.manager, (tx) =>
        tx.query<Record<string, unknown>>("select grant_property_access($1,$2,$3,'manager')", [
          a.org,
          b,
          identities.technician,
        ])
      )
    ).rejects.toThrow();
    await expect(
      asUser(db, identities.technician, (tx) =>
        tx.query<Record<string, unknown>>(
          "insert into organization_memberships values($1,$2,'owner',now())",
          [a.org, identities.other]
        )
      )
    ).rejects.toThrow();
  });
  it('requires valid property relationships and effective dates', async () => {
    const a = await foundation(db);
    const b = await foundation(db);
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'BAD','rv')",
          [a.org, b.property]
        )
      )
    ).rejects.toThrow();
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query<Record<string, unknown>>("update properties set timezone='not/a/zone' where id=$1", [
          a.property,
        ])
      )
    ).rejects.toThrow();
  });
  it('rejects future move-ins, unavailable sites, wrong-property customers and invalid departure dates', async () => {
    const a = await foundation(db);
    const b = await foundation(db);
    const ids = await asUser(db, identities.owner, async (tx) => {
      const site = (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'D-1','rv') returning id",
          [a.org, a.property]
        )
      ).rows[0].id;
      const customer = (
        await tx.query<{ id: string }>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Date','Sample') returning id",
          [a.org, a.property]
        )
      ).rows[0].id;
      const foreignCustomer = (
        await tx.query<{ id: string }>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Other','Sample') returning id",
          [b.org, b.property]
        )
      ).rows[0].id;
      return { site, customer, foreignCustomer };
    });
    const insert = (date: string, customer = ids.customer) =>
      asUser(db, identities.owner, (tx) =>
        tx.query(
          `insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on) values($1,$2,$3,$4,${date})`,
          [a.org, a.property, ids.site, customer]
        )
      );
    await expect(insert('current_date+3')).rejects.toThrow('future_stay');
    await expect(insert('current_date-3', ids.foreignCustomer)).rejects.toThrow();
    await asUser(db, identities.owner, (tx) =>
      tx.query("update sites_units set physical_status='blocked' where id=$1", [ids.site])
    );
    await expect(insert('current_date-3')).rejects.toThrow('site_unavailable');
    await asUser(db, identities.owner, (tx) =>
      tx.query("update sites_units set physical_status='ready' where id=$1", [ids.site])
    );
    const stay = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            'insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on) values($1,$2,$3,$4,current_date-3) returning id',
            [a.org, a.property, ids.site, ids.customer]
          )
        ).rows[0].id
    );
    await expect(
      asUser(db, identities.owner, (tx) => tx.query('select complete_stay($1,current_date+2)', [stay]))
    ).rejects.toThrow('invalid_moveout');
    await expect(
      asUser(db, identities.other, (tx) => tx.query('select complete_stay($1,current_date-1)', [stay]))
    ).rejects.toThrow();
  });
  it('revokes access immediately and audits the membership removal', async () => {
    const a = await foundation(db);
    await asUser(db, identities.owner, (tx) =>
      tx.query("select grant_property_access($1,$2,$3,'manager')", [a.org, a.property, identities.manager])
    );
    await asUser(db, identities.manager, async (tx) => {
      expect((await tx.query('select id from properties where id=$1', [a.property])).rows).toHaveLength(1);
    });
    await asUser(db, identities.owner, (tx) =>
      tx.query('select revoke_property_access($1,$2,$3)', [a.org, a.property, identities.manager])
    );
    await asUser(db, identities.manager, async (tx) => {
      expect((await tx.query('select id from properties where id=$1', [a.property])).rows).toHaveLength(0);
    });
    await asUser(db, identities.owner, async (tx) => {
      expect(
        (
          await tx.query(
            "select id from audit_events where organization_id=$1 and entity='property_memberships' and action='DELETE'",
            [a.org]
          )
        ).rows
      ).toHaveLength(1);
    });
  });
  it('has RLS on every application table, no exposed definer RPCs and no anonymous table access', async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"
    );
    expect(tables.rows).toHaveLength(25);
    expect(tables.rows.every((r) => r.relrowsecurity)).toBe(true);
    expect(
      (
        await db.query(
          "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef"
        )
      ).rows
    ).toHaveLength(0);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query('select * from public.customers');
      })
    ).rejects.toThrow();
  });
});
