import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,asUser,identities} from '../support/database.mjs';

let db:PGlite;
beforeAll(async()=>{db=await database();});
afterAll(async()=>{await db?.close();});

describe('supervisor reinspection migration permission boundaries',()=>{
 it('enables RLS and restricts policy roles and commands',async()=>{
  const table=await db.query<{relrowsecurity:boolean}>(`select relrowsecurity from pg_class where oid='public.inspection_rechecks'::regclass`);
  expect(table.rows[0].relrowsecurity).toBe(true);
  const policies=await db.query<{policyname:string;cmd:string;roles:string[];qual:string|null;with_check:string|null}>(`
   select policyname,cmd,roles,qual,with_check
   from pg_policies where schemaname='public' and tablename='inspection_rechecks'`);
  expect(policies.rows).toHaveLength(2);
  const read=policies.rows.find(p=>p.policyname==='inspection_rechecks_read');
  const write=policies.rows.find(p=>p.policyname==='inspection_rechecks_insert');
  expect(read?.cmd).toBe('SELECT');
  expect(read?.roles).toContain('authenticated');
  expect(read?.qual).toContain('operations_worker');
  expect(write?.cmd).toBe('INSERT');
  expect(write?.roles).toContain('authenticated');
  expect(write?.with_check).toContain('operations_manager');
  expect(write?.with_check).toContain('inspection_recheck_valid');
  expect(write?.with_check).toContain('signed_by');
 });
 it('rejects an unaffiliated authenticated actor inserting forged verification',async()=>{
  const random='00000000-0000-4000-8000-000000000999';
  await expect(asUser(db,identities.other,tx=>tx.query(
   `insert into public.inspection_rechecks
    (organization_id,property_id,inspection_link_id,outcome,notes,signed_by)
    values($1,$1,$1,'verified','Invalid outsider attempt',$2)`,
    [random,identities.other]))).rejects.toThrow();
 });
});
