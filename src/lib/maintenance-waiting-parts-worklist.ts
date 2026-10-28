import type {WorkOrder} from './operations-domain';
import type {WaitingPartsHandoffRow} from './waiting-parts-handoff';
import {filterWaitingPartsRows,type WaitingPartsViewFilter} from './waiting-parts-handoff-review';

/**
 * The maintenance board already applies its actual property/site, status,
 * employee, query and triage filters. Intersect that visible set with the
 * verified handoff queue, retaining blocker priority and exact property IDs.
 * Does not make purchase requests, receive orders or change repair status.
 */
export function maintenanceWaitingPartsWorklist(
 work:readonly WorkOrder[],
 handoff:readonly WaitingPartsHandoffRow[],
 filter:WaitingPartsViewFilter,
):WorkOrder[]{
 const byKey=new Map(
  work.filter(row=>row.status==='waiting_parts')
   .map(row=>[`${row.property_id}\u0000${row.id}`,row]),
 );
 return filterWaitingPartsRows(handoff,filter,'','')
  .flatMap(row=>{
   const matched=byKey.get(`${row.work.property_id}\u0000${row.work.id}`);
   return matched?[matched]:[];
  });
}
