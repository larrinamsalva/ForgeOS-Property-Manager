import type {WorkOrder} from './operations-domain';
import {activeMaintenanceOrder,maintenanceMatchesTriage} from './maintenance-triage';

type AttentionWork=Pick<WorkOrder,'property_id'|'site_id'|'status'|'priority'|'due_on'|'assigned_to'>;

export type SiteMaintenanceAttentionCounts={
 open:number;
 urgentHigh:number;
 urgent:number;
 overdue:number;
 dueToday:number;
 waitingParts:number;
 unassigned:number;
};

/** Count maintenance attention using exactly the same conditions as the
 * worklist triage filters. Sites use their physical IDs; today's date must
 * be calculated in the property's timezone by the caller. These are
 * snapshot counts, not writes, invoices, alerts sent to tenants, or claims
 * that a repair has been inspected. */
export function siteMaintenanceAttentionCounts(
 work:readonly AttentionWork[],
 propertyId:string,
 siteId:string,
 propertyToday:string,
):SiteMaintenanceAttentionCounts{
 const scoped=work.filter(row=>row.property_id===propertyId&&row.site_id===siteId);
 const active=scoped.filter(activeMaintenanceOrder);
 return {
  open:active.length,
  urgentHigh:active.filter(row=>row.priority==='urgent'||row.priority==='high').length,
  urgent:active.filter(row=>maintenanceMatchesTriage(row,'urgent',propertyToday)).length,
  overdue:active.filter(row=>maintenanceMatchesTriage(row,'overdue',propertyToday)).length,
  dueToday:active.filter(row=>maintenanceMatchesTriage(row,'due_today',propertyToday)).length,
  waitingParts:active.filter(row=>maintenanceMatchesTriage(row,'waiting_parts',propertyToday)).length,
  unassigned:active.filter(row=>maintenanceMatchesTriage(row,'unassigned',propertyToday)).length,
 };
}
