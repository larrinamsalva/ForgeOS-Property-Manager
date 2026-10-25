import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,foundation,asUser,identities} from '../support/database.mjs';

let db:PGlite;
let org:string,property:string,link:string;
beforeAll(async()=>{
 db=await database();
 const seed=await foundation(db);org=seed.org;property=seed.property;
 await asUser(db,identities.owner,async tx=>{
  await tx.query('select grant_property_access($1,$2,$3,$4)',[org,property,identities.manager,'manager']);
  await tx.query('select grant_property_access($1,$2,$3,$4)',[org,property,identities.technician,'maintenance']);
 });
 // Fictional records are inserted by the isolated in-memory database fixture,
 // not into the live Supabase project.
 // Fixture setup uses the isolated database administrator. The tests below
 // separately exercise real authenticated RLS for manager, staff and outsiders.
 const work=(await db.query<{id:string}>(`insert into public.work_orders
 (organization_id,property_id,number,title,description,category,priority,requested_on,status,parts_required)
 values($1,$2,'WO-RECHECK','Recheck fitting','Fictional completed fitting repair','plumbing','normal',current_date,'completed','')
 returning id`,[org,property])).rows[0].id;
 const plan=(await db.query<{id:string}>(`insert into public.operations_plans
 (organization_id,property_id,kind,label,description,category,assigned_to,anchor_on,interval_days,items,active)
 values($1,$2,'checklist','Fictional safety round','Reinspection checks','inspection',$3,current_date,1,'[{"key":"item-1","label":"Inspect fitting"}]'::jsonb,true)
 returning id`,[org,property,identities.owner])).rows[0].id;
 const run=(await db.query<{id:string}>(`insert into public.checklist_runs
 (organization_id,property_id,plan_id,label,scheduled_for,assigned_to,items)
 values($1,$2,$3,'Fictional follow-up',current_date,$4,'[{"key":"item-1","label":"Inspect fitting"}]'::jsonb)
 returning id`,[org,property,plan,identities.owner])).rows[0].id;
 link=(await db.query<{id:string}>(`insert into public.inspection_work_links
 (organization_id,property_id,run_id,item_key,work_order_id,created_by)
 values($1,$2,$3,'item-1',$4,$5) returning id`,[org,property,run,work,identities.owner])).rows[0].id;
});
afterAll(async()=>{await db?.close();});
const insert=(who:string,outcome:string,notes:string)=>asUser(db,who,tx=>tx.query(
 'insert into public.inspection_rechecks(organization_id,property_id,inspection_link_id,outcome,notes,signed_by) values($1,$2,$3,$4,$5,$6) returning id',
 [org,property,link,outcome,notes,who]));
describe('real migration permissions in isolated PostgreSQL',()=>{
 it('manager signs twice; earlier history survives and later decision is newest',async()=>{
  await insert(identities.manager,'needs_more_work','Fitting remains loose');
  await insert(identities.manager,'verified','Fitting retested securely');
  const result=await asUser(db,identities.manager,tx=>tx.query<{outcome:string;notes:string;signed_by:string}>(
   'select outcome,notes,signed_by from public.inspection_rechecks where inspection_link_id=$1 order by signed_at desc,id desc',[link]));
  expect(result.rows).toHaveLength(2);
  expect(result.rows.map(r=>r.outcome).sort()).toEqual(['needs_more_work','verified']);
  expect(result.rows.every(r=>r.signed_by===identities.manager)).toBe(true);
 });
 it('maintenance staff cannot sign off a real completed linked work order',async()=>{
  await expect(insert(identities.technician,'verified','Not authorized')).rejects.toThrow();
 });
 it('unrelated user cannot sign off or read another property review',async()=>{
  await expect(insert(identities.other,'verified','Cross tenant')).rejects.toThrow();
  const rows=await asUser(db,identities.other,tx=>tx.query('select id from public.inspection_rechecks where inspection_link_id=$1',[link]));
  expect(rows.rows).toHaveLength(0);
 });
});
