import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const fake=vi.hoisted(()=>{
 type Check={id:string;inspection_link_id:string;outcome:string;notes:string;signed_by:string;signed_at:string;organization_id:string;property_id:string};
 return {user:'00000000-0000-4000-8000-000000000001' as string|null,
  manager:true,links:[{id:'00000000-0000-4000-8000-000000000010',run_id:'00000000-0000-4000-8000-000000000020',organization_id:'00000000-0000-4000-8000-000000000030',property_id:'00000000-0000-4000-8000-000000000040'}],
  records:[] as Check[]};
});
vi.mock('@/lib/request-origin',()=>({sameOrigin:()=>true}));
vi.mock('@/lib/supabase/server',()=>({
 serverClient:async()=>({
  auth:{getUser:async()=>({data:{user:fake.user?{id:fake.user}:null}})},
  from:(table:string)=>({
   select:()=>{
    const filters:Record<string,string>={};
    const builder={
     eq:(key:string,value:string)=>{filters[key]=value;return builder;},
     then:(resolve:(value:{data:typeof fake.links;error:null})=>unknown)=>resolve({data:fake.links.filter(link=>Object.entries(filters).every(([key,value])=>link[key as keyof typeof link]===value)),error:null}),
     maybeSingle:async()=>({data:fake.links.find(link=>Object.entries(filters).every(([key,value])=>link[key as keyof typeof link]===value))??null,error:null}),
     in:(_key:string,_ids:string[])=>({
      order:async()=>({data:[...fake.records].reverse(),error:null}),
     }),
    };
    return builder;
   },
   insert:async(row:Omit<(typeof fake.records)[number],'id'|'signed_at'>)=>{
    if(!fake.manager||table!=='inspection_rechecks')return {error:{message:'Permission denied'}};
    fake.records.push({...row,id:crypto.randomUUID(),signed_at:new Date(Date.UTC(2026,9,24,0,0,fake.records.length)).toISOString()});
    return {error:null};
   },
  }),
 }),
}));
import {GET,POST} from '../../src/app/api/inspection-rechecks/route';

const org='00000000-0000-4000-8000-000000000030',property='00000000-0000-4000-8000-000000000040';
const run='00000000-0000-4000-8000-000000000020',link='00000000-0000-4000-8000-000000000010';
const url='http://localhost:3100/api/inspection-rechecks';
const get=()=>GET(new NextRequest(url+'?'+new URLSearchParams({organization:org,property,run})));
const post=(outcome:'verified'|'needs_more_work',notes:string)=>POST(new NextRequest(url,{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({organization_id:org,property_id:property,run_id:run,inspection_link_id:link,outcome,notes}),
}));
beforeEach(()=>{fake.user='00000000-0000-4000-8000-000000000001';fake.manager=true;fake.records.length=0;});
describe('supervisor reinspection API lifecycle (mocked database)',()=>{
 it('saves both decisions append-only and returns newest first with notes and identity',async()=>{
  expect((await post('needs_more_work','Repair still leaks')).status).toBe(200);
  expect((await post('verified','Rechecked dry fitting')).status).toBe(200);
  const response=await get();
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body.rechecks).toHaveLength(2);
  expect(body.rechecks.map((r:{outcome:string})=>r.outcome)).toEqual(['verified','needs_more_work']);
  expect(body.rechecks[0].notes).toBe('Rechecked dry fitting');
  expect(body.rechecks[0].signed_by).toBe(fake.user);
  expect(body.rechecks[0].signed_at).toBeTruthy();
 });
 it('rejects manager sign-off writes when access is denied by database',async()=>{
  fake.manager=false;
  expect((await post('verified','Attempt not permitted')).status).toBe(403);
  expect(fake.records).toHaveLength(0);
 });
 it('requires a signed-in user',async()=>{
  fake.user=null;
  expect((await post('verified','Inspect')).status).toBe(401);
  expect((await get()).status).toBe(401);
 });
});
