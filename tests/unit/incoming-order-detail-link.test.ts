import {describe,it,expect} from 'vitest';
import {
 incomingDeliveryLines,incomingDeliveryOrderLink,focusedIncomingDeliveryOrder,
} from '../../src/lib/incoming-deliveries';
import type {PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

function purchase(id:string,extra:Record<string,unknown>={}):PurchaseOrder{
 return {
  id,organization_id:'org',property_id:'park-a',number:'PO-123',
  status:'ordered',expected_on:'2026-10-31',
  supplier_snapshot:{name:'A supplier',contact:'Secret contact',
    email:'private@example.test',phone:'555-1111',address:'Private location'},
  ...extra,
 } as unknown as PurchaseOrder;
}
function line(id:string,orderId:string,extra:Record<string,unknown>={}):PurchaseLine{
 return {
  id,organization_id:'org',property_id:'park-a',purchase_order_id:orderId,
  item_id:'item-'+id,quantity_milli:'5000',
  item_snapshot:{name:'Supply',sku:'SKU-'+id,unit:'boxes'},
  ...extra,
 } as unknown as PurchaseLine;
}
const orders=[
 purchase('placed'),
 purchase('partial'),
 purchase('fully-received'),
 purchase('cancelled',{status:'cancelled'}),
 purchase('approved',{status:'approved'}),
 purchase('other-property',{property_id:'park-b'}),
 purchase('unconnected'),
];
const lines=[
 line('placed-line','placed'),
 line('partial-line','partial'),
 line('received-line','fully-received'),
 line('cancelled-line','cancelled'),
 line('approved-line','approved'),
 line('other-line','other-property',{property_id:'park-b'}),
 line('bad-property','placed',{property_id:'park-b'}),
];
const received:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'partial-line',received_milli:'2500'},
 {id:'received-line',received_milli:'5000'},
];
const authorized=[{id:'park-a',timezone:'America/Los_Angeles'}];
const incoming=()=>incomingDeliveryLines(orders,lines,received,authorized,new Date('2026-10-27T21:00:00Z'));

describe('incoming supply order detail shortcut',()=>{
 it('targets exactly the placed order behind an outstanding delivery line',()=>{
  const rows=incoming();
  expect(focusedIncomingDeliveryOrder(rows,'park-a','placed')?.id).toBe('placed');
  expect(focusedIncomingDeliveryOrder(rows,'park-a','partial')?.id).toBe('partial');
  expect(rows.filter(row=>row.order.id==='partial')[0].outstandingMilli).toBe('2500');
 });
 it('rejects fully received, approved, cancelled and orders without any outstanding line',()=>{
  const rows=incoming();
  for(const id of ['fully-received','approved','cancelled','unconnected','missing']){
   expect(focusedIncomingDeliveryOrder(rows,'park-a',id)).toBeUndefined();
  }
  expect(focusedIncomingDeliveryOrder(rows,'park-a',undefined)).toBeUndefined();
  expect(focusedIncomingDeliveryOrder(rows,'park-a','')).toBeUndefined();
  expect(focusedIncomingDeliveryOrder(rows,'park-a','x'.repeat(129))).toBeUndefined();
 });
 it('cannot leak an order belonging to another property, even if its order number matches',()=>{
  const rows=incoming();
  expect(focusedIncomingDeliveryOrder(rows,'park-a','other-property')).toBeUndefined();
  expect(focusedIncomingDeliveryOrder(rows,'park-b','placed')).toBeUndefined();
  expect(focusedIncomingDeliveryOrder(rows,'','placed')).toBeUndefined();
  const other=incomingDeliveryLines(orders,lines,received,[{id:'park-b',timezone:'UTC'}]);
  expect(focusedIncomingDeliveryOrder(other,'park-b','other-property')?.id).toBe('other-property');
  expect(focusedIncomingDeliveryOrder(other,'park-a','other-property')).toBeUndefined();
 });
 it('requires a matching order ID, never an order number or mismatched line property',()=>{
  const rows=incoming();
  expect(focusedIncomingDeliveryOrder(rows,'park-a','PO-123')).toBeUndefined();
  expect(rows.some(row=>row.line.id==='bad-property')).toBe(false);
  const onlyMismatch=incomingDeliveryLines([orders[0]],[lines[6]],received,authorized);
  expect(focusedIncomingDeliveryOrder(onlyMismatch,'park-a','placed')).toBeUndefined();
 });
 it('encodes organization, property and order IDs without inserting any private supplier or resident details',()=>{
  const href=incomingDeliveryOrderLink('org&access=admin','park-a?property=bad','placed&order=other');
  const url=new URL(href,'https://forgeos.example');
  expect(url.pathname).toBe('/inventory');
  expect(url.searchParams.get('organization')).toBe('org&access=admin');
  expect(url.searchParams.get('property')).toBe('park-a?property=bad');
  expect(url.searchParams.get('view')).toBe('incoming');
  expect(url.searchParams.getAll('order')).toEqual(['placed&order=other']);
  for(const key of ['item','site','customer','resident','stay','contact','phone','email','supplier','receipt','payment','invoice','total']){
   expect(url.searchParams.has(key)).toBe(false);
  }
  expect(href).not.toContain('Secret contact');
 });
 it('does not mutate source purchase orders or retained receipt balances',()=>{
  const first=orders.map(order=>({...order}));
  const second=lines.map(line=>({...line}));
  const third=received.map(row=>({...row}));
  const rows=incoming();
  focusedIncomingDeliveryOrder(rows,'park-a','partial');
  focusedIncomingDeliveryOrder(rows,'park-a','placed');
  expect(orders).toEqual(first);
  expect(lines).toEqual(second);
  expect(received).toEqual(third);
 });
});
