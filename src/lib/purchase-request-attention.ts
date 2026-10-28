import type {PurchaseRequest,InventoryItem,WorkOrder} from './operations-domain';

export type PurchaseRequestDeadline='overdue'|'due_today'|'upcoming'|'no_valid_date'|'resolved';
export type PurchaseRequestAttentionFilter=
 'all'|'overdue'|'due_today'|'needs_decision'|'approved'|'ordered'|'resolved';
export type PurchaseRequestAttentionRow={
 request:PurchaseRequest;
 item:InventoryItem|undefined;
 work:WorkOrder|undefined;
 deadline:PurchaseRequestDeadline;
};
export const purchaseRequestAttentionChoices:readonly {
 value:PurchaseRequestAttentionFilter;label:string;
}[]=[
 {value:'all',label:'All requests'},
 {value:'overdue',label:'Past needed date'},
 {value:'due_today',label:'Needed today'},
 {value:'needs_decision',label:'Awaiting decision'},
 {value:'approved',label:'Approved'},
 {value:'ordered',label:'Marked ordered'},
 {value:'resolved',label:'Resolved / closed'},
];
const active=new Set<PurchaseRequest['status']>(['open','approved','ordered']);

function validCalendarDay(day:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const year=Number(day.slice(0,4)),month=Number(day.slice(5,7)),date=Number(day.slice(8,10));
 if(year<1||month<1||month>12||date<1||date>31)return false;
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 return date<=last;
}
/** Calculate needed-by urgency from the already selected property's
 * local calendar date. A purchase order is NOT a receipt or fulfillment.
 * Only exact matching property/item/repair records can be shown together.
 */
export function purchaseRequestAttention(
 requests:readonly PurchaseRequest[],
 items:readonly InventoryItem[],
 works:readonly WorkOrder[],
 propertyId:string,
 propertyToday:string,
):PurchaseRequestAttentionRow[]{
 if(!propertyId||!validCalendarDay(propertyToday))return [];
 const matchingItems=new Map(items.filter(x=>x.property_id===propertyId).map(x=>[x.id,x]));
 const matchingWorks=new Map(works.filter(x=>x.property_id===propertyId).map(x=>[x.id,x]));
 const ranking:Record<PurchaseRequestDeadline,number>={
  overdue:0,due_today:1,upcoming:2,no_valid_date:3,resolved:4,
 };
 const statusRanking:Record<PurchaseRequest['status'],number>={
  open:0,approved:1,ordered:2,fulfilled:3,declined:4,cancelled:5,
 };
 return requests.filter(row=>row.property_id===propertyId).map(request=>{
  const deadline:PurchaseRequestDeadline=!active.has(request.status)?'resolved':
   !validCalendarDay(request.needed_on)?'no_valid_date':
   request.needed_on<propertyToday?'overdue':
   request.needed_on===propertyToday?'due_today':'upcoming';
  return {
   request,deadline,
   item:matchingItems.get(request.item_id),
   work:request.work_order_id?matchingWorks.get(request.work_order_id):undefined,
  };
 }).sort((a,b)=>
  ranking[a.deadline]-ranking[b.deadline] ||
  (a.request.needed_on||'9999-99-99').localeCompare(b.request.needed_on||'9999-99-99') ||
  statusRanking[a.request.status]-statusRanking[b.request.status] ||
  a.request.id.localeCompare(b.request.id)
 );
}
/** Pure visible-row selector used by both table and CSV; original attention
 * rank and the exact authorized property scope cannot be broadened here.
 */
export function filterPurchaseRequestAttention(
 rows:readonly PurchaseRequestAttentionRow[],
 filter:PurchaseRequestAttentionFilter,
 search:string,
):PurchaseRequestAttentionRow[]{
 const needle=search.trim().toLocaleLowerCase();
 return rows.filter(row=>{
  const status=row.request.status;
  const chosen=filter==='all'||
   (filter==='overdue'&&row.deadline==='overdue')||
   (filter==='due_today'&&row.deadline==='due_today')||
   (filter==='needs_decision'&&status==='open')||
   (filter==='approved'&&status==='approved')||
   (filter==='ordered'&&status==='ordered')||
   (filter==='resolved'&&!active.has(status));
  return chosen&&(!needle||[
   row.item?.name??'',row.item?.sku??'',row.work?.number??'',
   row.request.id,
  ].some(x=>x.toLocaleLowerCase().includes(needle)));
 });
}
/** Header plus only the rows supplied by the visible Purchasing table.
 * Descriptions, decision notes, supplier contacts and resident details are
 * excluded. Use the shared csv() writer for spreadsheet formula escaping.
 */
export function purchaseRequestAttentionCsvRows(
 rows:readonly PurchaseRequestAttentionRow[],
):string[][]{
 return [
  ['Item','SKU','Status','Deadline status','Needed date',
   'Requested milliunits','Unit','Linked work order'],
  ...rows.map(row=>[
   row.item?.name??'Unavailable item',row.item?.sku??'',
   row.request.status,row.deadline,row.request.needed_on,
   row.request.quantity_milli,row.item?.unit??'',
   row.work?.number??'',
  ]),
 ];
}
