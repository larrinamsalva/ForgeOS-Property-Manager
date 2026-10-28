import {describe,it,expect} from 'vitest';
import {csv} from '../../src/lib/domain';
import {
 purchaseRequestAttention,filterPurchaseRequestAttention,
 purchaseRequestAttentionCsvRows,purchaseRequestAttentionChoices,
} from '../../src/lib/purchase-request-attention';
import type {PurchaseRequest,InventoryItem,WorkOrder} from '../../src/lib/operations-domain';

function request(id:string,needed_on:string,status:PurchaseRequest['status']='open',
 extras:Partial<PurchaseRequest>={}):PurchaseRequest{
 return {
  id,property_id:'park-a',organization_id:'org',item_id:'pipe',work_order_id:'repair-a',
  needed_on,status,quantity_milli:'1250',description:'Confidential resident details',
  decision_reason:'Private decision notes',version:1,created_at:'2026-10-27T00:00:00Z',
  updated_at:'2026-10-27T00:00:00Z',
  ...extras,
 } as PurchaseRequest;
}
const requests=[
 request('past-open','2026-10-25'),
 request('past-approved','2026-10-26','approved'),
 request('past-ordered','2026-10-24','ordered'),
 request('due','2026-10-27'),
 request('future','2026-11-01','approved'),
 request('bad','2026-02-30'),
 request('empty',''),
 request('fulfilled','2026-10-23','fulfilled'),
 request('declined','2026-10-23','declined'),
 request('cancelled','2026-10-23','cancelled'),
 request('other-park','2026-10-20','open',{property_id:'park-b'}),
 request('another-item','2026-10-27','open',{item_id:'part-in-other-park',work_order_id:'other-repair'}),
 request('nonlinked','2026-10-27','open',{work_order_id:null}),
];
const items=[
 {id:'pipe',property_id:'park-a',name:'Copper Pipe',sku:'PIPE-12',unit:'feet'} as InventoryItem,
 {id:'part-in-other-park',property_id:'park-b',name:'Private Other Item',sku:'SECRET',
  unit:'each'} as InventoryItem,
];
const works=[
 {id:'repair-a',property_id:'park-a',number:'WO-88',title:'Private repair'} as WorkOrder,
 {id:'other-repair',property_id:'park-b',number:'WO-PRIVATE',title:'Private repair'} as WorkOrder,
];
const rows=()=>purchaseRequestAttention(requests,items,works,'park-a','2026-10-27');
const ids=(filter:Parameters<typeof filterPurchaseRequestAttention>[1],search='')=>
 filterPurchaseRequestAttention(rows(),filter,search).map(row=>row.request.id);

