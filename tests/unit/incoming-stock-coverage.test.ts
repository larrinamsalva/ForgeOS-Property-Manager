import {describe,it,expect} from 'vitest';
import {lowStockInventory} from '../../src/lib/low-stock-inventory';
import {incomingDeliveryLines} from '../../src/lib/incoming-deliveries';
import {incomingStockCoverage} from '../../src/lib/incoming-stock-coverage';
import type {InventoryItem,PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

function item(id:string,property_id='park-a',changes:Record<string,unknown>={}):InventoryItem{
 return {id,property_id,organization_id:'org',archived:false,sku:id,name:id,
   unit:'boxes',reorder_milli:'4000',restock_milli:'12500',...changes} as unknown as InventoryItem;
}
function order(id:string,expected_on:string|null,changes:Record<string,unknown>={}):PurchaseOrder{
 return {id,organization_id:'org',property_id:'park-a',status:'ordered',
  number:'PO-'+id,expected_on,
  supplier_snapshot:{name:'Recorded supplier',contact:'',email:'',phone:'',address:''},
  ...changes} as unknown as PurchaseOrder;
}
function line(id:string,purchase_order_id:string,item_id:string,quantity_milli:string,changes:Record<string,unknown>={}):PurchaseLine{
 return {id,property_id:'park-a',organization_id:'org',
   purchase_order_id,item_id,quantity_milli,
   item_snapshot:{sku:item_id,name:item_id,unit:'boxes'},...changes} as unknown as PurchaseLine;
}
const items=[
 item('soap'),item('bags','park-a',{reorder_milli:'5000',restock_milli:'11000'}),
 item('bleach','park-a',{restock_milli:'3500'}),
 item('archived','park-a',{archived:true}),
 item('soap','park-b'),
];
const stock:OperationsSnapshot['summary']['stock']=[
 {id:'soap',quantity_milli:'0',last_purchase_on:null},
 {id:'bags',quantity_milli:'5000',last_purchase_on:null},
 {id:'bleach',quantity_milli:'0',last_purchase_on:null},
];
const orders=[
 order('late','2026-10-25'),order('no-eta',null),
 order('future','2026-10-30'),order('partial','2026-10-28'),
 order('approved','2026-10-26',{status:'approved'}),
 order('cancelled','2026-10-26',{status:'cancelled'}),
 order('done','2026-10-26'),
 order('other-property','2026-10-23',{property_id:'park-b'}),
];
const lines=[
 line('late-a','late','soap','3000'),line('late-b','late','soap','1000'),
 line('none','no-eta','soap','2000'),line('partial','partial','soap','3000'),
 line('bags','future','bags','9000'),
 line('approved','approved','soap','5000'),
 line('cancelled','cancelled','soap','6000'),
 line('done','done','soap','5000'),
 line('other','other-property','soap','45000',{property_id:'park-b'}),
 line('bad-property','future','bleach','9000',{property_id:'park-b'}),
];
const received:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'partial',received_milli:'1000'},
 {id:'done',received_milli:'5000'},
];
const west=[{id:'park-a',timezone:'America/Los_Angeles'}];
function coverage(){
 return incomingStockCoverage(
  lowStockInventory(items,stock,['park-a']),
  incomingDeliveryLines(orders,lines,received,west,new Date('2026-10-27T22:00:00Z')),
 );
}
describe('low-stock restock target vs outstanding placed orders',()=>{
 it('uses exact item and property IDs and never adds on-order supplies to on-hand',()=>{
  const rows=coverage();
  expect(rows.map(r=>r.item.id)).toEqual(['bleach','soap','bags']);
  expect(rows.find(r=>r.item.id==='soap')).toMatchObject({
   availableMilli:'0',suggestedMilli:'12500',
   outstandingOnOrderMilli:'8000',gapIfReceivedMilli:'4500',
   overdueOrderCount:1,missingEtaOrderCount:1,
   placedOrderIds:['late','no-eta','partial'],
  });
  expect(rows.find(r=>r.item.id==='bleach')).toMatchObject({
   availableMilli:'0',outstandingOnOrderMilli:'0',gapIfReceivedMilli:'3500',
   placedOrderIds:[],overdueOrderCount:0,missingEtaOrderCount:0,
  });
 });
 it('never calculates a negative restock gap when outstanding orders exceed the target',()=>{
  expect(coverage().find(r=>r.item.id==='bags')).toMatchObject({
   availableMilli:'5000',suggestedMilli:'6000',
   outstandingOnOrderMilli:'9000',gapIfReceivedMilli:'0',
   placedOrderIds:['future'],
  });
 });
 it('deduplicates multiple pending lines on one purchase order in count and links',()=>{
  const soap=coverage().find(r=>r.item.id==='soap')!;
  expect(soap.placedOrderIds.filter(x=>x==='late')).toEqual(['late']);
  expect(soap.overdueOrderCount).toBe(1);
 });
 it('does not treat approved, cancelled, fully received or cross-property orders as on order',()=>{
  const rows=incomingDeliveryLines(orders,lines,received,west,new Date('2026-10-27T22:00:00Z'));
  expect(rows.map(x=>x.line.id)).not.toEqual(expect.arrayContaining(
   ['approved','cancelled','done','other','bad-property']
  ));
  expect(coverage().find(x=>x.item.id==='soap')!.outstandingOnOrderMilli).toBe('8000');
 });
 it('retains exact BigInt milliunit precision without converting to imprecise numbers',()=>{
  const hugeItem=[item('huge','park-a',{
   reorder_milli:'5000000000000000000',restock_milli:'9007199254740995000',
  })];
  const hugeStock=[{id:'huge',quantity_milli:'0',last_purchase_on:null}];
  const hugeOrders=[order('huge-order',null)];
  const hugeLines=[line('huge-line','huge-order','huge','9007199254740994000')];
  const incoming=incomingDeliveryLines(hugeOrders,hugeLines,[],west);
  const result=incomingStockCoverage(lowStockInventory(hugeItem,hugeStock, ['park-a']),incoming);
  expect(result[0]).toMatchObject({
   outstandingOnOrderMilli:'9007199254740994000',gapIfReceivedMilli:'1000',
  });
 });
 it('keeps records immutable and never creates purchase requests or stock movements',()=>{
  const beforeItems=items.map(x=>({...x}));
  const beforeLines=lines.map(x=>({...x}));
  const beforeOrders=orders.map(x=>({...x}));
  coverage();
  expect(items).toEqual(beforeItems);
  expect(lines).toEqual(beforeLines);
  expect(orders).toEqual(beforeOrders);
 });
});
