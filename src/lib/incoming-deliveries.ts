import {dateAtProperty} from './domain';
import type {OperationsSnapshot,PurchaseOrder,PurchaseLine} from './operations-domain';

type PropertyClock={id:string;timezone:string};
type ReceivedLine=OperationsSnapshot['summary']['purchase_lines'][number];
export type IncomingDeliveryLine={
 order:PurchaseOrder;
 line:PurchaseLine;
 propertyToday:string;
 netReceivedMilli:string;
 outstandingMilli:string;
 eta:'overdue'|'due_today'|'upcoming'|'not_scheduled';
};

/** Recorded supplier orders with outstanding, unreceived units.
 * This reads the same retained net receipt totals used by PurchaseDetail.
 * An order marked 'approved' or 'draft' is not a placed order.
 * A due date is an estimate, never proof of shipment/delivery.
 */
export function incomingDeliveryLines(
 orders:readonly PurchaseOrder[],
 lines:readonly PurchaseLine[],
 totals:readonly ReceivedLine[],
 authorizedProperties:readonly PropertyClock[],
 now=new Date(),
):IncomingDeliveryLine[]{
 const localDays=new Map(authorizedProperties.map(p=>[p.id,dateAtProperty(p.timezone,now)]));
 const received=new Map(totals.map(x=>[x.id,x.received_milli]));
 const ordered=new Map(orders.filter(o=>o.status==='ordered' && localDays.has(o.property_id)).map(o=>[o.id,o]));
 const result:IncomingDeliveryLine[]=[];
 for(const line of lines){
  const order=ordered.get(line.purchase_order_id);
  if(!order || line.property_id!==order.property_id)continue;
  const expected=BigInt(line.quantity_milli);
  if(expected<=0n)continue;
  const recorded=BigInt(received.get(line.id)??'0');
  const accepted=recorded<0n?0n:recorded>expected?expected:recorded;
  const outstanding=expected-accepted;
  if(outstanding<=0n)continue;
  const today=localDays.get(order.property_id)!;
  const eta=!order.expected_on?'not_scheduled':
    order.expected_on<today?'overdue':
    order.expected_on===today?'due_today':'upcoming';
  result.push({
   order,line,propertyToday:today,
   netReceivedMilli:accepted.toString(),
   outstandingMilli:outstanding.toString(),
   eta,
  });
 }
 const ranks={overdue:0,due_today:1,upcoming:2,not_scheduled:3};
 return result.sort((a,b)=>
  ranks[a.eta]-ranks[b.eta] ||
  (a.order.expected_on??'9999-99-99').localeCompare(b.order.expected_on??'9999-99-99') ||
  a.order.property_id.localeCompare(b.order.property_id) ||
  a.order.number.localeCompare(b.order.number) ||
  a.line.id.localeCompare(b.line.id)
 );
}

/** Requires an actual property from the authorized snapshot at destination.
 * This is navigation only: not an order, receipt or stock movement. */
export function incomingDeliveriesLink(organizationId:string,propertyId:string):string{
 return '/inventory?'+new URLSearchParams({
  organization:organizationId,property:propertyId,view:'incoming',
 });
}

/** Filters operate on the already property-authorized, outstanding-only,
 * sorted order lines. "Part received" reflects net recorded receipts only.
 */
export type IncomingDeliveryFilter='all'|'overdue'|'due_today'|'upcoming'|'not_scheduled'|'part_received';
export function filterIncomingDeliveries(
 rows:readonly IncomingDeliveryLine[],
 filter:IncomingDeliveryFilter,
 search:string,
):IncomingDeliveryLine[]{
 const term=search.trim().toLocaleLowerCase();
 return rows.filter(row=>
  (filter==='all'||
   (filter==='part_received'?BigInt(row.netReceivedMilli)>0n:row.eta===filter)) &&
  (!term||[
    row.order.number,row.order.supplier_snapshot.name,
    row.line.item_snapshot.name,row.line.item_snapshot.sku,
  ].some(value=>value.toLocaleLowerCase().includes(term)))
 );
}

/** Exactly the values displayed in an incoming-delivery review. Pass this
 * to the existing CSV escaping/Excel-formula injection safe writer.
 * Supplier contacts, customers, invoices and payment data are omitted.
 */
export function incomingDeliveriesCsvRows(rows:readonly IncomingDeliveryLine[]):string[][]{
 return [
  ['Purchase order','Supplier','Item / SKU','Supply','Expected date','ETA status',
   'Ordered milliunits','Net received milliunits','Outstanding milliunits','Unit','Property local date'],
  ...rows.map(row=>[
   row.order.number,row.order.supplier_snapshot.name,
   row.line.item_snapshot.sku,row.line.item_snapshot.name,
   row.order.expected_on??'',row.eta,
   row.line.quantity_milli,row.netReceivedMilli,row.outstandingMilli,
   row.line.item_snapshot.unit,row.propertyToday,
  ]),
 ];
}
