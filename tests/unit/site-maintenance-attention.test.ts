import {describe,it,expect} from 'vitest';
import {dateAtProperty} from '../../src/lib/domain';
import {siteMaintenanceAttentionCounts} from '../../src/lib/site-maintenance-attention';
import {maintenanceMatchesTriage,maintenanceTriageFromQuery} from '../../src/lib/maintenance-triage';
import {siteMaintenanceTriageLink} from '../../src/lib/site-maintenance-focus';
import type {WorkOrder} from '../../src/lib/operations-domain';

function repair(id:string,overrides:Partial<WorkOrder>={}):WorkOrder {
 return {
  id,property_id:'park-a',site_id:'space-88',status:'new',priority:'normal',
  assigned_to:'staff-1',due_on:null,...overrides,
 } as WorkOrder;
}
const work=[
 repair('urgent',{priority:'urgent'}),
 repair('high',{priority:'high',due_on:'2026-10-30'}),
 repair('overdue',{due_on:'2026-10-26'}),
 repair('today',{due_on:'2026-10-27',assigned_to:null}),
 repair('parts',{status:'waiting_parts'}),
 repair('unassigned',{assigned_to:null}),
 repair('done',{priority:'urgent',due_on:'2026-10-24',assigned_to:null,status:'completed'}),
 repair('closed',{priority:'urgent',due_on:'2026-10-23',assigned_to:null,status:'closed'}),
 repair('cancelled',{priority:'urgent',due_on:'2026-10-22',assigned_to:null,status:'cancelled'}),
 repair('neighbor',{site_id:'space-89',priority:'urgent',due_on:'2026-10-24',assigned_to:null}),
 repair('other-property',{property_id:'park-b',priority:'urgent',due_on:'2026-10-24',assigned_to:null}),
];
describe('smart site attention repair metrics',()=>{
 it('counts only the correct property and physical space',()=>{
  const counts=siteMaintenanceAttentionCounts(work,'park-a','space-88','2026-10-27');
  expect(counts).toEqual({
   open:6,urgentHigh:2,urgent:1,overdue:1,dueToday:1,waitingParts:1,unassigned:2,
  });
  expect(siteMaintenanceAttentionCounts(work,'park-a','space-89','2026-10-27')).toMatchObject({
   open:1,urgent:1,overdue:1,unassigned:1,
  });
  expect(siteMaintenanceAttentionCounts(work,'park-c','space-88','2026-10-27').open).toBe(0);
 });
 it('uses the same active-only definition as the actual maintenance triage board',()=>{
  const counts=siteMaintenanceAttentionCounts(work,'park-a','space-88','2026-10-27');
  const scoped=work.filter(w=>w.property_id==='park-a'&&w.site_id==='space-88');
  for(const [triage,key] of [
   ['urgent','urgent'],['overdue','overdue'],['due_today','dueToday'],
   ['waiting_parts','waitingParts'],['unassigned','unassigned'],
  ] as const){
   expect(counts[key]).toBe(scoped.filter(w=>maintenanceMatchesTriage(w,triage,'2026-10-27')).length);
  }
  expect(counts.urgentHigh).toBe(2);
  expect(counts.urgent).toBe(1); // High priority is not tagged urgent-only.
 });
 it('uses property-local dates across UTC and daylight-saving boundaries',()=>{
  const utcMoment=new Date('2026-11-01T06:30:00Z');
  const propertyToday=dateAtProperty('America/Los_Angeles',utcMoment);
  expect(propertyToday).toBe('2026-10-31');
  expect(dateAtProperty('UTC',utcMoment)).toBe('2026-11-01');
  const examples=[
   repair('la-today',{due_on:'2026-10-31'}),
   repair('la-tomorrow',{due_on:'2026-11-01'}),
  ];
  expect(siteMaintenanceAttentionCounts(examples,'park-a','space-88',propertyToday)).toMatchObject({
   dueToday:1,overdue:0,
  });
  expect(siteMaintenanceAttentionCounts(examples,'park-a','space-88','2026-11-01')).toMatchObject({
   dueToday:1,overdue:1,
  });
 });
 it('maps actionable card links to their matching allowlisted triage filters',()=>{
  for(const filter of ['overdue','due_today','waiting_parts','unassigned','urgent'] as const){
   const href=siteMaintenanceTriageLink('org','park-a','space-88',filter);
   const url=new URL(href,'https://forgeos.test');
   expect(url.pathname).toBe('/maintenance');
   expect(url.searchParams.get('property')).toBe('park-a');
   expect(url.searchParams.get('site')).toBe('space-88');
   expect(maintenanceTriageFromQuery(url.searchParams.get('triage')??undefined)).toBe(filter);
   for(const param of ['resident','customer','phone','stay','notes','invoice','billing'])
    expect(url.searchParams.has(param)).toBe(false);
  }
 });
 it('does not mutate the original work records while calculating counts',()=>{
  const before=work.map(w=>({id:w.id,site_id:w.site_id,status:w.status}));
  const first=siteMaintenanceAttentionCounts(work,'park-a','space-88','2026-10-27');
  const second=siteMaintenanceAttentionCounts(work,'park-a','space-88','2026-10-28');
  expect(first.overdue).toBe(1);
  expect(second.overdue).toBe(2);
  expect(work.map(w=>({id:w.id,site_id:w.site_id,status:w.status}))).toEqual(before);
 });
});
