import {describe,it,expect} from 'vitest';
import {linkedWorkPartReview,waitingRepairsWithoutPartRequests} from '../../src/lib/work-parts-request-review';
import {incomingDeliveryLines} from '../../src/lib/incoming-deliveries';
import type {WorkOrder,PurchaseRequest,InventoryItem,PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

const property={id:'park-a',timezone:'America/Los_Angeles'};
const work={id:'repair-1',property_id:'park-a'} as WorkOrder;
function request(id:string,extras:Record<string,unknown>={}):PurchaseRequest{
 return {id,property_id:'park-a',organization_id:'org',work_order_id:'repair-1',
  item_id:'pipe',quantity_milli:'3000',needed_on:'2026-10-28',
  description:'Repair valve',status:'approved',...extras} as PurchaseRequest;
}
function item(id:string,extras:Record<string,unknown>={}):InventoryItem{
 return {id,property_id:'park-a',organization_id:'org',name:'Pipe',sku:'P-1',
  unit:'each',archived:false,...extras} as InventoryItem;
}
function order(id:string,extras:Record<string,unknown>={}):PurchaseOrder{
 return {id,property_id:'park-a',organization_id:'org',status:'ordered',
  expected_on:'2026-10-25',number:'PO-'+id,
  supplier_snapshot:{name:'Supplier',contact:'',phone:'',email:'',address:''},
  ...extras} as PurchaseOrder;
}
function line(id:string,orderId:string,requestId:string,extras:Record<string,unknown>={}):PurchaseLine{
 return {id,organization_id:'org',property_id:'park-a',
  purchase_order_id:orderId,request_id:requestId,item_id:'pipe',
  quantity_milli:'5000',item_snapshot:{name:'Pipe',sku:'P-1',unit:'each'},
  ...extras} as PurchaseLine;
}
const requests=[
 request('requested-a'),
 request('requested-b',{needed_on:'2026-10-30',quantity_milli:'1000'}),
 request('cancelled',{status:'cancelled',item_id:'missing',needed_on:'2026-10-31'}),
 request('neighbor',{work_order_id:'repair-2'}),
 request('other-property',{property_id:'park-b'}),
];
const inventory=[item('pipe'),item('missing',{property_id:'park-b'})];
const stock:OperationsSnapshot['summary']['stock']=[{id:'pipe',quantity_milli:'1250',last_purchase_on:null}];
const orders=[
 order('late'),order('no-eta',{expected_on:null}),
 order('fully-received'),order('not-placed',{status:'approved'}),
 order('other-property',{property_id:'park-b'}),
];
const lines=[
 line('late-a','late','requested-a'),
 line('late-b','late','requested-a',{quantity_milli:'1000'}),
 line('none','no-eta','requested-b',{quantity_milli:'2000'}),
 line('received','fully-received','requested-a'),
 line('approved','not-placed','requested-a'),
 line('wrong-request','late','neighbor'),
 line('wrong-item','late','requested-a',{item_id:'wrong-part'}),
 line('wrong-property','late','requested-a',{property_id:'park-b'}),
 line('foreign','other-property','requested-a',{property_id:'park-b'}),
];
const totals:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'late-a',received_milli:'2000'},
 {id:'received',received_milli:'5000'},
];
function review(){
 const arrivals=incomingDeliveryLines(orders,lines,totals,[property],new Date('2026-10-27T17:00:00Z'));
 return linkedWorkPartReview(work,requests,inventory,stock,arrivals);
}
describe('repair parts supply and purchasing review',()=>{
 it('only shows structured requests for the exact authorized repair and property',()=>{
  const entries=review();
  expect(entries.map(x=>x.request.id)).toEqual(['requested-a','requested-b','cancelled']);
  expect(entries[0]).toMatchObject({
   onHandMilli:'1250',incomingMilli:'4000',placedOrderIds:['late'],
   overdueOrderCount:1,missingEtaOrderCount:0,
  });
  expect(entries[1]).toMatchObject({
   onHandMilli:'1250',incomingMilli:'2000',placedOrderIds:['no-eta'],
   overdueOrderCount:0,missingEtaOrderCount:1,
  });
 });
 it('never attributes similarly named, foreign-property or unlinked order lines to the repair',()=>{
  const result=review();
  expect(result[0].incomingMilli).toBe('4000');
  expect(result[0].placedOrderIds).toEqual(['late']);
  expect(result[0].request.id).toBe('requested-a');
  expect(linkedWorkPartReview({id:'repair-3',property_id:'park-a'},requests,inventory,stock,[])).toEqual([]);
  expect(linkedWorkPartReview({id:'repair-1',property_id:'park-b'},requests,inventory,stock,[]).map(r=>r.request.id)).toEqual(['other-property']);
 });
 it('returns unavailable for a missing same-property inventory item rather than claiming stock zero',()=>{
  const entry=review()[2];
  expect(entry.item).toBeUndefined();
  expect(entry.onHandMilli).toBeNull();
  expect(entry.incomingMilli).toBe('0');
  expect(entry.placedOrderIds).toEqual([]);
 });
 it('keeps the physically available stock separate from future unreceived deliveries',()=>{
  const [entry]=review();
  expect(entry.onHandMilli).toBe('1250');
  expect(entry.incomingMilli).toBe('4000');
  expect(entry.request.quantity_milli).toBe('3000');
 });
 it('counts only waiting repairs with no structured purchase request in authorized parks',()=>{
  const works=[
   {id:'repair-1',property_id:'park-a',status:'waiting_parts'},
   {id:'repair-2',property_id:'park-a',status:'waiting_parts'},
   {id:'repair-3',property_id:'park-a',status:'waiting_parts'},
   {id:'finished',property_id:'park-a',status:'completed'},
   {id:'elsewhere',property_id:'park-b',status:'waiting_parts'},
   {id:'other-status',property_id:'park-a',status:'new'},
  ] as WorkOrder[];
  expect(waitingRepairsWithoutPartRequests(works,requests,['park-a']))
   .toEqual({waiting:3,withoutRequest:1});
  expect(waitingRepairsWithoutPartRequests(works,requests,['park-b']))
   .toEqual({waiting:1,withoutRequest:1});
  expect(waitingRepairsWithoutPartRequests(works,requests,[]))
   .toEqual({waiting:0,withoutRequest:0});
 });
 it('prevents collisions when the same work order ID exists in a different property',()=>{
  const works=[
   {id:'repair-1',property_id:'park-a',status:'waiting_parts'},
   {id:'repair-1',property_id:'park-b',status:'waiting_parts'},
  ] as WorkOrder[];
  expect(waitingRepairsWithoutPartRequests(works,[requests[0]],['park-a','park-b']))
   .toEqual({waiting:2,withoutRequest:1});
 });
 it('does not mutate purchase history, on-hand balances or work records',()=>{
  const originalRequests=requests.map(x=>({...x}));
  const originalStock=stock.map(x=>({...x}));
  const originalLines=lines.map(x=>({...x}));
  review();
  expect(requests).toEqual(originalRequests);
  expect(stock).toEqual(originalStock);
  expect(lines).toEqual(originalLines);
 });
});
