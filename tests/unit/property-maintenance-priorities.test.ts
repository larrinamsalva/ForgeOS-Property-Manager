import {describe,it,expect} from 'vitest';
import {propertyMaintenancePriorities,propertyMaintenanceTriageLink} from '../../src/lib/property-maintenance-priorities';
import {maintenanceTriageFromQuery,filterMaintenanceWorklist} from '../../src/lib/maintenance-triage';
import type {WorkOrder} from '../../src/lib/operations-domain';

function repair(id:string,property_id:string,extra:Record<string,unknown>={}):WorkOrder{
 return {
  id,property_id,site_id:'site-1',number:id,title:'Job '+id,category:'Plumbing',
  description:'Repair',priority:'normal',status:'new',due_on:null,
  assigned_to:'staff-1',created_at:'2026-10-31T06:00:00Z',
  ...extra,
 } as unknown as WorkOrder;
}
const jobs=[
 repair('pacific-urgent','pacific',{priority:'urgent',due_on:'2026-11-02'}),
 repair('pacific-overdue','pacific',{due_on:'2026-10-30'}),
 repair('pacific-today','pacific',{due_on:'2026-10-31'}),
 repair('pacific-unassigned','pacific',{assigned_to:null}),
 repair('pacific-parts','pacific',{status:'waiting_parts'}),
 repair('pacific-closed','pacific',{status:'closed',priority:'urgent',due_on:'2026-10-20',assigned_to:null}),
 repair('east-overdue','east',{due_on:'2026-10-31'}),
 repair('east-today','east',{due_on:'2026-11-01'}),
 repair('east-unassigned','east',{assigned_to:null}),
 repair('east-finished','east',{status:'completed',priority:'urgent',due_on:'2026-10-21'}),
 repair('third-park','unrelated',{priority:'urgent',due_on:'2026-10-20'}),
];
const properties=[{id:'pacific',timezone:'America/Los_Angeles'},{id:'east',timezone:'America/New_York'}];
const moment=new Date('2026-11-01T06:30:00Z');

describe('overview property-level maintenance priority handoff',()=>{
 it('shows only explicitly authorized properties and leaves other park data out',()=>{
  const rows=propertyMaintenancePriorities(jobs,[properties[0]],moment);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
   propertyId:'pacific',propertyToday:'2026-10-31',open:5,
   overdue:1,dueToday:1,urgent:1,unassigned:1,waitingParts:1,
  });
  expect(propertyMaintenancePriorities(jobs,[],moment)).toEqual([]);
 });
 it('calculates a separate local calendar date per property, including DST transitions',()=>{
  const rows=propertyMaintenancePriorities(jobs,properties,moment);
  expect(rows.map(r=>r.propertyId)).toEqual(['pacific','east']);
  expect(rows.find(r=>r.propertyId==='east')).toMatchObject({
   propertyToday:'2026-11-01',open:3,overdue:1,dueToday:1,urgent:0,unassigned:1,
  });
  expect(rows.find(r=>r.propertyId==='pacific')?.propertyToday).toBe('2026-10-31');
 });
 it('sorts the most overdue and urgent backlogs first regardless of input order',()=>{
  const more=[...jobs,repair('east-overdue-second','east',{due_on:'2026-10-25'})];
  expect(propertyMaintenancePriorities(more,properties,moment).map(r=>r.propertyId))
   .toEqual(['east','pacific']);
 });
 it('counts the same overdue and unassigned records as the property-wide worklist',()=>{
  const rows=propertyMaintenancePriorities(jobs,properties,moment);
  for(const row of rows){
   for(const triage of ['overdue','unassigned','urgent','due_today','waiting_parts'] as const){
    const selected=filterMaintenanceWorklist(jobs,{
     propertyId:row.propertyId,search:'',status:'all',mineOnly:false,
     userId:'manager',today:row.propertyToday,triage,
    });
    expect(row[triage==='due_today'?'dueToday':triage==='waiting_parts'?'waitingParts':triage].valueOf())
     .toBe(selected.length);
   }
  }
 });
 it('creates a distinct property-wide deep link per attention queue with no site/customer parameters',()=>{
  const url=new URL(propertyMaintenanceTriageLink('org&x=1','property?role=admin','overdue'),'https://example.test');
  expect(url.pathname).toBe('/maintenance');
  expect(url.searchParams.get('organization')).toBe('org&x=1');
  expect(url.searchParams.get('property')).toBe('property?role=admin');
  expect(url.searchParams.get('triage')).toBe('overdue');
  expect(maintenanceTriageFromQuery(url.searchParams.get('triage')??undefined)).toBe('overdue');
  expect(url.searchParams.getAll('triage')).toEqual(['overdue']);
  for(const key of ['site','work','create','tenant','resident','customer','phone','payment','invoice','notes'])
   expect(url.searchParams.has(key)).toBe(false);
  expect(propertyMaintenanceTriageLink('org','park','urgent'))
   .not.toBe(propertyMaintenanceTriageLink('org','park','overdue'));
 });
 it('never mutates the authorized list or maintenance records when counting priorities',()=>{
  const before=jobs.map(j=>j.id);
  const authorized=[...properties];
  propertyMaintenancePriorities(jobs,authorized,moment);
  expect(authorized).toEqual(properties);
  expect(jobs.map(j=>j.id)).toEqual(before);
 });
});
