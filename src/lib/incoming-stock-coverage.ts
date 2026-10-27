import type {IncomingDeliveryLine} from './incoming-deliveries';
import type {LowStockItem} from './low-stock-inventory';

export type IncomingStockCoverage = LowStockItem & {
 /** Actual on-hand never changes merely because a purchase order is placed. */
 outstandingOnOrderMilli:string;
 /** Gap against the saved restock target IF all recorded outstanding orders arrive. */
 gapIfReceivedMilli:string;
 placedOrderIds:string[];
 overdueOrderCount:number;
 missingEtaOrderCount:number;
};

/** A read-only match on exact property + physical inventory item ID.
 * Incoming lines must already be filtered by the authorized properties
 * and must represent placed orders with positive net-outstanding receipts.
 * Never treat a purchase REQUEST as an order, nor an order as received stock.
 */
export function incomingStockCoverage(
 lowStock:readonly LowStockItem[],
 incoming:readonly IncomingDeliveryLine[],
):IncomingStockCoverage[]{
 return lowStock.map(shortage=>{
  const rows=incoming.filter(row=>
   row.line.item_id===shortage.item.id &&
   row.line.property_id===shortage.item.property_id &&
   row.order.property_id===shortage.item.property_id &&
   row.order.status==='ordered' &&
   BigInt(row.outstandingMilli)>0n
  );
  const outstanding=rows.reduce((sum,row)=>sum+BigInt(row.outstandingMilli),0n);
  const needed=BigInt(shortage.suggestedMilli);
  const orders=new Map(rows.map(row=>[row.order.id,row.order]));
  return {
   ...shortage,
   outstandingOnOrderMilli:outstanding.toString(),
   gapIfReceivedMilli:(needed>outstanding?needed-outstanding:0n).toString(),
   placedOrderIds:[...orders.keys()].sort(),
   overdueOrderCount:[...orders.values()].filter(order=>
     rows.some(row=>row.order.id===order.id&&row.eta==='overdue')).length,
   missingEtaOrderCount:[...orders.values()].filter(order=>!order.expected_on).length,
  };
 });
}