describe('Purchasing request needed-by attention and export',()=>{
 it('shows active overdue and due-today requests independently of a placed order',()=>{
  const result=rows();
  expect(result.filter(row=>row.deadline==='overdue').map(row=>row.request.id))
   .toEqual(['past-ordered','past-open','past-approved']);
  expect(result.filter(row=>row.deadline==='due_today').map(row=>row.request.id))
   .toEqual(['another-item','due','nonlinked']);
  expect(result.find(row=>row.request.id==='past-ordered')?.deadline).toBe('overdue');
  expect(result.find(row=>row.request.id==='fulfilled')?.deadline).toBe('resolved');
 });
 it('has seven filters that compose with search without changing deadline priority',()=>{
  expect(purchaseRequestAttentionChoices).toHaveLength(7);
  expect(ids('overdue')).toEqual(['past-ordered','past-open','past-approved']);
  expect(ids('due_today')).toEqual(['another-item','due','nonlinked']);
  expect(ids('needs_decision')).toEqual(['past-open','another-item','due','nonlinked','bad','empty']);
  expect(ids('approved')).toEqual(['past-approved','future']);
  expect(ids('ordered')).toEqual(['past-ordered']);
  expect(ids('resolved')).toEqual(['fulfilled','declined','cancelled']);
  expect(ids('all','  copper PIPE ')).toContain('past-open');
  expect(ids('all','pipe-12')).toContain('past-approved');
  expect(ids('due_today','WO-88')).toEqual(['due']);
  expect(ids('all','past-open')).toEqual(['past-open']);
  expect(ids('all','Confidential resident details')).toEqual([]);
 });
 it('rejects foreign-property inventory items and repairs even with matching IDs',()=>{
  const result=rows();
  expect(result.map(row=>row.request.id)).not.toContain('other-park');
  const unmatched=result.find(row=>row.request.id==='another-item')!;
  expect(unmatched.item).toBeUndefined();
  expect(unmatched.work).toBeUndefined();
  expect(unmatched.request.item_id).toBe('part-in-other-park');
  expect(result.find(row=>row.request.id==='due')?.work?.number).toBe('WO-88');
  expect(purchaseRequestAttention(requests,items,works,'park-c','2026-10-27')).toEqual([]);
  expect(purchaseRequestAttention(requests,items,works,'','2026-10-27')).toEqual([]);
 });
 it('recognizes invalid and absent needed dates without false overdue claims',()=>{
  expect(ids('all').slice(0,6)).toEqual([
   'past-ordered','past-open','past-approved','another-item','due','nonlinked',
  ]);
  expect(rows().find(x=>x.request.id==='bad')?.deadline).toBe('no_valid_date');
  expect(rows().find(x=>x.request.id==='empty')?.deadline).toBe('no_valid_date');
  expect(purchaseRequestAttention(requests,items,works,'park-a','not-a-date')).toEqual([]);
  const leap=[
   request('leap','2028-02-29'),
   request('not-leap','2027-02-29'),
  ];
  const evaluated=purchaseRequestAttention(leap,items,works,'park-a','2028-03-01');
  expect(evaluated.find(x=>x.request.id==='leap')?.deadline).toBe('overdue');
  expect(evaluated.find(x=>x.request.id==='not-leap')?.deadline).toBe('no_valid_date');
 });
 it('does not treat fulfilled declined or cancelled requests as overdue even if dates passed',()=>{
  for(const state of ['fulfilled','declined','cancelled'] as const){
   const row=rows().find(x=>x.request.status===state)!;
   expect(row.deadline).toBe('resolved');
   expect(ids('overdue')).not.toContain(row.request.id);
  }
 });
 it('exports only the displayed rows with exact quantity and no private notes or IDs',()=>{
  const shown=filterPurchaseRequestAttention(rows(),'overdue','PIPE-12').slice(0,2);
  const exported=purchaseRequestAttentionCsvRows(shown);
  expect(exported).toHaveLength(3);
  expect(exported[0]).toContain('Requested milliunits');
  expect(exported[1]).toEqual([
   'Copper Pipe','PIPE-12','ordered','overdue','2026-10-24','1250','feet','WO-88',
  ]);
  const output=csv(exported);
  expect(output).not.toContain('past-approved');
  expect(output).not.toContain('Confidential resident details');
  expect(output).not.toContain('Private decision notes');
  expect(output).not.toContain('WO-PRIVATE');
  expect(output).not.toContain('SECRET');
  expect(purchaseRequestAttentionCsvRows([])).toHaveLength(1);
 });
 it('uses standard CSV writer to escape spreadsheet formula text safely',()=>{
  const fake=[
   {id:'evil',property_id:'park-a',name:'=HYPERLINK("evil","link")',
     sku:'+SUM(1,2)',unit:'each'} as InventoryItem,
  ];
  const one=[request('evil','2026-10-27','open',{item_id:'evil',work_order_id:null})];
  const results=purchaseRequestAttention(one,fake,[], 'park-a','2026-10-27');
  const encoded=csv(purchaseRequestAttentionCsvRows(results));
  expect(encoded).toContain(`"'=HYPERLINK(""evil"",""link"")"`);
  expect(encoded).toContain(`"'+SUM(1,2)"`);
 });
 it('preserves source data and keeps output deterministic',()=>{
  const originalRequests=requests.map(x=>({...x}));
  const originalItems=items.map(x=>({...x}));
  const first=rows().map(x=>x.request.id);
  const second=rows().map(x=>x.request.id);
  expect(first).toEqual(second);
  expect(requests).toEqual(originalRequests);
  expect(items).toEqual(originalItems);
 });
});
