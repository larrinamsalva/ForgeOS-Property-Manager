import type {PurchaseRequest,PurchaseOrder,PurchaseLine,OperationsSnapshot} from './operations-domain';
import type {PurchaseRequestAttentionRow} from './purchase-request-attention';

export type LinkedPurchaseStage='none'|'preparing'|'placed_unreceived'|'placed_part_received'|'receipt_recorded'|'receipt_recorded_preparing'|'placed_part_received_preparing'|'placed_unreceived_preparing';

export type LinkedPurchaseReview={
 activeOrders:PurchaseOrder[];
 stage:LinkedPurchaseStage;
 orderedMilli:string;
 netReceivedMilli:string;
 unreceivedMilli:string;
 placedUnreceivedMilli:string;
 preparingMilli:string;
 unplacedReceiptMilli:string;
 cancelledLinkedOrders:number;
};

/** A malformed persisted quantity must not crash purchasing review. */
function safeMilli(value:string|undefined|null):bigint{
 return typeof value==='string' && /^-?\d+$/.test(value)?BigInt(value):0n;
}

/** Read-only, same-property linked purchasing records for ONE request.
 * We require the exact request ID, stock item ID, line property and
 * supplier order property. A similar SKU or supplier name is not a link.
 * Cancelled orders never count as an active purchase; recorded receipts
 * must not be interpreted as a delivery ETA or proof of job allocation.
 */
export function linkedPurchaseReview(
 request:Pick<PurchaseRequest,'id'|'property_id'|'item_id'>,
 orders:readonly PurchaseOrder[],
 lines:readonly PurchaseLine[],
 totals:readonly OperationsSnapshot['summary']['purchase_lines'][number][],
 propertyId:string,
):LinkedPurchaseReview{
 const empty:LinkedPurchaseReview={
  activeOrders:[],stage:'none',orderedMilli:'0',netReceivedMilli:'0',
  unreceivedMilli:'0',placedUnreceivedMilli:'0',preparingMilli:'0',unplacedReceiptMilli:'0',cancelledLinkedOrders:0,
 };
 if(!propertyId||request.property_id!==propertyId)return empty;
 const orderById=new Map(orders.filter(o=>o.property_id===propertyId).map(o=>[o.id,o]));
 const receiptsById=new Map(totals.map(t=>[t.id,t.received_milli]));
 let ordered=0n,received=0n,remaining=0n;
 const cancelledOrderIds=new Set<string>();
 const activeOrders=new Map<string,PurchaseOrder>();
 let placedTotal=0n,placedReceived=0n,preparingTotal=0n,unplacedReceived=0n;
 for(const line of lines){
  if(line.property_id!==propertyId||
     line.request_id!==request.id||line.item_id!==request.item_id)continue;
  const order=orderById.get(line.purchase_order_id);
  if(!order)continue;
  if(order.status==='cancelled'){
   cancelledOrderIds.add(order.id);
   continue;
  }
  activeOrders.set(order.id,order);
  const orderedQuantity=safeMilli(line.quantity_milli);
  if(orderedQuantity<=0n)continue;
  const recorded=safeMilli(receiptsById.get(line.id));
  const delivered=recorded<0n?0n:recorded>orderedQuantity?orderedQuantity:recorded;
  ordered+=orderedQuantity;
  received+=delivered;
  remaining+=orderedQuantity-delivered;
  if(order.status==='ordered'){
   placedTotal+=orderedQuantity;
   placedReceived+=delivered;
  }else{
   preparingTotal+=orderedQuantity-delivered;
   unplacedReceived+=delivered;
  }
 }
 const live=[...activeOrders.values()].sort((a,b)=>
  a.number.localeCompare(b.number)||a.id.localeCompare(b.id));
 const stage:LinkedPurchaseStage=!live.length?'none':
  placedTotal>0n && placedReceived<placedTotal && placedReceived>0n && preparingTotal>0n?'placed_part_received_preparing':
  placedTotal>0n && placedReceived<placedTotal && placedReceived>0n?'placed_part_received':
  placedTotal>0n && placedReceived<placedTotal && preparingTotal>0n?'placed_unreceived_preparing':
  placedTotal>0n && placedReceived<placedTotal?'placed_unreceived':
  placedTotal>0n && placedReceived>=placedTotal && preparingTotal>0n?'receipt_recorded_preparing':
  placedTotal>0n && placedReceived>=placedTotal?'receipt_recorded':'preparing';
 return {
  activeOrders:live,stage,
  orderedMilli:ordered.toString(),
  netReceivedMilli:received.toString(),
  unreceivedMilli:remaining.toString(),
  placedUnreceivedMilli:(placedTotal-placedReceived).toString(),
  preparingMilli:preparingTotal.toString(),
  unplacedReceiptMilli:unplacedReceived.toString(),
  cancelledLinkedOrders:cancelledOrderIds.size,
 };
}

/** Informational comparison only: linked ordered quantities may cover other needs,
 * and this does not verify delivery, stock on hand, or whether a repair is complete. */
export function linkedOrderQuantityGap(requestedMilli:string,orderedMilli:string):string{
 const requested=safeMilli(requestedMilli);
 const ordered=safeMilli(orderedMilli);
 return (requested>ordered && requested>0n?requested-(ordered>0n?ordered:0n):0n).toString();
}

/** Read-only excess linked-order quantity, not proof of an erroneous purchase. */
export function linkedOrderQuantityExcess(requestedMilli:string,orderedMilli:string):string{
 const requested=safeMilli(requestedMilli);
 const ordered=safeMilli(orderedMilli);
 return (requested>0n && ordered>requested?ordered-requested:0n).toString();
}

export const linkedPurchaseStageLabels:Record<LinkedPurchaseStage,string>={
 none:'No active linked purchase order',
 preparing:'Linked order still being prepared or approved',
 placed_unreceived:'Placed order awaiting recorded receipt',
 placed_part_received:'Placed order partly received',
 receipt_recorded:'Linked placed-order receipts recorded; verify request closeout',
 receipt_recorded_preparing:'Placed-order receipts recorded; other linked orders still being prepared',
 placed_part_received_preparing:'Placed order partly received; other linked orders still being prepared',
 placed_unreceived_preparing:'Placed order awaiting recorded receipt; other linked orders still being prepared',
};

/** The manager's missing-order handoff is specifically APPROVED requests
 * with no non-cancelled, correctly linked purchase-order lines. This does
 * NOT automatically create supplier orders or assume nothing was ordered
 * outside ForgeOS; managers must verify their records before ordering.
 */
export function approvedRequestsWithoutLinkedOrders(
 rows:readonly PurchaseRequestAttentionRow[],
 orders:readonly PurchaseOrder[],
 lines:readonly PurchaseLine[],
 totals:readonly OperationsSnapshot['summary']['purchase_lines'][number][],
 propertyId:string,
):PurchaseRequestAttentionRow[]{
 return rows.filter(row=>row.request.property_id===propertyId &&
  row.request.status==='approved' &&
  linkedPurchaseReview(row.request,orders,lines,totals,propertyId).activeOrders.length===0);
}
