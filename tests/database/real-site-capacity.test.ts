import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, database, foundation, identities } from '../support/database.mjs';

let db: PGlite;
let scope: { org: string; property: string };
beforeAll(async () => {
  db = await database();
  scope = await foundation(db);
}, 30000);
afterAll(async () => { await db?.close(); });

describe('700 persisted ForgeOS sites in disposable migrated database', () => {
  it('persists 700 fictional sites in the real sites table with mixed unit types', async () => {
    const started = performance.now();
    await asUser(db, identities.owner, tx => tx.query(`
      insert into public.sites(organization_id,property_id,label,kind)
      select $1::uuid,$2::uuid,'Test Space ' || n,
        case when n % 7 = 0 then 'apartment' else 'rv' end
      from generate_series(1,700) as n
    `, [scope.org, scope.property]));
    const counts = await asUser(db, identities.owner, tx => tx.query<{
      total: number; apartments: number; rv: number;
    }>(`select count(*)::int as total,
        count(*) filter (where kind='apartment')::int as apartments,
        count(*) filter (where kind='rv')::int as rv
      from public.sites where organization_id=$1 and property_id=$2`,
      [scope.org, scope.property]));
    console.info('700 actual ForgeOS site inserts and scoped count:', (performance.now()-started).toFixed(1), 'ms');
    expect(counts.rows[0]).toEqual({ total:700, apartments:100, rv:600 });
  });
  it('keeps actual site records hidden from unrelated authenticated users', async () => {
    const records = await asUser(db, identities.other, tx => tx.query<{ count: number }>(
      'select count(*)::int as count from public.sites where property_id=$1', [scope.property]));
    expect(records.rows[0].count).toBe(0);
  });
  it('retrieves one site by property and label without returning another site', async () => {
    const started = performance.now();
    const records = await asUser(db, identities.owner, tx => tx.query<{label:string;kind:string}>(`
      select label,kind from public.sites
      where property_id=$1 and label=$2 order by label limit 1
    `, [scope.property, 'Test Space 88']));
    console.info('Actual ForgeOS site lookup:', (performance.now()-started).toFixed(1),'ms');
    expect(records.rows).toEqual([{label:'Test Space 88',kind:'rv'}]);
  });
});
