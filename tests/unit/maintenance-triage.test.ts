import {describe,it,expect} from 'vitest';
import {activeMaintenanceOrder,maintenanceMatchesTriage,filterMaintenanceWorklist,
 type MaintenanceTriage,type MaintenanceWorkFilters} from '../../src/lib/maintenance-triage';
import type {WorkOrder} from '../../src/lib/operations-domain';

function work(id:string,overrides:Record<string,unknown>={}):WorkOrder {
 return {
  id,property_id:'park-a',site_id:'space-88',number:'W-'+id,title:'Repair '+id,
  description:'General repair',category:'Plumbing',priority:'normal',status:'new',
  assigned_to:'crew-1',due_on:null,created_at:'2026-10-25T09:00:00Z',
  ...overrides,
 } as unknown as WorkOrder;
}
const orders=[
 work('urgent',{priority:'urgent',due_on:'2026-10-30'}),
 work('overdue',{priority:'normal',due_on:'2026-10-26',status:'in_progress'}),
 work('today',{priority:'high',due_on:'2026-10-27'}),
 work('parts',{priority:'normal',status:'waiting_parts',due_on:'2026-10-29'}),
 work('unassigned',{assigned_to:null,priority:'low'}),
 work('finished',{status:'completed',priority:'urgent',due_on:'2026-10-23',assigned_to:null}),
 work('closed',{status:'closed',priority:'urgent',due_on:'2026-10-22'}),
 work('cancelled',{status:'cancelled',priority:'urgent',due_on:'2026-10-21'}),
 work('other-space',{site_id:'space-99',priority:'urgent',due_on:'2026-10-25'}),
 work('other-park',{property_id:'park-b',priority:'urgent',due_on:'2026-10-25'}),
];
const filters:MaintenanceWorkFilters={
 propertyId:'park-a',siteId:'space-88',search:'',status:'all',
 mineOnly:false,userId:'crew-1',today:'2026-10-27',triage:'all',
};
const ids=(triage:MaintenanceTriage)=>filterMaintenanceWorklist(orders,{...filters,triage}).map(w=>w.id);

describe('maintenance work-order triage and exact matching exports',()=>{
 it('finds only active urgent, overdue, due today, waiting for parts and unassigned work',()=>{
  expect(ids('urgent')).toEqual(['urgent']);
  expect(ids('overdue')).toEqual(['overdue']);
  expect(ids('due_today')).toEqual(['today']);
  expect(ids('waiting_parts')).toEqual(['parts']);
  expect(ids('unassigned')).toEqual(['unassigned']);
 });
 it('does not revive completed, closed or cancelled jobs in any action queue',()=>{
  for(const item of orders.slice(5,8)) {
   expect(activeMaintenanceOrder(item)).toBe(false);
   for(const triage of ['urgent','overdue','due_today','waiting_parts','unassigned'] as const)
    expect(maintenanceMatchesTriage(item,triage,'2026-10-27')).toBe(false);
  }
 });
 it('uses property-local date to distinguish due today from overdue',()=>{
  expect(maintenanceMatchesTriage(orders[1],'overdue','2026-10-26')).toBe(false);
  expect(maintenanceMatchesTriage(orders[1],'due_today','2026-10-26')).toBe(true);
  expect(maintenanceMatchesTriage(orders[1],'overdue','2026-10-27')).toBe(true);
 });
 it('respects exact property, physical site, and assigned staff boundaries',()=>{
  expect(ids('urgent')).toEqual(['urgent']);
  expect(filterMaintenanceWorklist(orders,{...filters,triage:'urgent',mineOnly:true,userId:'crew-other'})).toEqual([]);
  expect(filterMaintenanceWorklist(orders,{...filters,triage:'urgent',mineOnly:true,userId:'crew-1'}).map(w=>w.id))
   .toEqual(['urgent']);
  expect(filterMaintenanceWorklist(orders,{...filters,siteId:'space-99',triage:'urgent'}).map(w=>w.id))
   .toEqual(['other-space']);
  expect(filterMaintenanceWorklist(orders,{...filters,propertyId:'park-b',siteId:'',triage:'urgent'}).map(w=>w.id))
   .toEqual(['other-park']);
 });
 it('composes search/status and triage, returning the same order used for on-screen rows and CSV',()=>{
  expect(filterMaintenanceWorklist(orders,{...filters,search:'Plumbing',triage:'urgent'}).map(w=>w.id)).toEqual(['urgent']);
  expect(filterMaintenanceWorklist(orders,{...filters,search:'General',triage:'waiting_parts',status:'waiting_parts'}).map(w=>w.id))
   .toEqual(['parts']);
  expect(filterMaintenanceWorklist(orders,{...filters,triage:'overdue',status:'closed'})).toEqual([]);
  expect(filterMaintenanceWorklist(orders,{...filters,triage:'all',status:'completed'}).map(w=>w.id)).toEqual(['finished']);
 });
 it('resets to all site work and sorts the urgent / overdue jobs before less urgent entries',()=>{
  const all=ids('all');
  expect(all.length).toBe(8);
  expect(all.slice(0,3)).toEqual(['urgent','overdue','today']);
  expect(all).not.toContain('other-space');
  expect(all).not.toContain('other-park');
 });
 it('does not mutate source arrays and breaks identical-date ties by ID',()=>{
  const before=orders.map(w=>w.id);
  const same=[work('b'),work('a')];
  expect(filterMaintenanceWorklist(same,{...filters,triage:'all'}).map(w=>w.id)).toEqual(['a','b']);
  expect(same.map(w=>w.id)).toEqual(['b','a']);
  ids('all');
  expect(orders.map(w=>w.id)).toEqual(before);
 });
});
