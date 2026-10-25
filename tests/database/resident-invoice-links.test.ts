import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, database, foundation, identities } from '../support/database.mjs';

// Real ForgeOS migration-backed billing relationship test, with no live Supabase access.
let db: PGlite;
let scope: {org:string;property:string};
let ids: {site:string;customer:string;stay:string;invoice?:string};
beforeAll(async()=>{
  db=await database();
  scope=await foundation(db);
  ids=await asUser(db,identities.owner,async tx=>{
    const site=(await tx.query<{id:string}>(`
      insert into public.sites_units(organization_id,property_id,label,kind,created_by,updated_by)
      values($1,$2,'Space 88','rv',auth.uid(),auth.uid()) returning id
    `,[scope.org,scope.property])).rows[0].id;
    const customer=(await tx.query<{id:string}>(`
      insert into public.customers(organization_id,property_id,first_name,last_name,created_by,updated_by)
      values($1,$2,'Test','Resident',auth.uid(),auth.uid()) returning id
    `,[scope.org,scope.property])).rows[0].id;
    const stay=(await tx.query<{id:string}>(`
      insert into public.occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,created_by,updated_by)
      values($1,$2,$3,$4,'2026-10-01',auth.uid(),auth.uid()) returning id
    `,[scope.org,scope.property,site,customer])).rows[0].id;
    return {site,customer,stay};
  });
  // Fixture-only privileged seed: production invoice writes must use billing_command.
  const invoice=await db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[identities.owner]);
    return (await tx.query<{id:string}>(`
      insert into public.invoices(id,organization_id,property_id,customer_id,site_id,stay_id,
        number,starts_on,ends_on,due_on,created_by,updated_by)
      values(gen_random_uuid(),$1,$2,$3,$4,$5,'TEST-SPACE-88',
        '2026-10-01','2026-11-01','2026-10-05',auth.uid(),auth.uid()) returning id
    `,[scope.org,scope.property,customer,site,stay])).rows[0].id;
      });
  ids={...ids,invoice};
},30000);
afterAll(async()=>{await db?.close();});

describe('actual ForgeOS invoice to resident and site relationship',()=>{
  it('links a draft invoice to exactly its own resident, stay, and Space 88',async()=>{
    const rows=await asUser(db,identities.owner,tx=>tx.query<{
      number:string;label:string;first_name:string;status:string;
    }>(`
      select i.number,s.label,c.first_name,i.status
      from public.invoices i
      join public.sites_units s on s.id=i.site_id
      join public.customers c on c.id=i.customer_id
      join public.occupancy_stays st on st.id=i.stay_id
      where i.id=$1 and st.site_id=s.id and st.customer_id=c.id
    `,[ids.invoice]));
    expect(rows.rows).toEqual([{number:'TEST-SPACE-88',label:'Space 88',first_name:'Test',status:'draft'}]);
  });
  it('hides invoices from unrelated authenticated users using real RLS',async()=>{
    const outsider=await asUser(db,identities.other,tx=>tx.query<{id:string}>(
      'select id from public.invoices where id=$1',[ids.invoice]));
    expect(outsider.rows).toHaveLength(0);
  });
  it('rejects an invoice referencing a nonexistent resident',async()=>{
    await expect(db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[identities.owner]);
      return tx.query(`
      insert into public.invoices(id,organization_id,property_id,customer_id,site_id,stay_id,
        number,starts_on,ends_on,due_on,created_by,updated_by)
      values(gen_random_uuid(),$1,$2,gen_random_uuid(),$3,$4,'INVALID-88',
        '2026-10-01','2026-11-01','2026-10-05',auth.uid(),auth.uid())
    `,[scope.org,scope.property,ids.site,ids.stay]);
    })).rejects.toThrow();
  });
});
