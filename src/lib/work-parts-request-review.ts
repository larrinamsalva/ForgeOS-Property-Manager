import type {
 WorkOrder,PurchaseRequest,InventoryItem,OperationsSnapshot,
} from './operations-domain';
import type {IncomingDeliveryLine} from './incoming-deliveries';

type StockRow=OperationsSnapshot['summary']['stock'][number];
export type LinkedWorkPartReview={
 request:PurchaseRequest;
 item:InventoryItem|undefined;
 /** NULL means the inventory item is missing; zero means recorded zero stock. */
 onHandMilli:string|null;
 /** Unreceived units on placed order lines *explicitly linked* to this request. */
 incomingMilli:string;
 placedOrderIds:string[];
 overdueOrderCount:number;
 missingEtaOrderCount:number;
};

/** Join by exact work order, property, request and physical item IDs.
 * The free-form 'parts_required' field is not an inventory reservation, and
 * similarly named supplies cannot establish a purchasing relationship.
 * An unreceived order is not proof of allocation or an ETA commitment.
 */
export function linkedWorkPartReview(
 work:Pick<WorkOrder,'id'|'property_id'>,
 requests:readonly PurchaseRequest[],
 items:readonly InventoryItem[],
 stock:readonly StockRow[],
 incoming:readonly IncomingDeliveryLine[],
):LinkedWorkPartReview[]{
 const ownRequests=requests.filter(request=>
  request.work_order_id===work.id && request.property_id===work.property_id);
 const available=new Map(stock.map(row=>[row.id,row.quantity_milli]));
 return ownRequests.map(request=>{
  const item=items.find(row=>row.id===request.item_id && row.property_id===work.property_id);
  const associated=incoming.filter(row=>
   row.line.request_id===request.id &&
   row.line.item_id===request.item_id &&
   row.line.property_id===work.property_id &&
   row.order.property_id===work.property_id &&
   row.order.status==='ordered' &&
   BigInt(row.outstandingMilli)>0n);
  const placed=new Map(associated.map(row=>[row.order.id,row.order]));
  return {
   request,item,
   onHandMilli:item ? (available.get(item.id)??'0') : null,
   incomingMilli:associated.reduce((sum,row)=>sum+BigInt(row.outstandingMilli),0n).toString(),
   placedOrderIds:[...placed.keys()].sort(),
   overdueOrderCount:[...placed.values()].filter(order=>
    associated.some(row=>row.order.id===order.id && row.eta==='overdue')).length,
   missingEtaOrderCount:[...placed.values()].filter(order=>!order.expected_on).length,
  };
 }).sort((a,b)=>
  a.request.needed_on.localeCompare(b.request.needed_on) ||
  a.request.id.localeCompare(b.request.id));
}

/** Count actual waiting-for-parts repairs without a *structured* linked
 * purchase request. Notes or informal supplier contacts are not inferred. */
export function waitingRepairsWithoutPartRequests(
 works:readonly Pick<WorkOrder,'id'|'property_id'|'status'>[],
 requests:readonly Pick<PurchaseRequest,'work_order_id'|'property_id'>[],
 authorizedPropertyIds:readonly string[],
):{waiting:number;withoutRequest:number}{
 const allowed=new Set(authorizedPropertyIds);
 const linked=new Set(requests.filter(r=>allowed.has(r.property_id)&&r.work_order_id)
  .map(r=>r.property_id+'\u0000'+r.work_order_id));
 const waiting=works.filter(w=>allowed.has(w.property_id)&&w.status==='waiting_parts');
 return {
  waiting:waiting.length,
  withoutRequest:waiting.filter(w=>!linked.has(w.property_id+'\u0000'+w.id)).length,
 };
}
