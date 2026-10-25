import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, database, foundation, identities } from '../support/database.mjs';

let db:PGlite;
let scope:{org:string;property:string};
beforeAll(async()=>{
  db=await database();
  scope=await foundation(db);
  await asUser(db,identities.owner,async tx=>{
    await tx.query(`
      insert into public.sites_units(organization_id,property_id,label,kind,created_by,updated_by)
      select $1::uuid,$2::uuid,'Space ' || n,'rv',auth.uid(),auth.uid()
      from generate_series(1,700) n
    `,[scope.org,scope.property]);
    await tx.query(`
      insert into public.customers(organization_id,property_id,first_name,last_name,created_by,updated_by)
      select $1::uuid,$2::uuid,'Resident','Test ' || lpad(n::text,3,'0'),auth.uid(),auth.uid()
      from generate_series(1,700) n
    `,[scope.org,scope.property]);
    await tx.query(`
      insert into public.occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,created_by,updated_by)
      select $1::uuid,$2::uuid,s.id,c.id,'2026-01-01'::date,auth.uid(),auth.uid()
      from public.sites_units s
      join public.customers c on c.property_id=s.property_id
        and c.last_name='Test ' || lpad(substring(s.label from 7)::int::text,3,'0')
      where s.property_id=$2 and s.label like 'Space %'
    `,[scope.org,scope.property]);
  });
},30000);
afterAll(async()=>{await db?.close();});
describe('700 actual ForgeOS customers and assignments — isolated migration-backed tests',()=>{
  it('persists one current occupancy for each of 700 spaces',async()=>{
    const started=performance.now();
    const result=await asUser(db,identities.owner,tx=>tx.query<{count:number;unique_sites:number;unique_customers:number}>(`
      select count(*)::int as count,count(distinct site_id)::int as unique_sites,
        count(distinct customer_id)::int as unique_customers
      from public.occupancy_stays where property_id=$1
    `,[scope.property]));
    console.info('700-space occupancy verification:',(performance.now()-started).toFixed(1),'ms');
    expect(result.rows[0]).toEqual({count:700,unique_sites:700,unique_customers:700});
  });
  it('looks up Space 88 and the matching fictional resident',async()=>{
    const started=performance.now();
    const result=await asUser(db,identities.owner,tx=>tx.query<{label:string;last_name:string}>(`
      select s.label,c.last_name from public.occupancy_stays st
      join public.sites_units s on s.id=st.site_id
      join public.customers c on c.id=st.customer_id
      where st.property_id=$1 and s.label=$2 and st.ends_on is null
    `,[scope.property,'Space 88']));
    console.info('Space 88 assigned customer lookup:',(performance.now()-started).toFixed(1),'ms');
    expect(result.rows).toEqual([{label:'Space 88',last_name:'Test 088'}]);
  });
  it('does not expose resident records to an unrelated authenticated user',async()=>{
    const count=await asUser(db,identities.other,tx=>tx.query<{count:number}>(`
      select count(*)::int as count from public.customers where property_id=$1
    `,[scope.property]));
    const occupancy=await asUser(db,identities.other,tx=>tx.query<{count:number}>(`
      select count(*)::int as count from public.occupancy_stays where property_id=$1
    `,[scope.property]));
    expect(count.rows[0].count).toBe(0);
    expect(occupancy.rows[0].count).toBe(0);
  });
  it('rejects overlapping occupancy dates for the same space',async()=>{
    await expect(asUser(db,identities.owner,tx=>tx.query(`
      insert into public.occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,created_by,updated_by)
      select $1::uuid,$2::uuid,s.id,c.id,'2026-09-01'::date,auth.uid(),auth.uid()
      from public.sites_units s cross join public.customers c
      where s.property_id=$2 and c.property_id=$2 and s.label='Space 88' and c.last_name='Test 089'
    `,[scope.org,scope.property]))).rejects.toThrow();
  });
});
