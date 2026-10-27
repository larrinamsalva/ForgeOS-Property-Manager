import type {WorkOrder} from './operations-domain';

export type MaintenanceTriage = 'all'|'urgent'|'overdue'|'due_today'|'waiting_parts'|'unassigned';
export type MaintenanceWorkFilters = {
 propertyId:string;
 siteId?:string;
 search:string;
 status:string;
 mineOnly:boolean;
 userId:string;
 today:string;
 triage:MaintenanceTriage;
};

/** Completed, closed and cancelled jobs must not appear in an action queue. */
export function activeMaintenanceOrder(work:Pick<WorkOrder,'status'>):boolean{
 return !['completed','closed','cancelled'].includes(work.status);
}

/** "Overdue" and "due today" use the property's YYYY-MM-DD calendar day. */
export function maintenanceMatchesTriage(
 work:Pick<WorkOrder,'status'|'priority'|'due_on'|'assigned_to'>,
 triage:MaintenanceTriage,
 today:string,
):boolean{
 if(triage==='all')return true;
 if(!activeMaintenanceOrder(work))return false;
 switch(triage){
  case 'urgent': return work.priority==='urgent';
  case 'overdue': return !!work.due_on && work.due_on<today;
  case 'due_today': return work.due_on===today;
  case 'waiting_parts': return work.status==='waiting_parts';
  case 'unassigned': return !work.assigned_to;
 }
}

/** The exact same read-only selection powers the table and download.
 * Authorization is still enforced by the existing operations API. */
export function filterMaintenanceWorklist(
 orders:readonly WorkOrder[],
 filters:MaintenanceWorkFilters,
):WorkOrder[]{
 const {propertyId,siteId,search,status,mineOnly,userId,today,triage}=filters;
 const query=search.toLocaleLowerCase().trim();
 const urgency=(work:WorkOrder)=>{
  if(!activeMaintenanceOrder(work))return 5;
  if(work.priority==='urgent')return 0;
  if(work.due_on && work.due_on<today)return 1;
  if(work.priority==='high')return 2;
  if(work.priority==='normal')return 3;
  return 4;
 };
 return orders.filter(work=>
   work.property_id===propertyId &&
   (!siteId||work.site_id===siteId) &&
   (!mineOnly||work.assigned_to===userId) &&
   (status==='all'||work.status===status) &&
   (!query||`${work.number} ${work.title} ${work.category} ${work.description}`.toLocaleLowerCase().includes(query)) &&
   maintenanceMatchesTriage(work,triage,today)
 ).sort((a,b)=>
   urgency(a)-urgency(b) ||
   (a.due_on??'9999').localeCompare(b.due_on??'9999') ||
   b.created_at.localeCompare(a.created_at) ||
   a.id.localeCompare(b.id)
 );
}
