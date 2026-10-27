import {describe,it,expect} from 'vitest';
import {siteMaintenanceTriageLink,siteMaintenanceLink} from '../../src/lib/site-maintenance-focus';
import {maintenanceTriageFromQuery,filterMaintenanceWorklist} from '../../src/lib/maintenance-triage';
import {meterSiteFromQuery} from '../../src/lib/meter-actions';
import type {WorkOrder} from '../../src/lib/operations-domain';

const parse=(href:string)=>new URL(href,'https://forgeos.example');

function job(id:string,overrides:Partial<WorkOrder>={}):WorkOrder{
 return {id,property_id:'park-A',site_id:'space-88',title:'Plumbing',number:'W-1',
  description:'Replace pipe',category:'Plumbing',priority:'normal',status:'new',
  due_on:null,assigned_to:'crew-1',created_at:'2026-10-27T00:00:00Z',
  ...overrides} as WorkOrder;
}

describe('site maintenance priority shortcuts',()=>{
 it('opens an exact authorized physical site and one selected urgent/overdue filter',()=>{
  for(const attention of ['urgent','overdue'] as const){
   const url=parse(siteMaintenanceTriageLink('org-1','park-A','space-88',attention));
   expect(url.pathname).toBe('/maintenance');
   expect(url.searchParams.get('organization')).toBe('org-1');
   expect(url.searchParams.get('property')).toBe('park-A');
   expect(url.searchParams.get('site')).toBe('space-88');
   expect(maintenanceTriageFromQuery(url.searchParams.get('triage')??undefined)).toBe(attention);
   expect(url.searchParams.getAll('triage')).toEqual([attention]);
   expect(url.searchParams.has('create')).toBe(false);
   expect(url.searchParams.has('work')).toBe(false);
  }
  expect(parse(siteMaintenanceLink('org-1','park-A','space-88')).searchParams.has('triage')).toBe(false);
 });
 it('rejects unknown, misspelled or potentially malicious query filter values',()=>{
  for(const invalid of ['', 'high', 'Urgent','late','urgent&site=space-99','overdue%26work=other']){
   expect(maintenanceTriageFromQuery(invalid)).toBeUndefined();
  }
  expect(maintenanceTriageFromQuery(undefined)).toBeUndefined();
  expect(maintenanceTriageFromQuery('all')).toBe('all');
  expect(maintenanceTriageFromQuery('waiting_parts')).toBe('waiting_parts');
 });
 it('encodes query fields without allowing a site ID to overwrite triage or route',()=>{
  const url=parse(siteMaintenanceTriageLink('org&work=wrong','park?property=else','space-88&triage=all','overdue'));
  expect(url.searchParams.get('organization')).toBe('org&work=wrong');
  expect(url.searchParams.get('property')).toBe('park?property=else');
  expect(url.searchParams.get('site')).toBe('space-88&triage=all');
  expect(url.searchParams.getAll('triage')).toEqual(['overdue']);
  for(const key of ['customer','resident','stay','phone','invoice','payment','amount','notes','staff'])
   expect(url.searchParams.has(key)).toBe(false);
 });
 it('rejects a cross-property site before any site triage filter can be applied',()=>{
  const url=parse(siteMaintenanceTriageLink('org','park-A','space-99','urgent'));
  const sites=[{id:'space-88',property_id:'park-A'},{id:'space-99',property_id:'park-B'}];
  const validated=meterSiteFromQuery(url.searchParams.get('site')??undefined,'park-A',sites);
  expect(validated).toBeUndefined();
  expect(meterSiteFromQuery('space-88','park-A',sites)).toBe('space-88');
 });
 it('preserves the right urgent and overdue jobs and excludes closed ones using property calendar dates',()=>{
  const jobs=[
   job('urgent',{priority:'urgent',due_on:'2026-10-30'}),
   job('high',{priority:'high',due_on:'2026-10-30'}),
   job('overdue',{due_on:'2026-10-26'}),
   job('today',{due_on:'2026-10-27'}),
   job('closed',{status:'closed',priority:'urgent',due_on:'2026-10-20'}),
   job('other-site',{site_id:'space-99',priority:'urgent',due_on:'2026-10-25'}),
   job('other-park',{property_id:'park-B',priority:'urgent',due_on:'2026-10-25'}),
  ];
  const filter=(triage:'urgent'|'overdue',today='2026-10-27')=>filterMaintenanceWorklist(jobs,{
   propertyId:'park-A',siteId:'space-88',status:'all',search:'',mineOnly:false,
   userId:'manager',today,triage,
  }).map(x=>x.id);
  expect(filter('urgent')).toEqual(['urgent']);
  expect(filter('overdue')).toEqual(['overdue']);
  expect(filter('overdue','2026-10-26')).toEqual([]);
  expect(filter('overdue','2026-10-28')).toEqual(['overdue','today']);
  expect(jobs).toHaveLength(7);
 });
});
