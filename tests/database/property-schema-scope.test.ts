import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, database, foundation, identities } from '../support/database.mjs';

// Runs real ForgeOS migrations in a disposable PGlite engine; never connects to Supabase.
let db: PGlite;
let scope: {org:string;property:string};
beforeAll(async()=>{
  db=await database();
  scope=await foundation(db);
},30000);
afterAll(async()=>{await db?.close();});

describe('migration-backed property authorization and query baseline',()=>{
  it('owner reads their real property through authenticated RLS',async()=>{
    const found=await asUser(db,identities.owner,tx=>tx.query<{id:string}>(
      'select id from public.properties where id=$1 and organization_id=$2',
      [scope.property,scope.org],
    ));
    expect(found.rows.map(row=>row.id)).toEqual([scope.property]);
  });
  it('unrelated identity cannot read the owner property through RLS',async()=>{
    const found=await asUser(db,identities.other,tx=>tx.query<{id:string}>(
      'select id from public.properties where id=$1',[scope.property],
    ));
    expect(found.rows).toHaveLength(0);
  });
  it('runs a 700-space synthetic query scoped through the real authorized properties table',async()=>{
    const started=performance.now();
    const query=`select count(*)::int as count from public.properties p
      cross join generate_series(1,700) as fictional_space(number)
      where p.id=$1 and p.organization_id=$2`;
    const owner=await asUser(db,identities.owner,tx=>tx.query<{count:number}>(
      query,[scope.property,scope.org],
    ));
    const stranger=await asUser(db,identities.other,tx=>tx.query<{count:number}>(
      query,[scope.property,scope.org],
    ));
    console.info('Migration-backed scoped 700-row SQL baseline:',(performance.now()-started).toFixed(1),'ms');
    expect(owner.rows[0].count).toBe(700);
    expect(stranger.rows[0].count).toBe(0);
  });
});
