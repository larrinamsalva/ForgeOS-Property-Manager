import { describe, expect, it } from 'vitest';
import { staffFollowupTasks } from '../../src/lib/staff-followup-worklist';
import type { AccountNote } from '../../src/lib/collections-domain';

const create=(id:string,other:Partial<AccountNote>={}):AccountNote=>({
 id,property_id:'park-a',customer_id:'resident-a',created_at:'2026-10-01T08:00:00Z',
 created_by:'staff-a',invoice_id:null,kind:'note',body:'Follow up with resident',
 follow_up_on:null,promised_on:null,promised_amount_cents:null,resolves_id:null,
 ...other,
});
describe('office manual follow-up worklist',()=>{
 it('sorts due before scheduled and oldest dates first, from both arrangements and contact notes',()=>{
  const rows=[
   create('future',{follow_up_on:'2026-11-01'}),
   create('today',{follow_up_on:'2026-10-23'}),
   create('older',{follow_up_on:'2026-10-20'}),
   create('promise',{kind:'arrangement',promised_on:'2026-10-21'}),
   create('both',{follow_up_on:'2026-10-30',promised_on:'2026-10-22'}),
  ];
  const tasks=staffFollowupTasks(rows,'park-a','2026-10-23');
  expect(tasks.map(t=>[t.note.id,t.dueOn,t.state])).toEqual([
    ['older','2026-10-20','due'],['promise','2026-10-21','due'],
    ['both','2026-10-22','due'],['today','2026-10-23','due'],
    ['future','2026-11-01','scheduled'],
  ]);
 });
 it('requires an explicit resolution that matches the same resident and property',()=>{
  const task=create('contact',{follow_up_on:'2026-10-21'});
  const paidInvoiceDoesNotCount=create('payment',{body:'Account has been paid'});
  const invalid=create('wrong',{kind:'resolution',resolves_id:'contact',customer_id:'resident-b'});
  const valid=create('resolved',{kind:'resolution',resolves_id:'contact',body:'Completed manual staff follow-up'});
  expect(staffFollowupTasks([task,paidInvoiceDoesNotCount,invalid],'park-a','2026-10-23')
    .map(item=>item.note.id)).toEqual(['contact']);
  expect(staffFollowupTasks([task,valid],'park-a','2026-10-23')).toEqual([]);
 });
 it('enforces property isolation and ignores unplanned and resolved-only notes',()=>{
  const foreign=create('foreign',{property_id:'park-b',follow_up_on:'2026-10-21'});
  const unplanned=create('none');
  const resolution=create('resolved',{kind:'resolution',follow_up_on:'2026-10-21'});
  const task=create('task',{follow_up_on:'2026-11-03'});
  expect(staffFollowupTasks([foreign,unplanned,resolution,task],'park-a','2026-10-23')
    .map(item=>item.note.id)).toEqual(['task']);
 });
 it('does not let another property resolution complete a local work item',()=>{
  const task=create('task',{follow_up_on:'2026-10-20'});
  const wrongPlace=create('resolved',{kind:'resolution',property_id:'park-b',resolves_id:'task'});
  expect(staffFollowupTasks([task,wrongPlace],'park-a','2026-10-23')
    .map(item=>item.note.id)).toEqual(['task']);
 });
});
