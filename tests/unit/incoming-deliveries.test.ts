import {describe,it,expect} from 'vitest';
import {incomingDeliveryLines,incomingDeliveriesLink} from '../../src/lib/incoming-deliveries';
import type {PurchaseOrder,PurchaseLine,OperationsSnapshot} from '../../src/lib/operations-domain';

const moment=new Date('2026-11-01T06:30:00Z');
const properties=[
 {id:'west',timezone:'America/Los_Angeles'},
 {id:'east',timezone:'America/New_York'},
];
function order(id:string,extra:Record<string,unknown>={}):PurchaseOrder{
 return {
  id,property_id:'west',organization_id:'org',status:'ordered',
  expected_on:'2026-10-30',number:'PO-'+id,
  supplier_snapshot:{name:'Supplier',contact:'',email:'',phone:'',address:''},
  ...extra,
 } as unknown as PurchaseOrder;
}
function line(id:string,purchase_order_id:string,extra:Record<string,unknown>={}):PurchaseLine{
 return {
  id,purchase_order_id,property_id:'west',organization_id:'org',item_id:id,
  quantity_milli:'10000',
  item_snapshot:{sku:'SKU-'+id,name:'Item '+id,unit:'boxes'},
  ...extra,
 } as unknown as PurchaseLine;
}
const orders=[
 order('late'),
 order('today',{expected_on:'2026-10-31'}),
 order('future',{expected_on:'2026-11-05'}),
 order('noeta',{expected_on:null}),
 order('east',{property_id:'east',expected_on:'2026-10-31'}),
 order('approved',{status:'approved'}),
 order('draft',{status:'draft'}),
 order('cancelled',{status:'cancelled'}),
 order('other',{property_id:'secret'}),
];
const lines=[
 line('late-partial','late'),
 line('today-empty','today'),
 line('future-negative','future'),
 line('noeta','noeta'),
 line('east-late','east',{property_id:'east'}),
 line('late-done','late'),
 line('late-overreceived','late'),
 line('approved','approved'),
 line('draft','draft'),
 line('cancelled','cancelled'),
 line('unauthorized','other',{property_id:'secret'}),
 line('wrong-property','late',{property_id:'east'}),
 line('zero','late',{quantity_milli:'0'}),
];
const received:OperationsSnapshot['summary']['purchase_lines']=[
 {id:'late-partial',received_milli:'2500'},
 {id:'late-done',received_milli:'10000'},
 {id:'late-overreceived',received_milli:'11000'},
 {id:'future-negative',received_milli:'-500'},
];
const list=(props=properties)=>incomingDeliveryLines(orders,lines,received,props,moment);
describe('incoming supplier delivery tracking',()=>{
 it('shows only ordered, outstanding purchase lines and sorts past-due first',()=>{
  const items=list();
  expect(items.map(row=>row.line.id)).toEqual([
   'east-late','late-partial','today-empty','future-negative','noeta',
  ]);
  expect(items.map(row=>row.eta)).toEqual([
   'overdue','overdue','due_today','upcoming','not_scheduled',
  ]);
  expect(items.every(row=>row.order.status==='ordered')).toBe(true);
 });
 it('subtracts exact recorded net receipts and excludes fully received or overreceived lines',()=>{
  const items=list();
  expect(items.find(row=>row.line.id==='late-partial')).toMatchObject({
   netReceivedMilli:'2500',outstandingMilli:'7500',
  });
  expect(items.find(row=>row.line.id==='today-empty')).toMatchObject({
   netReceivedMilli:'0',outstandingMilli:'10000',
  });
  expect(items.find(row=>row.line.id==='future-negative')).toMatchObject({
   netReceivedMilli:'0',outstandingMilli:'10000',
  });
  expect(items.find(row=>row.line.id==='late-done')).toBeUndefined();
  expect(items.find(row=>row.line.id==='late-overreceived')).toBeUndefined();
 });
 it('uses each property local date across the daylight saving boundary',()=>{
  const items=list();
  const west=items.find(x=>x.line.id==='today-empty')!;
  const east=items.find(x=>x.line.id==='east-late')!;
  expect(west.propertyToday).toBe('2026-10-31');
  expect(east.propertyToday).toBe('2026-11-01');
  expect(west.eta).toBe('due_today');
  expect(east.eta).toBe('overdue');
 });
 it('does not mix properties or leak records from unlisted authorized scopes',()=>{
  expect(list([properties[0]]).every(row=>row.order.property_id==='west')).toBe(true);
  expect(list([properties[1]]).map(row=>row.line.id)).toEqual(['east-late']);
  expect(list([])).toEqual([]);
  expect(list().map(row=>row.line.id)).not.toContain('wrong-property');
  expect(list().map(row=>row.line.id)).not.toContain('unauthorized');
 });
 it('excludes draft, approved and cancelled purchase orders until placed',()=>{
  const ids=list().map(x=>x.line.id);
  for(const id of ['approved','draft','cancelled','zero'])expect(ids).not.toContain(id);
 });
 it('handles quantities beyond JavaScript safe integer limits without rounding',()=>{
  const bigLine=[line('big','late',{quantity_milli:'9007199254740997000'})];
  const net=[{id:'big',received_milli:'1000'}];
  const value=incomingDeliveryLines(orders,bigLine,net,properties,moment);
  expect(value).toHaveLength(1);
  expect(value[0].outstandingMilli).toBe('9007199254740996000');
 });
 it('builds only the authorized Inventory tab navigation context, never private customer data',()=>{
  const u=new URL(incomingDeliveriesLink('org&role=admin','west&view=stock'),'https://example.test');
  expect(u.pathname).toBe('/inventory');
  expect(u.searchParams.get('organization')).toBe('org&role=admin');
  expect(u.searchParams.get('property')).toBe('west&view=stock');
  expect(u.searchParams.getAll('view')).toEqual(['incoming']);
  for(const key of ['customer','resident','stay','contact','phone','payment','invoice','supplier','order','receipt','stock'])
   expect(u.searchParams.has(key)).toBe(false);
 });
 it('does not mutate any retained order, receipt or property data',()=>{
  const first=orders.map(x=>({...x}));
  const second=lines.map(x=>({...x}));
  const third=received.map(x=>({...x}));
  const prop=properties.map(x=>({...x}));
  list();
  expect(orders).toEqual(first);
  expect(lines).toEqual(second);
  expect(received).toEqual(third);
  expect(properties).toEqual(prop);
 });
});
