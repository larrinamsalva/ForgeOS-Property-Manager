import {describe,it,expect} from 'vitest';
import {csv} from '../../src/lib/domain';
import {incomingDeliveryLines,filterIncomingDeliveries,incomingDeliveriesCsvRows} from '../../src/lib/incoming-deliveries';
import type {PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

const now=new Date('2026-10-27T17:00:00Z');
const properties=[{id:'park-a',timezone:'America/Los_Angeles'}];
function order(id:string,expected_on:string|null,property_id='park-a',supplierName='Acme Supplies'):PurchaseOrder{
 return {
  id,number:'PO-'+id,property_id,organization_id:'org',status:'ordered',
  expected_on,supplier_snapshot:{name:supplierName,contact:'Private person',email:'private@test.example',
   phone:'555-0000',address:'Restricted address'},
 } as PurchaseOrder;
}
function line(id:string,purchase_order_id:string,property_id='park-a'):PurchaseLine{
 return {
  id,purchase_order_id,property_id,organization_id:'org',item_id:id,
  quantity_milli:'12500',item_snapshot:{sku:'SKU-'+id,name:'Item '+id,unit:'boxes'},
 } as PurchaseLine;
}
const orders=[
 order('overdue','2026-10-25'),
 order('today','2026-10-27'),
 order('future','2026-10-31'),
 order('noeta',null),
 order('partial','2026-10-26','park-a','=HYPERLINK("evil","x")'),
 order('other','2026-10-20','park-b'),
];
const lines=[
 line('overdue-item','overdue'),line('today-item','today'),
 line('future-item','future'),line('noeta-item','noeta'),
 line('partial-item','partial'),line('other-item','other','park-b'),
];
const totals:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'partial-item',received_milli:'5500'},
];
const outstanding=()=>incomingDeliveryLines(orders,lines,totals,properties,now);
const ids=(filter:Parameters<typeof filterIncomingDeliveries>[1],query='')=>
 filterIncomingDeliveries(outstanding(),filter,query).map(row=>row.line.id);

describe('purchasing incoming delivery filters and visible export',()=>{
 it('uses only currently outstanding order lines from the exact property',()=>{
  expect(ids('all')).toEqual(['overdue-item','partial-item','today-item','future-item','noeta-item']);
  expect(ids('all')).not.toContain('other-item');
 });
 it('selects late, today, future ETA, no ETA and partially received orders independently',()=>{
  expect(ids('overdue')).toEqual(['overdue-item','partial-item']);
  expect(ids('due_today')).toEqual(['today-item']);
  expect(ids('upcoming')).toEqual(['future-item']);
  expect(ids('not_scheduled')).toEqual(['noeta-item']);
  expect(ids('part_received')).toEqual(['partial-item']);
  expect(outstanding().find(x=>x.line.id==='partial-item')).toMatchObject({
   netReceivedMilli:'5500',outstandingMilli:'7000',
  });
 });
 it('composes case-insensitive order supplier item and SKU search with a chosen filter',()=>{
  expect(ids('all','po-future')).toEqual(['future-item']);
  expect(ids('overdue','sKu-PARTIAL')).toEqual(['partial-item']);
  expect(ids('all','HYPERLINK')).toEqual(['partial-item']);
  expect(ids('due_today','overdue')).toEqual([]);
  expect(ids('all','  ITEM TODAY  ')).toEqual(['today-item']);
  expect(ids('overdue','  ')).toEqual(['overdue-item','partial-item']);
 });
 it('exports only the filtered displayed rows and exact milliunit quantities',()=>{
  const visible=filterIncomingDeliveries(outstanding(),'overdue','partial');
  const values=incomingDeliveriesCsvRows(visible);
  expect(values).toHaveLength(2);
  expect(values[1]).toEqual([
   'PO-partial','=HYPERLINK("evil","x")','SKU-partial-item','Item partial-item',
   '2026-10-26','overdue','12500','5500','7000','boxes','2026-10-27',
  ]);
  expect(csv(values)).toContain('7000');
  expect(csv(values)).not.toContain('Private person');
  expect(csv(values)).not.toContain('private@test.example');
  expect(csv(values)).not.toContain('555-0000');
  expect(csv(values)).toContain(`"'=HYPERLINK(""evil"",""x"")"`);
 });
 it('empty filtered views export only a header and never re-add hidden rows',()=>{
  const values=incomingDeliveriesCsvRows(filterIncomingDeliveries(outstanding(),'due_today','no-match'));
  expect(values).toHaveLength(1);
  expect(values[0][0]).toBe('Purchase order');
 });
 it('does not mutate cached operations data or change the source order',()=>{
  const original=outstanding();
  const sequence=original.map(row=>row.line.id);
  const orderIds=orders.map(row=>row.id);
  filterIncomingDeliveries(original,'overdue','item');
  incomingDeliveriesCsvRows(original);
  expect(original.map(row=>row.line.id)).toEqual(sequence);
  expect(orders.map(row=>row.id)).toEqual(orderIds);
 });
});
