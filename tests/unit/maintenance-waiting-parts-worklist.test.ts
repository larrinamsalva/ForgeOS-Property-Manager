import {describe,it,expect} from 'vitest';
import {maintenanceWaitingPartsWorklist} from '../../src/lib/maintenance-waiting-parts-worklist';
import {filterWaitingPartsRows} from '../../src/lib/waiting-parts-handoff-review';
import {waitingPartsHandoff} from '../../src/lib/waiting-parts-handoff';
import type {
 WorkOrder,PurchaseRequest,InventoryItem,PurchaseOrder,PurchaseLine,OperationsSnapshot,
} from '../../src/lib/operations-domain';

const clock=new Date('2026-10-27T21:00:00Z');
function work(id:string,changes:Record<string,unknown>={}):WorkOrder{
 return {
  id,property_id:'park-a',organization_id:'org',status:'waiting_parts',
  number:'W-'+id,title:'Repair '+id,description:'Private customer detail',category:'plumbing',
  priority:'normal',due_on:'2026-10-25',assigned_to:'technician-a',site_id:'space-3',
  ...changes,
 } as unknown as WorkOrder;
}
function request(id:string,work_order_id:string,status:'open'|'approved'|'ordered'='open'):PurchaseRequest{
 return {id,work_order_id,property_id:'park-a',item_id:'pipe',
  needed_on:'2026-10-26',status,quantity_milli:'3000'} as PurchaseRequest;
}
function order(id:string,date:string):PurchaseOrder{
 return {id,property_id:'park-a',status:'ordered',number:'PO-'+id,
  expected_on:date,supplier_snapshot:{name:'Supplier'}} as PurchaseOrder;
}
function line(id:string,requestId:string,orderId:string):PurchaseLine{
 return {id,property_id:'park-a',item_id:'pipe',request_id:requestId,
  purchase_order_id:orderId,quantity_milli:'5000',
  item_snapshot:{name:'Pipe',sku:'P-1',unit:'each'}} as PurchaseLine;
}
const items=[{id:'pipe',property_id:'park-a',name:'Pipe',unit:'each'}] as InventoryItem[];
const balance:OperationsSnapshot['summary']['stock']=[{id:'pipe',quantity_milli:'0',last_purchase_on:null}];
const orders=[order('late','2026-10-22')];
const lines=[line('line-1','needs-delivery','late')];
const receipts:OperationsSnapshot['summary']['purchase_lines']=[{id:'line-1',received_milli:'1000'}];
const requests=[
 request('needs-delivery','late-repair','ordered'),
 request('awaiting-review','open-repair','open'),
 request('other-request','other-repair','approved'),
];
const works=[
 work('unrequested',{priority:'urgent'}),
 work('open-repair'),
 work('late-repair'),
 work('other-repair'),
 work('completed',{status:'completed'}),
 work('unrequested',{property_id:'park-b',title:'Another property with matching ID'}),
];
const park=[{id:'park-a',timezone:'America/Los_Angeles'}];
const handoff=()=>waitingPartsHandoff(works,requests,items,balance,orders,lines,receipts,park,clock,100).rows;
const ids=(rows:WorkOrder[])=>rows.map(w=>w.id);

describe('Maintenance worklist waiting-for-parts blocker review',()=>{
 it('preserves #174 authoritative blocker ranking for the currently visible waiting repairs',()=>{
  const backlog=handoff();
  expect(backlog.map(r=>r.work.id)).toEqual(['late-repair','unrequested','open-repair','other-repair']);
  const selected=works.filter(w=>w.property_id==='park-a');
  expect(ids(maintenanceWaitingPartsWorklist(selected,backlog,'all')))
   .toEqual(['late-repair','unrequested','open-repair','other-repair']);
  expect(ids(maintenanceWaitingPartsWorklist(selected,backlog,'no_request')))
   .toEqual(['unrequested']);
  expect(ids(maintenanceWaitingPartsWorklist(selected,backlog,'delivery_attention')))
   .toEqual(['late-repair']);
  expect(ids(maintenanceWaitingPartsWorklist(selected,backlog,'awaiting_decision')))
   .toEqual(['open-repair']);
  expect(ids(maintenanceWaitingPartsWorklist(selected,backlog,'purchasing_review')))
   .toEqual(['other-repair']);
 });
 it('uses the intersection with existing site, employee, search, status and triage filters',()=>{
  const backlog=handoff();
  const siteResults=[works[3],works[0]];
  expect(ids(maintenanceWaitingPartsWorklist(siteResults,backlog,'all')))
   .toEqual(['unrequested','other-repair']);
  expect(maintenanceWaitingPartsWorklist([works[1]],backlog,'delivery_attention'))
   .toEqual([]);
  expect(maintenanceWaitingPartsWorklist([],backlog,'all')).toEqual([]);
  expect(ids(maintenanceWaitingPartsWorklist([works[0],works[4]],backlog,'all')))
   .toEqual(['unrequested']); // already-completed repairs must not be shown
 });
 it('never exposes another property even if a work ID is identical',()=>{
  const foreign=works[5];
  const local=works[0];
  const backlog=handoff();
  expect(ids(maintenanceWaitingPartsWorklist([foreign],backlog,'all'))).toEqual([]);
  expect(ids(maintenanceWaitingPartsWorklist([foreign,local],backlog,'all')))
   .toEqual(['unrequested']);
  expect(filterWaitingPartsRows(backlog,'no_request','park-b','')).toEqual([]);
 });
 it('shows only linked placed and partially received orders for that repair',()=>{
  const late=handoff().find(row=>row.work.id==='late-repair')!;
  expect(late.reason).toBe('late_linked_delivery');
  expect(late.outstandingPlacedOrderCount).toBe(1);
  expect(late.lateOrderCount).toBe(1);
  expect(late.linkedRequestCount).toBe(1);
 });
 it('does not mutate source lists or generate supply requests as a side effect',()=>{
  const worksBefore=works.map(w=>({...w}));
  const requestsBefore=requests.map(q=>({...q}));
  const result=maintenanceWaitingPartsWorklist(works,handoff(),'all');
  expect(result).toHaveLength(4);
  expect(works).toEqual(worksBefore);
  expect(requests).toEqual(requestsBefore);
 });
});
