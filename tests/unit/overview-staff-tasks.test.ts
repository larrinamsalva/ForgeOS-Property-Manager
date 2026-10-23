import { describe, expect, it } from 'vitest';
import { overviewStaffTasks } from '../../src/lib/overview-staff-tasks';
import type { AccountNote } from '../../src/lib/collections-domain';
import type { Property } from '../../src/lib/domain';

const property=(id:string,name:string,timezone:string,archived_at:string|null=null)=>
  ({id,name,timezone,archived_at}) as Property;
const task=(id:string,propertyId:string,day:string,customerId='tenant'):AccountNote => ({
  id,property_id:propertyId,customer_id:customerId,kind:'note',
  body:'Manual task',invoice_id:null,follow_up_on:day,
  promised_on:null,promised_amount_cents:null,resolves_id:null,
  created_at:'2026-10-01T10:00:00Z',created_by:'office',
});
describe('authorized overview staff task highlights',()=>{
 it('evaluates due dates separately in each property timezone and sorts due before upcoming',()=>{
  // Oct 23 at 9pm in Los Angeles but Oct 24 in New York.
  const now=new Date('2026-10-24T04:00:00Z');
  const properties=[property('west','West Park','America/Los_Angeles'),
    property('east','East Park','America/New_York')];
  const result=overviewStaffTasks([
    task('west-task','west','2026-10-24'),
    task('east-task','east','2026-10-24'),
  ],properties,now);
  expect(result.map(t=>[t.noteId,t.state])).toEqual([
    ['east-task','due'],['west-task','scheduled'],
  ]);
 });
 it('omits unauthorized properties and archived ones even when financial notes contain them',()=>{
  const now=new Date('2026-10-24T04:00:00Z');
  const notes=[task('allowed','park-a','2026-10-20'),task('private','park-b','2026-10-20'),
    task('archive','park-c','2026-10-20')];
  const properties=[property('park-a','Active Park','America/Los_Angeles'),
    property('park-c','Closed Park','America/Los_Angeles','2026-10-01')];
  expect(overviewStaffTasks(notes,properties,now).map(t=>t.noteId)).toEqual(['allowed']);
 });
 it('does not display staff tasks that already have a matching explicit resolution',()=>{
  const base=task('contact','park-a','2026-10-21');
  const resolution={...base,id:'resolve',kind:'resolution' as const,resolves_id:base.id,
    follow_up_on:null,body:'Staff completed contact'};
  const rows=overviewStaffTasks([base,resolution],
    [property('park-a','Park A','America/Los_Angeles')],new Date('2026-10-24T04:00:00Z'));
  expect(rows).toEqual([]);
 });
 it('retains tasks for paid accounts until staff records a resolution',()=>{
  const notes=[task('still-due','park-a','2026-10-23')];
  const rows=overviewStaffTasks(notes,
    [property('park-a','Park A','America/Los_Angeles')],new Date('2026-10-24T04:00:00Z'));
  expect(rows).toMatchObject([{noteId:'still-due',state:'due'}]);
 });
});
