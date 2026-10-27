import type {MonthlyRunRow} from './monthly-billing-run';
export interface MeterAction {key:string;siteLabel:string;utility:string;kind:'capture'|'review'|'inspect';detail:string}
export function meterActions(rows:readonly MonthlyRunRow[]):MeterAction[]{
 return rows.flatMap(row=>row.checklist.filter(item=>item.state==='check'&&
 (item.label.includes('boundary readings')||item.label.includes('meter readings'))).flatMap(item=>{
 const segments=item.note.includes('reading ') ? item.note.split(';').map(part=>part.trim()).filter(Boolean) : [item.note];
 return segments.map((detail,i)=>({
 key:row.stayId+':'+item.label+':'+i,siteLabel:row.siteLabel,utility:item.label.split(' ')[0],
 kind:detail.includes('missing capture')?'capture' as const:
 detail.includes('requires accepted review')?'review' as const:'inspect' as const,detail,
 }));
 }));
}

export function filterMeterActionsByUtility(actions:readonly MeterAction[],utility:'all'|'electric'|'water'|'gas'):MeterAction[]{
 return actions.filter(action=>utility==='all'||action.utility===utility);
}

export type MeterView = 'directory'|'routes'|'review'|'history';

// Allow only known tabs when navigating from another workspace.
export function meterViewFromQuery(value:string|undefined):MeterView|undefined{
 return value==='directory'||value==='routes'||value==='review'||value==='history'?value:undefined;
}

// Link to an existing authorized workflow, not an automatic meter write or approval.
export function meterTaskDestination(
 kind:MeterAction['kind'],organizationId:string,propertyId:string,siteId?:string,
){
 if(kind==='capture'){
  return {href:'/tablet/index.html?'+new URLSearchParams({organization:organizationId}),
   label:'Open tablet reader'};
 }
 const view=kind==='review'?'review':'history';
 const params=new URLSearchParams({organization:organizationId,property:propertyId,view});
 if(siteId) params.set('site',siteId);
 return {href:'/meters?'+params,
  label:kind==='review'?'Open supervisor review':'Open reading history'};
}

// A URL alone cannot authorize access to a property or site. Limit the
// optional focused site to a site already present in the authorized snapshot.
export function meterSiteFromQuery(
 siteId:string|undefined,propertyId:string,
 sites:readonly {id:string;property_id:string}[],
):string|undefined{
 return propertyId && siteId && sites.some(site=>site.id===siteId && site.property_id===propertyId)
  ? siteId : undefined;
}

export type MeterTaskSort = 'site'|'boundary'|'utility'|'action';
export function meterTaskBoundaryDate(task:Pick<MeterAction,'detail'>):string|undefined{
 return /\b\d{4}-\d{2}-\d{2}\b/.exec(task.detail)?.[0];
}
export function sortMeterTasks(actions:readonly MeterAction[],sort:MeterTaskSort):MeterAction[]{
 const site=(a:MeterAction,b:MeterAction)=>a.siteLabel.localeCompare(b.siteLabel,undefined,{numeric:true});
 const boundary=(a:MeterAction,b:MeterAction)=>
  (meterTaskBoundaryDate(a)??'9999-12-31').localeCompare(meterTaskBoundaryDate(b)??'9999-12-31');
 return [...actions].sort((a,b)=>{
  const primary=sort==='boundary'?boundary(a,b):
   sort==='utility'?a.utility.localeCompare(b.utility):
   sort==='action'?a.kind.localeCompare(b.kind):site(a,b);
  return primary||site(a,b)||boundary(a,b)||a.utility.localeCompare(b.utility)||a.kind.localeCompare(b.kind)||a.key.localeCompare(b.key);
 });
}

export type MeterTaskDateFilter = 'all'|'before'|'today'|'after'|'undated';

// A reading boundary is not a payment deadline. Compare property-local calendar
// dates only; do not imply a past boundary is a late payment or a billing charge.
export function filterMeterTasksByDate(
 actions:readonly MeterAction[],filter:MeterTaskDateFilter,today:string,
):MeterAction[]{
 if(filter==='all') return [...actions];
 return actions.filter(task=>{
  const date=meterTaskBoundaryDate(task);
  if(filter==='undated') return !date;
  if(!date) return false;
  return filter==='before'?date<today:filter==='today'?date===today:date>today;
 });
}

export interface MeterSiteTaskOption {siteId:string;label:string;count:number}

// The billing board can contain multiple stays at the same physical site in
// one month. Group by site ID, never by resident name or a potentially reused label.
export function meterSiteTaskOptions(
 actions:readonly MeterAction[],rows:readonly Pick<MonthlyRunRow,'stayId'|'siteId'|'siteLabel'>[],
):MeterSiteTaskOption[]{
 const stayToSite=new Map(rows.map(row=>[row.stayId,{siteId:row.siteId,label:row.siteLabel}]));
 const counts=new Map<string,MeterSiteTaskOption>();
 for(const task of actions){
  const stay=stayToSite.get(task.key.split(':')[0]);
  if(!stay) continue;
  const existing=counts.get(stay.siteId);
  if(existing) existing.count++;
  else counts.set(stay.siteId,{siteId:stay.siteId,label:stay.label,count:1});
 }
 return [...counts.values()].sort((a,b)=>
  a.label.localeCompare(b.label,undefined,{numeric:true})||a.siteId.localeCompare(b.siteId));
}

export function filterMeterTasksBySite(
 actions:readonly MeterAction[],rows:readonly Pick<MonthlyRunRow,'stayId'|'siteId'>[],siteId:string,
):MeterAction[]{
 if(siteId==='all') return [...actions];
 const stayIds=new Set(rows.filter(row=>row.siteId===siteId).map(row=>row.stayId));
 return actions.filter(task=>stayIds.has(task.key.split(':')[0]));
}
