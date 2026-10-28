import {dateAtProperty} from './domain';
import type {WorkOrder,PurchaseRequest,InventoryItem,OperationsSnapshot} from './operations-domain';
import {linkedWorkPartReview} from './work-parts-request-review';
import {incomingDeliveryLines,type IncomingDeliveryLine} from './incoming-deliveries';

type AuthorizedProperty={id:string;timezone:string};
type StockRow=OperationsSnapshot['summary']['stock'][number];
type ReceivedRow=OperationsSnapshot['summary']['purchase_lines'][number];

export type WaitingPartsReason=
 |'late_linked_delivery'|'no_structured_request'|'open_request'
 |'missing_eta'|'purchasing_review'|'awaiting_linked_delivery'
 |'verify_parts'|'no_active_request';
export type WaitingPartsHandoffRow={
 work:WorkOrder;
 propertyToday:string;
 reason:WaitingPartsReason;
 linkedRequestCount:number;
 openRequestCount:number;
 outstandingPlacedOrderCount:number;
 lateOrderCount:number;
 noEtaOrderCount:number;
 hasRecordedOnHand:boolean;
};
export type WaitingPartsHandoff={total:number;rows:WaitingPartsHandoffRow[]};
const ranks:Record<WaitingPartsReason,number>={
 late_linked_delivery:0,
 no_structured_request:1,
 open_request:2,
 missing_eta:3,
 purchasing_review:4,
 awaiting_linked_delivery:5,
 no_active_request:6,
 verify_parts:7,
};
export const waitingPartsReasonLabels:Record<WaitingPartsReason,string>={
 late_linked_delivery:'Linked delivery past expected date',
 no_structured_request:'No structured parts request',
 open_request:'Parts request awaiting decision',
 missing_eta:'Linked delivery missing ETA',
 purchasing_review:'Review purchasing and recorded receipts',
 awaiting_linked_delivery:'Linked delivery still outstanding',
 no_active_request:'No active parts request',
 verify_parts:'Verify received parts and repair status',
};

/**
 * One read-only waiting-for-parts handoff per unique work record.
 * Only work orders from explicitly authorized properties are considered.
 * An ETA, recorded stock or approved request alone never establishes that
 * materials are reserved, shipped or physically ready at the work site.
 */
export function waitingPartsHandoff(
 work:readonly WorkOrder[],
 requests:readonly PurchaseRequest[],
 items:readonly InventoryItem[],
 stock:readonly StockRow[],
 orders:OperationsSnapshot['orders'],
 lines:OperationsSnapshot['lines'],
 receipts:readonly ReceivedRow[],
 authorizedProperties:readonly AuthorizedProperty[],
 now=new Date(),
 limit=10,
):WaitingPartsHandoff{
 const propertyClock=new Map(authorizedProperties.map(p=>[p.id,dateAtProperty(p.timezone,now)]));
 const incoming:IncomingDeliveryLine[]=incomingDeliveryLines(
  orders,lines,receipts,authorizedProperties,now,
 );
 const rows:WaitingPartsHandoffRow[]=work
  .filter(w=>w.status==='waiting_parts'&&propertyClock.has(w.property_id))
  .map(w=>{
   const linked=linkedWorkPartReview(w,requests,items,stock,incoming);
   const active=linked.filter(p=>['open','approved','ordered'].includes(p.request.status));
   const open=linked.filter(p=>p.request.status==='open').length;
   const allOrders=new Set(linked.flatMap(p=>p.placedOrderIds));
   const late=new Set(incoming.filter(row=>
    allOrders.has(row.order.id)&&row.eta==='overdue').map(row=>row.order.id)).size;
   const noEta=new Set(incoming.filter(row=>
    allOrders.has(row.order.id)&&row.eta==='not_scheduled').map(row=>row.order.id)).size;
   const hasRecordedOnHand=linked.some(p=>p.onHandMilli!==null&&BigInt(p.onHandMilli)>0n);
   const outstanding=linked.some(p=>BigInt(p.incomingMilli)>0n);
   let reason:WaitingPartsReason;
   if(late>0)reason='late_linked_delivery';
   else if(linked.length===0)reason='no_structured_request';
   else if(open>0)reason='open_request';
   else if(noEta>0)reason='missing_eta';
   else if(active.some(p=>BigInt(p.incomingMilli)===0n))
    reason='purchasing_review';
   else if(outstanding)reason='awaiting_linked_delivery';
   else if(active.length===0&&linked.some(p=>p.request.status==='fulfilled'))
    reason='verify_parts';
   else reason='no_active_request';
   return {
    work:w,propertyToday:propertyClock.get(w.property_id)!,
    reason,linkedRequestCount:linked.length,openRequestCount:open,
    outstandingPlacedOrderCount:allOrders.size,lateOrderCount:late,
    noEtaOrderCount:noEta,hasRecordedOnHand,
   };
  });
 rows.sort((a,b)=>
  ranks[a.reason]-ranks[b.reason] ||
  Number(b.work.priority==='urgent')-Number(a.work.priority==='urgent') ||
  Number(!!b.work.due_on&&b.work.due_on<b.propertyToday)-
   Number(!!a.work.due_on&&a.work.due_on<a.propertyToday) ||
  (a.work.due_on??'9999').localeCompare(b.work.due_on??'9999') ||
  a.work.property_id.localeCompare(b.work.property_id) ||
  a.work.id.localeCompare(b.work.id)
 );
 return {total:rows.length,rows:rows.slice(0,Math.max(0,Math.floor(limit)))};
}
