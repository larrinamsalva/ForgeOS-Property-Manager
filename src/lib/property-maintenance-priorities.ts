import {dateAtProperty} from './domain';
import type {WorkOrder} from './operations-domain';
import {activeMaintenanceOrder,maintenanceMatchesTriage,type MaintenanceTriage} from './maintenance-triage';

type PropertyClock={id:string;timezone:string};
type WorkScope=Pick<WorkOrder,'property_id'|'status'|'priority'|'due_on'|'assigned_to'>;
export type PropertyMaintenancePriority={
 propertyId:string;
 propertyToday:string;
 open:number;
 urgent:number;
 overdue:number;
 dueToday:number;
 unassigned:number;
 waitingParts:number;
};

/**
 * A read-only morning handoff for the properties the caller is authorized
 * to view. Counts share the maintenance worklist triage predicate, including
 * completed/closed/cancelled exclusions. Each property's clock is independent.
 */
export function propertyMaintenancePriorities(
 work:readonly WorkScope[],
 authorizedProperties:readonly PropertyClock[],
 now=new Date(),
):PropertyMaintenancePriority[]{
 return authorizedProperties.map(property=>{
  const scoped=work.filter(row=>row.property_id===property.id);
  const active=scoped.filter(activeMaintenanceOrder);
  const propertyToday=dateAtProperty(property.timezone,now);
  const count=(triage:MaintenanceTriage)=>
   active.filter(row=>maintenanceMatchesTriage(row,triage,propertyToday)).length;
  return {
   propertyId:property.id,propertyToday,
   open:active.length,
   urgent:count('urgent'),
   overdue:count('overdue'),
   dueToday:count('due_today'),
   unassigned:count('unassigned'),
   waitingParts:count('waiting_parts'),
  };
 }).sort((a,b)=>
   b.overdue-a.overdue || b.urgent-a.urgent ||
   b.dueToday-a.dueToday || b.unassigned-a.unassigned ||
   a.propertyId.localeCompare(b.propertyId)
 );
}

/** A property-wide triage URL never includes resident or account details.
 * The authenticated Maintenance route validates the property and filter. */
export function propertyMaintenanceTriageLink(
 organizationId:string,propertyId:string,triage:MaintenanceTriage,
):string{
 return '/maintenance?'+new URLSearchParams({
  organization:organizationId,property:propertyId,triage,
 });
}
