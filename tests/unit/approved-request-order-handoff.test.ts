import {describe,it,expect} from 'vitest';
import {
 linkedPurchaseReview,approvedRequestsWithoutLinkedOrders,linkedPurchaseStageLabels,
} from '../../src/lib/approved-request-order-handoff';
import {purchaseRequestAttention} from '../../src/lib/purchase-request-attention';
import type {
 PurchaseRequest,PurchaseOrder,PurchaseLine,InventoryItem,WorkOrder,
 OperationsSnapshot,
} from '../../src/lib/operations-domain';

const propertyId='park-a';
function request(id:string,status:PurchaseRequest['status']='approved',extra:Partial<PurchaseRequest>={}):PurchaseRequest{
 return {
  id,organization_id:'org',property_id:propertyId,work_order_id:'repair-a',
  item_id:'filter',status,needed_on:'2026-10-26',quantity_milli:'7500',
  description:'Private repair request',decision_reason:'Internal approval',
  ...extra,
 } as PurchaseRequest;
}
function order(id:string,status:PurchaseOrder['status']='draft',extra:Partial<PurchaseOrder>={}):PurchaseOrder{
 return {
  id,number:'PO-'+id,property_id:propertyId,organization_id:'org',
  status,supplier_id:'supplier',expected_on:null,
  supplier_snapshot:{name:'Supplier',email:'private@example.test',
   contact:'Private supplier contact',phone:'555-1234',address:'Private location'},
  ...extra,
 } as PurchaseOrder;
}
function line(id:string,requestId:string,orderId:string,extra:Partial<PurchaseLine>={}):PurchaseLine{
 return {
  id,organization_id:'org',property_id:propertyId,item_id:'filter',
  request_id:requestId,purchase_order_id:orderId,quantity_milli:'5000',
  item_snapshot:{name:'Filter',sku:'F-1',unit:'each'},
  ...extra,
 } as PurchaseLine;
}
const requests=[
 request('approved-missing'),
 request('approved-cancelled'),
 request('approved-draft'),
 request('approved-authorized'),
 request('approved-placed'),
 request('approved-cross-item'),
 request('approved-cross-property'),
 request('open-missing','open'),
 request('fulfilled-missing','fulfilled'),
 request('approved-mixed'),
];
const orders=[
 order('cancelled','cancelled'),
 order('draft'),
 order('authorized','approved'),
 order('placed','ordered'),
 order('wrong-property','ordered',{property_id:'park-b'}),
 order('mixed-draft','draft'),
 order('mixed-placed','ordered'),
];
const lines=[
 line('cancelled-line','approved-cancelled','cancelled'),
 line('draft-line','approved-draft','draft'),
 line('auth-line','approved-authorized','authorized'),
 line('placed-1','approved-placed','placed'),
 line('placed-2','approved-placed','placed',{quantity_milli:'3000'}),
 line('wrong-item','approved-cross-item','placed',{item_id:'other-item'}),
 line('wrong-property','approved-cross-property','wrong-property',{property_id:'park-b'}),
 line('mixed-draft','approved-mixed','mixed-draft',{quantity_milli:'2000'}),
 line('mixed-placed','approved-mixed','mixed-placed',{quantity_milli:'4000'}),
];
const received:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'placed-1',received_milli:'2000'},
 {id:'placed-2',received_milli:'0'},
 {id:'mixed-placed',received_milli:'4000'},
];
const items=[{id:'filter',property_id:propertyId,sku:'F-1',
 name:'Replacement filter',unit:'each'} as InventoryItem];
const works=[{id:'repair-a',property_id:propertyId,number:'WO-12'} as WorkOrder];
const review=(id:string,property=propertyId)=>linkedPurchaseReview(
 requests.find(r=>r.id===id)!,orders,lines,received,property);
