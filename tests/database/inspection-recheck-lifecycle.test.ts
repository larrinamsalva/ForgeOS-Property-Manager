import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {database,foundation,asUser,identities} from '../support/database.mjs';
let db:PGlite;
beforeAll(async()=>{db=await database();});
afterAll(async()=>{await db?.close();});
describe('inspection supervisor approval full database lifecycle',()=>{
 it('creates work and inspection through supported commands, then preserves signed review history',async()=>{
  const {org,property}=await foundation(db);
  const scope={organization_id:org,property_id:property};
  await asUser(db,identities.owner,async tx=>{
   await tx.query('select grant_property_access($1,$2,$3,$4)',[org,property,identities.manager,'manager']);
   await tx.query('select grant_property_access($1,$2,$3,$4)',[org,property,identities.technician,'maintenance']);
  });
  const command=async(name:string,extra:Record<string,unknown>)=>asUser(db,identities.owner,async tx=>
   (await tx.query<{result:{id:string}}>('select operations_command($1,$2::jsonb) result',[
    name,JSON.stringify({...scope,request_id:randomUUID(),reason:'Fictional repair review test',...extra})
   ])).rows[0].result.id);
  const today=(await db.query<{d:string}>('select current_date::text as d')).rows[0].d;
  const work=await command('new_work',{
   title:'Replace fictional valve',description:'Fictional repair for supervisor testing',
   category:'Plumbing',priority:'normal',site_id:null,customer_id:null,
   requested_on:today,due_on:today,assigned_to:null,parts_required:'',
  });
  const v=(await db.query<{version:number}>('select version from public.work_orders where id=$1',[work])).rows[0].version;
  await command('work_status',{work_order_id:work,version:v,status:'completed'});
  const plan=await command('save_plan',{
   id:null,version:null,kind:'checklist',label:'Fictional fitting inspection',
   description:'Test only',category:'Safety',site_id:null,assigned_to:identities.owner,
   anchor_on:today,interval_days:1,ends_on:null,items:['Inspect fictional valve'],active:true,
  });
  const run=await command('generate_occurrence',{plan_id:plan,scheduled_for:today});
  const link=await asUser(db,identities.owner,async tx=>(await tx.query<{id:string}>(`
   insert into public.inspection_work_links(organization_id,property_id,run_id,item_key,work_order_id,created_by)
   values($1,$2,$3,'item-1',$4,$5) returning id`,[org,property,run,work,identities.owner])).rows[0].id);
  const sign=(id:string,outcome:string,notes:string)=>asUser(db,id,tx=>tx.query(
   `insert into public.inspection_rechecks(organization_id,property_id,inspection_link_id,outcome,notes,signed_by)
   values($1,$2,$3,$4,$5,$6) returning id`,[org,property,link,outcome,notes,id]));
  await expect(sign(identities.technician,'verified','Forbidden maintenance signoff')).rejects.toThrow();
  await expect(sign(identities.other,'verified','Forbidden cross-property signoff')).rejects.toThrow();
  await sign(identities.manager,'needs_more_work','Valve still leaks after repair');
  await sign(identities.manager,'verified','Verified repair after additional work');
  const reviews=await asUser(db,identities.manager,tx=>tx.query<{outcome:string;notes:string;signed_by:string}>(
   'select outcome,notes,signed_by from public.inspection_rechecks where inspection_link_id=$1 order by signed_at desc,id desc',[link]));
  expect(reviews.rows).toHaveLength(2);
  expect(reviews.rows.map(r=>r.outcome).sort()).toEqual(['needs_more_work','verified']);
  expect(reviews.rows.every(r=>r.signed_by===identities.manager)).toBe(true);
  const outside=await asUser(db,identities.other,tx=>tx.query(
   'select id from public.inspection_rechecks where inspection_link_id=$1',[link]));
  expect(outside.rows).toHaveLength(0);
 });
});
