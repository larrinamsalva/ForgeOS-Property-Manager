import {describe,it,expect} from 'vitest';
import {waitingPartsHandoff,waitingPartsReasonLabels} from '../../src/lib/waiting-parts-handoff';
import type {WorkOrder,PurchaseRequest,InventoryItem,PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

function repair(id:string,property_id='park-west',changes:Record<string,unknown>={}):WorkOrder{
 return {id,property_id,status:'waiting_parts',number:'R-'+id,
  title:'Repair '+id,priority:'normal',due_on:'2026-10-31',site_id:'space-1',
  created_at:'2026-10-27T00:00:00Z',...changes} as unknown as WorkOrder;
}
function request(id:string,work_order_id:string,status:PurchaseRequest['status'],changes:Record<string,unknown>={}):PurchaseRequest{
 return {id,property_id:'park-west',organization_id:'org',item_id:'valve',
  work_order_id,status,needed_on:'2026-10-31',quantity_milli:'2000',
  ...changes} as unknown as PurchaseRequest;
}
function order(id:string,expected_on:string|null,changes:Record<string,unknown>={}):PurchaseOrder{
 return {id,property_id:'park-west',organization_id:'org',number:'PO-'+id,
  status:'ordered',expected_on,
  supplier_snapshot:{name:'Supplier',contact:'',email:'',phone:'',address:''},
  ...changes} as unknown as PurchaseOrder;
}
function line(id:string,purchase_order_id:string,request_id:string,changes:Record<string,unknown>={}):PurchaseLine{
 return {id,property_id:'park-west',organization_id:'org',
  item_id:'valve',purchase_order_id,request_id,quantity_milli:'3000',
  item_snapshot:{name:'Valve',sku:'V-1',unit:'each'},...changes} as unknown as PurchaseLine;
}
const props=[{id:'park-west',timezone:'America/Los_Angeles'},{id:'park-east',timezone:'America/New_York'}];
const now=new Date('2026-11-01T06:30:00Z');
const works=[
 repair('no-request','park-west',{priority:'urgent',due_on:'2026-10-29'}),
 repair('open-request'),
 repair('late-order'),
 repair('no-eta'),
 repair('approved-no-order'),
 repair('future-order'),
 repair('fulfilled'),
 repair('declined'),
 repair('same-id-east','park-east',{due_on:'2026-11-01'}),
 repair('unrelated-park','secret-park'),
 repair('already-done','park-west',{status:'completed'}),
];
const requests=[
 request('open','open-request','open'),
 request('late','late-order','ordered'),
 request('noeta','no-eta','ordered'),
 request('approved','approved-no-order','approved'),
 request('future','future-order','ordered'),
 request('fulfilled','fulfilled','fulfilled'),
 request('declined','declined','declined'),
 request('secret-request','unrelated-park','open',{property_id:'secret-park'}),
 request('other-property','no-request','ordered',{property_id:'park-east'}),
];
const items=[{id:'valve',property_id:'park-west',name:'Valve',sku:'V-1',
  unit:'each',archived:false} as InventoryItem];
const stock:OperationsSnapshot['summary']['stock']=[{id:'valve',quantity_milli:'1200',last_purchase_on:null}];
const orders=[
 order('late','2026-10-28'),
 order('noeta',null),
 order('future','2026-11-10'),
 order('unplaced','2026-10-20',{status:'approved'}),
 order('foreign','2026-10-19',{property_id:'secret-park'}),
];
const lines=[
 line('late-a','late','late'),
 line('late-b','late','late',{quantity_milli:'1000'}),
 line('none','noeta','noeta'),
 line('future','future','future'),
 line('wrong-request','late','other-repair-request'),
 line('wrong-item','late','late',{item_id:'wrong'}),
 line('unplaced','unplaced','approved'),
 line('foreign','foreign','late',{property_id:'secret-park'}),
];
const receipts:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'late-a',received_milli:'1000'},
];
function handoff(limit=30,allowed=props){
 return waitingPartsHandoff(works,requests,items,stock,orders,lines,receipts,allowed,now,limit);
}
describe('property-wide waiting-for-parts manager handoff',()=>{
 it('classifies exact structured requests and recorded placed-order blockers without guessing from notes',()=>{
  const rows=handoff().rows;
  const reasons=Object.fromEntries(rows.map(row=>[row.work.id,row.reason]));
  expect(reasons).toMatchObject({
   'no-request':'no_structured_request',
   'open-request':'open_request',
   'late-order':'late_linked_delivery',
   'no-eta':'missing_eta',
   'approved-no-order':'purchasing_review',
   'future-order':'awaiting_linked_delivery',
   'fulfilled':'verify_parts',
   'declined':'no_active_request',
  });
  expect(reasons['already-done']).toBeUndefined();
  expect(reasons['unrelated-park']).toBeUndefined();
  expect(rows).toHaveLength(9);
 });
 it('sorts delayed deliveries and missing requests ahead of routine waiting jobs',()=>{
  const rows=handoff().rows;
  expect(rows[0].work.id).toBe('late-order');
  expect(rows[1].work.id).toBe('no-request');
  expect(rows.find(r=>r.work.id==='open-request')!.reason).toBe('open_request');
  expect(waitingPartsReasonLabels[rows[0].reason]).toBe('Linked delivery past expected date');
 });
 it('deduplicates multi-line placed orders and reports only net outstanding orders',()=>{
  const late=handoff().rows.find(row=>row.work.id==='late-order')!;
  expect(late.outstandingPlacedOrderCount).toBe(1);
  expect(late.lateOrderCount).toBe(1);
  expect(late.noEtaOrderCount).toBe(0);
  expect(late.linkedRequestCount).toBe(1);
  expect(late.hasRecordedOnHand).toBe(true);
  const noeta=handoff().rows.find(row=>row.work.id==='no-eta')!;
  expect(noeta.noEtaOrderCount).toBe(1);
  expect(noeta.lateOrderCount).toBe(0);
 });
 it('never treats an approved draft, another repair\'s line or another property as deliveries',()=>{
  const open=handoff().rows.find(row=>row.work.id==='open-request')!;
  const approved=handoff().rows.find(row=>row.work.id==='approved-no-order')!;
  expect(open.outstandingPlacedOrderCount).toBe(0); // no exact request ID link
  expect(approved.outstandingPlacedOrderCount).toBe(0);
  expect(approved.reason).toBe('purchasing_review');
  expect(handoff(30,[props[0]]).rows.every(row=>row.work.property_id==='park-west')).toBe(true);
  expect(handoff(30,[props[1]]).rows.map(row=>row.work.id)).toEqual(['same-id-east']);
  expect(handoff(30,[])).toEqual({total:0,rows:[]});
 });
 it('checks each authorized park\'s own calendar day during daylight saving change',()=>{
  const rows=handoff().rows;
  expect(rows.find(r=>r.work.id==='no-request')!.propertyToday).toBe('2026-10-31');
  expect(rows.find(r=>r.work.id==='same-id-east')!.propertyToday).toBe('2026-11-01');
  expect(rows.find(r=>r.work.id==='same-id-east')!.reason).toBe('no_structured_request');
 });
 it('flags needed-by dates per authorized property without mistaking placed orders for delivery',()=>{
  const changed=[
   ...requests.filter(row=>!['open','approved','fulfilled','declined'].includes(row.id)),
   request('open','open-request','open',{needed_on:'2026-10-30'}),
   request('approved','approved-no-order','approved',{needed_on:'2026-10-31'}),
   request('fulfilled','fulfilled','fulfilled',{needed_on:'2026-10-25'}),
   request('declined','declined','declined',{needed_on:'2026-10-25'}),
   request('east-needed','same-id-east','open',{property_id:'park-east',needed_on:'2026-10-31'}),
  ];
  const rows=waitingPartsHandoff(
   works,changed,items,stock,orders,lines,receipts,props,now,30,
  ).rows;
  const find=(id:string)=>rows.find(row=>row.work.id===id)!;
  expect(find('open-request')).toMatchObject({
   reason:'open_request',propertyToday:'2026-10-31',
   overdueRequestCount:1,dueTodayRequestCount:0,
   earliestActiveNeededOn:'2026-10-30',
  });
  expect(find('approved-no-order')).toMatchObject({
   overdueRequestCount:0,dueTodayRequestCount:1,
   earliestActiveNeededOn:'2026-10-31',
  });
  expect(find('same-id-east')).toMatchObject({
   propertyToday:'2026-11-01',overdueRequestCount:1,dueTodayRequestCount:0,
  });
  expect(find('fulfilled').overdueRequestCount).toBe(0);
  expect(find('declined').overdueRequestCount).toBe(0);
  // An expired *request* deadline and supplier ETA are independently recorded.
  expect(find('late-order').lateOrderCount).toBe(1);
  expect(find('late-order').dueTodayRequestCount).toBe(1);
 });
 it('ignores empty or malformed required dates and counts multiple still-active requests once each',()=>{
  const records=[
   request('need-one','open-request','open',{needed_on:'2026-10-01'}),
   request('need-two','open-request','approved',{needed_on:'2026-10-25'}),
   request('blank','open-request','ordered',{needed_on:''}),
   request('malformed','open-request','open',{needed_on:'01/01/2026'}),
   request('cancelled','open-request','cancelled',{needed_on:'2026-10-01'}),
   request('due-today','open-request','ordered',{needed_on:'2026-10-31'}),
  ];
  const rows=waitingPartsHandoff(
   works,records,items,stock,orders,lines,receipts,props,now,30,
  ).rows;
  const review=rows.find(row=>row.work.id==='open-request')!;
  expect(review.overdueRequestCount).toBe(2);
  expect(review.dueTodayRequestCount).toBe(1);
  expect(review.earliestActiveNeededOn).toBe('2026-10-01');
  expect(review.openRequestCount).toBe(3);
 });
 it('retains full backlog size when display is limited and never mutates input records',()=>{
  const workIds=works.map(w=>w.id);
  const requestIds=requests.map(x=>x.id);
  const linesBefore=lines.map(x=>({...x}));
  const q=handoff(3);
  expect(q.total).toBe(9);
  expect(q.rows).toHaveLength(3);
  expect(handoff(0).rows).toEqual([]);
  expect(works.map(w=>w.id)).toEqual(workIds);
  expect(requests.map(x=>x.id)).toEqual(requestIds);
  expect(lines).toEqual(linesBefore);
 });
});