describe('approved parts requests with no explicitly linked purchase order',()=>{
 it('flags ONLY approved requests without an active same-property matching order line',()=>{
  const rows=purchaseRequestAttention(requests,items,works,propertyId,'2026-10-27');
  const gaps=approvedRequestsWithoutLinkedOrders(rows,orders,lines,received,propertyId);
  expect(gaps.map(x=>x.request.id)).toEqual([
   'approved-cancelled','approved-cross-item','approved-cross-property','approved-missing',
  ]);
  expect(gaps.every(row=>row.request.status==='approved')).toBe(true);
  expect(gaps.map(row=>row.request.id)).not.toContain('open-missing');
  expect(gaps.map(row=>row.request.id)).not.toContain('fulfilled-missing');
  expect(approvedRequestsWithoutLinkedOrders(rows,orders,lines,received,'park-b')).toEqual([]);
 });
 it('does not assume a draft or approved purchase order has been sent to the supplier',()=>{
  expect(review('approved-draft')).toMatchObject({stage:'preparing',
    orderedMilli:'5000',netReceivedMilli:'0',unreceivedMilli:'5000',
  });
  expect(review('approved-authorized')).toMatchObject({stage:'preparing',
    activeOrders:[{id:'authorized'}],
  });
  expect(linkedPurchaseStageLabels.preparing).toContain('prepared');
 });
 it('keeps partial and fully recorded receipts independent from linked draft lines',()=>{
  expect(review('approved-placed')).toMatchObject({
   stage:'placed_part_received',orderedMilli:'8000',netReceivedMilli:'2000',
   unreceivedMilli:'6000',
  });
  expect(review('approved-placed')).toMatchObject({placedUnreceivedMilli:'6000',preparingMilli:'0'});
  expect(review('approved-draft')).toMatchObject({placedUnreceivedMilli:'0',preparingMilli:'5000'});
  expect(review('approved-mixed')).toMatchObject({
   stage:'receipt_recorded_preparing',orderedMilli:'6000',netReceivedMilli:'4000',
   placedUnreceivedMilli:'0',preparingMilli:'2000',unreceivedMilli:'2000',
  });
  const notReceived=linkedPurchaseReview(request('open-test'),[order('ordered-only','ordered')],
   [line('unreceived','open-test','ordered-only')],[],propertyId);
  expect(notReceived.stage).toBe('placed_unreceived');
  const done=linkedPurchaseReview(request('done'),[order('done','ordered')],
   [line('line','done','done')],[{id:'line',received_milli:'5000'}],propertyId);
  expect(done.stage).toBe('receipt_recorded');
  expect(linkedPurchaseStageLabels.receipt_recorded_preparing).toContain('still being prepared');
 });
 it('excludes cancelled, wrong-property, wrong-item and unrelated order lines',()=>{
  expect(review('approved-cancelled')).toMatchObject({
   stage:'none',cancelledLinkedOrders:1,activeOrders:[],orderedMilli:'0',
  });
  expect(review('approved-cross-item')).toMatchObject({stage:'none',activeOrders:[]});
  expect(review('approved-cross-property')).toMatchObject({stage:'none',activeOrders:[]});
  expect(review('approved-placed','park-b')).toMatchObject({stage:'none',activeOrders:[]});
 });
 it('counts one cancelled supplier order only once even when it has multiple linked lines',()=>{
  const record=request('cancelled-multi-line');
  const cancelled=[order('cancelled-one','cancelled'),order('cancelled-two','cancelled')];
  const linked=[
   line('c1','cancelled-multi-line','cancelled-one'),
   line('c2','cancelled-multi-line','cancelled-one'),
   line('c3','cancelled-multi-line','cancelled-two'),
   line('not-this-request','other-request','cancelled-two'),
  ];
  expect(linkedPurchaseReview(record,cancelled,linked,[],propertyId)).toMatchObject({
   stage:'none',activeOrders:[],cancelledLinkedOrders:2,
  });
 });
 it('deduplicates the same supplier order across multiple matching request lines',()=>{
  expect(review('approved-placed').activeOrders.map(o=>o.id)).toEqual(['placed']);
  expect(review('approved-placed').unreceivedMilli).toBe('6000');
 });
 it('clamps negative and excess receipt quantities to the actual ordered line',()=>{
  const record=request('large');
  const reqOrders=[order('huge','ordered')];
  const reqLines=[
   line('line1','large','huge',{quantity_milli:'9007199254740993000'}),
   line('line2','large','huge',{quantity_milli:'3000'}),
  ];
  const totals=[{id:'line1',received_milli:'1000'},{id:'line2',received_milli:'9999'}];
  expect(linkedPurchaseReview(record,reqOrders,reqLines,totals,propertyId)).toMatchObject({
   orderedMilli:'9007199254740996000',netReceivedMilli:'4000',
   unreceivedMilli:'9007199254740992000',stage:'placed_part_received',
  });
  expect(linkedPurchaseReview(record,reqOrders,reqLines,[{id:'line1',received_milli:'-100'}],propertyId)
   .netReceivedMilli).toBe('0');
 });
 it('does not crash on malformed stored order or receipt quantities',()=>{
  const record=request('malformed');
  const purchase=[order('malformed-order','ordered')];
  const purchaseLines=[
   line('bad-quantity','malformed','malformed-order',{quantity_milli:'not-a-number'}),
   line('valid-quantity','malformed','malformed-order',{quantity_milli:'2000'}),
  ];
  expect(linkedPurchaseReview(record,purchase,purchaseLines,[
   {id:'bad-quantity',received_milli:'100'},
   {id:'valid-quantity',received_milli:'broken'},
  ],propertyId)).toMatchObject({stage:'placed_unreceived',orderedMilli:'2000',netReceivedMilli:'0',unreceivedMilli:'2000'});
  expect(linkedPurchaseReview(record,purchase,purchaseLines,[
   {id:'valid-quantity',received_milli:'1000'},
  ],propertyId)).toMatchObject({stage:'placed_part_received',netReceivedMilli:'1000'});
 });
 it('never mutates original order, receipt or request history',()=>{
  const beforeR=requests.map(x=>({...x}));
  const beforeO=orders.map(x=>({...x}));
  const beforeL=lines.map(x=>({...x}));
  const beforeT=received.map(x=>({...x}));
  review('approved-placed');
  approvedRequestsWithoutLinkedOrders(
   purchaseRequestAttention(requests,items,works,propertyId,'2026-10-27'),
   orders,lines,received,propertyId,
  );
  expect(requests).toEqual(beforeR);
  expect(orders).toEqual(beforeO);
  expect(lines).toEqual(beforeL);
  expect(received).toEqual(beforeT);
 });
});
