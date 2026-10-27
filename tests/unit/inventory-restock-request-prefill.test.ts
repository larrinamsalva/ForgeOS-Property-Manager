import {describe,it,expect} from 'vitest';
import {suggestedRestockRequest} from '../../src/lib/low-stock-inventory';
import {quantity,quantityToMilli} from '../../src/lib/operations-domain';
import type {InventoryItem,OperationsSnapshot} from '../../src/lib/operations-domain';

function supply(id:string,changes:Partial<InventoryItem>={}):InventoryItem{
 return {
  id,property_id:'park-a',archived:false,restock_milli:'12000',reorder_milli:'4000',
  unit:'boxes',sku:id,name:id,category:'supplies',location:'storage',
  supplier_id:null,unit_cost_cents:'100',notes:'',
  ...changes,
 } as InventoryItem;
}
const items=[
 supply('exact-threshold'),
 supply('out-of-stock'),
 supply('healthy'),
 supply('another-property',{property_id:'park-b'}),
 supply('archived',{archived:true}),
 supply('no-refill',{restock_milli:'2000'}),
 supply('fractional',{reorder_milli:'2000',restock_milli:'2250'}),
];
const balances:OperationsSnapshot['summary']['stock']=[
 {id:'exact-threshold',quantity_milli:'4000',last_purchase_on:null},
 {id:'out-of-stock',quantity_milli:'-500',last_purchase_on:null},
 {id:'healthy',quantity_milli:'7000',last_purchase_on:null},
 {id:'another-property',quantity_milli:'0',last_purchase_on:null},
 {id:'archived',quantity_milli:'0',last_purchase_on:null},
 {id:'no-refill',quantity_milli:'3000',last_purchase_on:null},
 {id:'fractional',quantity_milli:'1500',last_purchase_on:null},
];
const select=(id:string,propertyId='park-a')=>suggestedRestockRequest(items,balances,propertyId,id);

describe('inventory purchase-request suggestion prefill',()=>{
 it('prefills the authorized exact item with a positive restock-target difference',()=>{
  expect(select('exact-threshold')).toEqual({itemId:'exact-threshold',quantityMilli:'8000'});
  expect(quantity(select('exact-threshold')!.quantityMilli)).toBe('8');
  expect(select('out-of-stock')).toEqual({itemId:'out-of-stock',quantityMilli:'12500'});
  expect(quantity(select('out-of-stock')!.quantityMilli)).toBe('12.5');
 });
 it('keeps three-place quantity precision for editable forms',()=>{
  const fractional=select('fractional');
  expect(fractional).toEqual({itemId:'fractional',quantityMilli:'750'});
  expect(quantity(fractional!.quantityMilli)).toBe('0.75');
  expect(quantityToMilli(quantity(fractional!.quantityMilli))).toBe(fractional!.quantityMilli);
 });
 it('never defaults unrelated, cross-property, archived or currently healthy items',()=>{
  for(const id of ['healthy','archived','another-property','missing','']){
   expect(select(id)).toBeUndefined();
  }
  expect(select('exact-threshold','park-b')).toBeUndefined();
  expect(select('another-property','park-b')).toEqual({
   itemId:'another-property',quantityMilli:'12000',
  });
  expect(suggestedRestockRequest(items,balances,'park-a',undefined)).toBeUndefined();
  expect(suggestedRestockRequest(items,balances,'','exact-threshold')).toBeUndefined();
 });
 it('does not generate a zero or negative requested quantity when the restock target is too low',()=>{
  expect(select('no-refill')).toBeUndefined();
  const targetZero=[supply('zero-target',{restock_milli:'0',reorder_milli:'0'})];
  expect(suggestedRestockRequest(targetZero,[], 'park-a','zero-target')).toBeUndefined();
 });
 it('uses a zero balance when no stock movement summary is recorded',()=>{
  const item=[supply('brand-new')];
  expect(suggestedRestockRequest(item,[], 'park-a','brand-new'))
   .toEqual({itemId:'brand-new',quantityMilli:'12000'});
 });
 it('does not mutate item records or stock summaries and never submits a purchase on its own',()=>{
  const beforeItems=items.map(i=>({...i}));
  const beforeBalances=balances.map(v=>({...v}));
  for(const item of items) select(item.id);
  expect(items).toEqual(beforeItems);
  expect(balances).toEqual(beforeBalances);
 });
});
