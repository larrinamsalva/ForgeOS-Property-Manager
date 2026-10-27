import {dateAtProperty} from './domain';
import type {WorkOrder} from './operations-domain';
import {activeMaintenanceOrder, maintenanceMatchesTriage} from './maintenance-triage';

type PropertyClock={id:string;timezone:string};
export type MaintenancePriorityQueueRow={
 work:WorkOrder;
 propertyToday:string;
 reason:'Urgent + overdue'|'Urgent'|'Overdue'|'Due today';
 daysOverdue:number;
};
export type MaintenancePriorityQueue={
 total:number;
 rows:MaintenancePriorityQueueRow[];
};

/** Calendar-day difference (not hours) so DST never changes an overdue day. */
function calendarDaysLate(today:string,dueOn:string):number{
 const toDay=(date:string)=>Date.parse(date+'T00:00:00Z');
 return Math.max(0,Math.round((toDay(today)-toDay(dueOn))/86400000));
}

/**
 * A small read-only morning queue of active urgent, overdue or due-today
 * repairs. The provided property list must already be authorization-filtered;
 * never infer authority from a site's visible label or an occupant.
 * Multiple signals on one work order produce one queue row.
 */
export function overviewMaintenancePriorityQueue(
 work:readonly WorkOrder[],
 properties:readonly PropertyClock[],
 now=new Date(),
 limit=10,
):MaintenancePriorityQueue{
 const localToday=new Map(properties.map(property=>[
  property.id,dateAtProperty(property.timezone,now),
 ]));
 const candidates=work.flatMap(item=>{
  const today=localToday.get(item.property_id);
  if(!today||!activeMaintenanceOrder(item))return [];
  const urgent=maintenanceMatchesTriage(item,'urgent',today);
  const overdue=maintenanceMatchesTriage(item,'overdue',today);
  const dueToday=maintenanceMatchesTriage(item,'due_today',today);
  if(!urgent&&!overdue&&!dueToday)return [];
  const reason:MaintenancePriorityQueueRow['reason']=
   urgent&&overdue?'Urgent + overdue':
   urgent?'Urgent':overdue?'Overdue':'Due today';
  return [{work:item,propertyToday:today,reason,
   daysOverdue:overdue&&item.due_on?calendarDaysLate(today,item.due_on):0}];
 });
 const rank=(row:MaintenancePriorityQueueRow)=>
  ({'Urgent + overdue':0,'Urgent':1,'Overdue':2,'Due today':3})[row.reason];
 candidates.sort((a,b)=>
  rank(a)-rank(b) ||
  b.daysOverdue-a.daysOverdue ||
  (a.work.due_on??'9999').localeCompare(b.work.due_on??'9999') ||
  b.work.created_at.localeCompare(a.work.created_at) ||
  a.work.property_id.localeCompare(b.work.property_id) ||
  a.work.id.localeCompare(b.work.id)
 );
 return {total:candidates.length,rows:candidates.slice(0,Math.max(0,Math.floor(limit)))};
}
