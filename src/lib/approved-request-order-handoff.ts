import type {PurchaseRequest,PurchaseOrder,PurchaseLine,OperationsSnapshot} from './operations-domain';
import type {PurchaseRequestAttentionRow} from './purchase-request-attention';

export type LinkedPurchaseStage='none'|'preparing'|'placed_unreceived'|'placed_part_received'|'receipt_recorded';

export type LinkedPurchaseReview={
 activeOrders:PurchaseOrder[];
 stage:LinkedPurchaseStage;
 orderedMilli:string;
 netReceivedMilli:string;
 unreceivedMilli:string;
 cancelledLinkedOrders:number;
};

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
  unreceivedMilli:'0',cancelledLinkedOrders:0,
 };
 if(!propertyId||request.property_id!==propertyId)return empty;
 const orderById=new Map(orders.filter(o=>o.property_id===propertyId).map(o=>[o.id,o]));
 const receiptsById=new Map(totals.map(t=>[t.id,t.received_milli]));
 let ordered=0n,received=0n,remaining=0n;
 let cancelledLinkedOrders=0;
 const activeOrders=new Map<string,PurchaseOrder>();
 let placedTotal=0n,placedReceived=0n;
 for(const line of lines){
  if(line.property_id!==propertyId||
     line.request_id!==request.id||line.item_id!==request.item_id)continue;
  const order=orderById.get(line.purchase_order_id);
  if(!order)continue;
  if(order.status==='cancelled'){
   cancelledLinkedOrders+=1;
   continue;
  }
  activeOrders.set(order.id,order);
  const orderedQuantity=BigInt(line.quantity_milli);
  if(orderedQuantity<=0n)continue;
  const recorded=BigInt(receiptsById.get(line.id)??'0');
  const delivered=recorded<0n?0n:recorded>orderedQuantity?orderedQuantity:recorded;
  ordered+=orderedQuantity;
  received+=delivered;
  remaining+=orderedQuantity-delivered;
  if(order.status==='ordered'){
   placedTotal+=orderedQuantity;
   placedReceived+=delivered;
  }
 }
 const live=[...activeOrders.values()].sort((a,b)=>
  a.number.localeCompare(b.number)||a.id.localeCompare(b.id));
 const stage:LinkedPurchaseStage=!live.length?'none':
  placedTotal>0n && placedReceived<placedTotal && placedReceived>0n?'placed_part_received':
  placedTotal>0n && placedReceived<placedTotal?'placed_unreceived':
  placedTotal>0n && placedReceived>=placedTotal?'receipt_recorded':'preparing';
 return {
  activeOrders:live,stage,
  orderedMilli:ordered.toString(),
  netReceivedMilli:received.toString(),
  unreceivedMilli:remaining.toString(),
  cancelledLinkedOrders,
 };
}

export const linkedPurchaseStageLabels:Record<LinkedPurchaseStage,string>={
 none:'No active linked purchase order',
 preparing:'Linked order still being prepared or approved',
 placed_unreceived:'Placed order awaiting recorded receipt',
 placed_part_received:'Placed order partly received',
 receipt_recorded:'Linked placed-order receipts recorded; verify request closeout',
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
