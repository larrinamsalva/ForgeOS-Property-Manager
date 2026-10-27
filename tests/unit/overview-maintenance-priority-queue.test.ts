import {describe,it,expect} from 'vitest';
import {overviewMaintenancePriorityQueue} from '../../src/lib/overview-maintenance-priority-queue';
import {siteMaintenanceWorkLink} from '../../src/lib/site-maintenance-focus';
import {propertyMaintenanceTriageLink} from '../../src/lib/property-maintenance-priorities';
import type {WorkOrder} from '../../src/lib/operations-domain';

const moment=new Date('2026-11-01T06:30:00Z');
const authorized=[
 {id:'west',timezone:'America/Los_Angeles'},
 {id:'east',timezone:'America/New_York'},
];
function work(id:string,property_id='west',extra:Record<string,unknown>={}):WorkOrder{
 return {id,property_id,site_id:'space-88',number:'W-'+id,
  title:'Service '+id,category:'Plumbing',description:'Replace valve',
  status:'new',priority:'normal',due_on:null,assigned_to:'crew',
  created_at:'2026-10-30T12:00:00Z',...extra} as unknown as WorkOrder;
}
const jobs=[
 work('urgent-late','west',{priority:'urgent',due_on:'2026-10-28'}),
 work('urgent-no-date','west',{priority:'urgent',due_on:null}),
 work('late-west','west',{due_on:'2026-10-30'}),
 work('late-east','east',{due_on:'2026-10-31',site_id:null}),
 work('today-west','west',{due_on:'2026-10-31'}),
 work('today-east','east',{due_on:'2026-11-01'}),
 work('tomorrow','west',{due_on:'2026-11-01'}),
 work('closed-urgent','west',{priority:'urgent',due_on:'2026-10-21',status:'closed'}),
 work('completed-late','east',{due_on:'2026-10-20',status:'completed'}),
 work('cancelled-urgent','west',{priority:'urgent',status:'cancelled'}),
 work('unauthorized','other',{priority:'urgent',due_on:'2026-10-01'}),
];
describe('Overview maintenance repair priority queue',()=>{
 it('shows actual urgent, overdue and due-today repairs, ordered by attention severity',()=>{
  const queue=overviewMaintenancePriorityQueue(jobs,authorized,moment);
  expect(queue.total).toBe(6);
  expect(queue.rows.map(r=>r.work.id)).toEqual([
   'urgent-late','urgent-no-date','late-west','late-east','today-west','today-east',
  ]);
  expect(queue.rows.map(r=>r.reason)).toEqual([
   'Urgent + overdue','Urgent','Overdue','Overdue','Due today','Due today',
  ]);
  expect(new Set(queue.rows.map(r=>r.work.id)).size).toBe(queue.rows.length);
 });
 it('uses independent property-local dates around the daylight saving change',()=>{
  const queue=overviewMaintenancePriorityQueue(jobs,authorized,moment);
  const west=queue.rows.find(r=>r.work.id==='today-west')!;
  const east=queue.rows.find(r=>r.work.id==='today-east')!;
  expect(west.propertyToday).toBe('2026-10-31');
  expect(east.propertyToday).toBe('2026-11-01');
  expect(queue.rows.find(r=>r.work.id==='urgent-late')?.daysOverdue).toBe(3);
  expect(queue.rows.find(r=>r.work.id==='late-west')?.daysOverdue).toBe(1);
  expect(queue.rows.find(r=>r.work.id==='late-east')?.daysOverdue).toBe(1);
  expect(west.daysOverdue).toBe(0);
 });
 it('includes no finished, cancelled, future low priority or other-property records',()=>{
  const queue=overviewMaintenancePriorityQueue(jobs,authorized,moment);
  for(const id of ['closed-urgent','completed-late','cancelled-urgent','tomorrow','unauthorized'])
   expect(queue.rows.map(row=>row.work.id)).not.toContain(id);
  expect(overviewMaintenancePriorityQueue(jobs,[authorized[0]],moment).rows.some(r=>r.work.property_id==='east')).toBe(false);
  expect(overviewMaintenancePriorityQueue(jobs,[],moment)).toEqual({total:0,rows:[]});
 });
 it('caps visible results but keeps the full count for handoff clarity',()=>{
  const queue=overviewMaintenancePriorityQueue(jobs,authorized,moment,2);
  expect(queue.total).toBe(6);
  expect(queue.rows.map(r=>r.work.id)).toEqual(['urgent-late','urgent-no-date']);
  expect(overviewMaintenancePriorityQueue(jobs,authorized,moment,0).rows).toEqual([]);
 });
 it('uses a direct details link only for a site-linked work order and a property queue for common-area work',()=>{
  const exact=new URL(siteMaintenanceWorkLink('org','west','space-88','urgent-late'),'https://example.test');
  expect(exact.pathname).toBe('/maintenance');
  expect(exact.searchParams.get('property')).toBe('west');
  expect(exact.searchParams.get('site')).toBe('space-88');
  expect(exact.searchParams.get('work')).toBe('urgent-late');
  const common=new URL(propertyMaintenanceTriageLink('org','east','overdue'),'https://example.test');
  expect(common.searchParams.get('property')).toBe('east');
  expect(common.searchParams.get('triage')).toBe('overdue');
  for(const k of ['site','work','resident','customer','phone','invoice','payment','notes'])
   expect(common.searchParams.has(k)).toBe(false);
 });
 it('never mutates input work orders or property lists',()=>{
  const ids=jobs.map(w=>w.id);
  const props=authorized.map(p=>({...p}));
  overviewMaintenancePriorityQueue(jobs,authorized,moment);
  expect(jobs.map(w=>w.id)).toEqual(ids);
  expect(authorized).toEqual(props);
 });
});
