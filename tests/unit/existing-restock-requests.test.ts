import {describe,it,expect} from 'vitest';
import {existingRestockRequests,existingRestockStatusText} from '../../src/lib/existing-restock-requests';
import type {PurchaseRequest} from '../../src/lib/operations-domain';

function request(id:string,overrides:Partial<PurchaseRequest>={}):PurchaseRequest{
 return {
  id,property_id:'park-a',item_id:'soap',status:'open',quantity_milli:'1250',
  needed_on:'2026-11-02',description:'Restock',decision_reason:'',
  work_order_id:null,organization_id:'org',created_at:'2026-10-27T00:00:00Z',
  created_by:'staff',updated_at:'2026-10-27T00:00:00Z',version:1,...overrides,
 } as PurchaseRequest;
}
const rows=[
 request('open'),
 request('approved',{status:'approved',quantity_milli:'2500'}),
 request('ordered',{status:'ordered',quantity_milli:'1000'}),
 request('declined',{status:'declined',quantity_milli:'8000'}),
 request('cancelled',{status:'cancelled',quantity_milli:'9000'}),
 request('fulfilled',{status:'fulfilled',quantity_milli:'10000'}),
 request('other-item',{item_id:'bleach',quantity_milli:'5000'}),
 request('other-property',{property_id:'park-b',quantity_milli:'20000'}),
 request('work-linked',{status:'open',quantity_milli:'750',work_order_id:'work-1'}),
];
const review=(propertyId:string,itemId:string)=>existingRestockRequests(rows,propertyId,itemId);

describe('restock request duplicate-awareness review',()=>{
 it('counts open approved and marked-ordered requests for an exact property and item',()=>{
  expect(review('park-a','soap')).toEqual({
   count:4,open:2,approved:1,ordered:1,requestedMilli:'5500',
  });
  expect(existingRestockStatusText(review('park-a','soap')))
   .toBe('2 awaiting decision · 1 approved · 1 marked ordered');
 });
 it('does not count declined cancelled or fulfilled records as unresolved',()=>{
  expect(review('park-a','soap').count).toBe(4);
  expect(existingRestockRequests(
   rows.filter(x=>['declined','cancelled','fulfilled'].includes(x.status)),'park-a','soap',
  )).toEqual({count:0,open:0,approved:0,ordered:0,requestedMilli:'0'});
 });
 it('does not mix in another property or stock item, even with a matching item label',()=>{
  expect(review('park-b','soap')).toEqual({
   count:1,open:1,approved:0,ordered:0,requestedMilli:'20000',
  });
  expect(review('park-a','bleach')).toMatchObject({count:1,requestedMilli:'5000'});
  expect(review('park-other','soap').count).toBe(0);
  expect(review('','soap').count).toBe(0);
  expect(review('park-a','').count).toBe(0);
  expect(review('park-a','missing').count).toBe(0);
 });
 it('includes requests linked to work orders because they may affect the same item restock decision',()=>{
  const matching=existingRestockRequests([rows[8]],'park-a','soap');
  expect(matching.count).toBe(1);
  expect(matching.requestedMilli).toBe('750');
 });
 it('sums milliunits exactly without truncating and avoids counting negative quantities as incoming',()=>{
  const records=[
   request('one',{quantity_milli:'1000000000000001'}),
   request('two',{status:'approved',quantity_milli:'999999999999999'}),
   request('bad',{status:'ordered',quantity_milli:'-100'}),
  ];
  expect(existingRestockRequests(records,'park-a','soap')).toMatchObject({
   count:3,requestedMilli:'2000000000000000',
  });
 });
 it('never mutates original purchasing history and emits no private customer or supplier information',()=>{
  const before=rows.map(r=>({...r}));
  const data=review('park-a','soap');
  expect(Object.keys(data).sort()).toEqual(['approved','count','open','ordered','requestedMilli'].sort());
  expect(rows).toEqual(before);
  expect(existingRestockStatusText(review('',''))).toBe('');
 });
});
