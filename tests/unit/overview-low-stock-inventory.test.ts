import {describe,it,expect} from 'vitest';
import {lowStockInventory,lowStockInventoryLink} from '../../src/lib/low-stock-inventory';
import {quantity} from '../../src/lib/operations-domain';
import type {InventoryItem,OperationsSnapshot} from '../../src/lib/operations-domain';

const items=[
 {id:'brooms-a',property_id:'park-a',name:'Brooms',sku:'BR-2',archived:false,
  reorder_milli:'2000',restock_milli:'6000',unit:'each'},
 {id:'bags-a',property_id:'park-a',name:'Trash bags',sku:'BAG-1',archived:false,
  reorder_milli:'5000',restock_milli:'12000',unit:'rolls'},
 {id:'soap-a',property_id:'park-a',name:'Soap',sku:'SOAP-3',archived:false,
  reorder_milli:'1000',restock_milli:'4000',unit:'liters'},
 {id:'gloves-b',property_id:'park-b',name:'Gloves',sku:'G-4',archived:false,
  reorder_milli:'2000',restock_milli:'9000',unit:'boxes'},
 {id:'archived-a',property_id:'park-a',name:'Archived item',sku:'OLD',archived:true,
  reorder_milli:'3000',restock_milli:'5000',unit:'boxes'},
] as InventoryItem[];
const balances=[
 {id:'brooms-a',quantity_milli:'0',last_purchase_on:null},
 {id:'bags-a',quantity_milli:'5000',last_purchase_on:null},
 {id:'soap-a',quantity_milli:'1500',last_purchase_on:null},
 {id:'gloves-b',quantity_milli:'-1000',last_purchase_on:null},
 {id:'archived-a',quantity_milli:'0',last_purchase_on:null},
] as OperationsSnapshot['summary']['stock'];

describe('overview low-stock handoff',()=>{
 it('detects shortages at OR BELOW recorded reorder thresholds, leaving healthy and archived supplies out',()=>{
  const rows=lowStockInventory(items,balances,['park-a']);
  expect(rows.map(row=>row.item.id)).toEqual(['brooms-a','bags-a']);
  expect(rows[0]).toMatchObject({availableMilli:'0',suggestedMilli:'6000',outOfStock:true});
  expect(rows[1]).toMatchObject({availableMilli:'5000',suggestedMilli:'7000',outOfStock:false});
  expect(rows.every(row=>row.item.property_id==='park-a')).toBe(true);
 });
 it('allows cross-property overview only for explicitly authorized properties',()=>{
  const rows=lowStockInventory(items,balances,['park-a','park-b']);
  expect(rows.map(row=>row.item.id)).toEqual(['brooms-a','gloves-b','bags-a']);
  expect(rows.find(row=>row.item.id==='gloves-b')).toMatchObject({
   availableMilli:'-1000',suggestedMilli:'10000',outOfStock:true,
  });
  expect(lowStockInventory(items,balances,['park-b']).map(row=>row.item.id)).toEqual(['gloves-b']);
  expect(lowStockInventory(items,balances,[])).toEqual([]);
  expect(lowStockInventory(items,balances,['unknown'])).toEqual([]);
 });
 it('uses the same inventory stock-movement fallback of zero and never recommends negative ordering',()=>{
  const changed=items.slice(0,1).map(item=>({...item,restock_milli:'0',reorder_milli:'0'}));
  expect(lowStockInventory(changed,[],['park-a'])).toMatchObject([{
   availableMilli:'0',suggestedMilli:'0',outOfStock:true,
  }]);
  expect(quantity('1250')).toBe('1.25');
  expect(quantity('-500')).toBe('-0.5');
 });
 it('sends an inventory-only low-stock flag while preserving exact encoded organization and property IDs',()=>{
  const href=lowStockInventoryLink('org&role=admin','park-a&stock=all');
  const u=new URL(href,'https://forgeos.test');
  expect(u.pathname).toBe('/inventory');
  expect(u.searchParams.get('organization')).toBe('org&role=admin');
  expect(u.searchParams.get('property')).toBe('park-a&stock=all');
  expect(u.searchParams.get('stock')).toBe('low');
  expect(u.searchParams.getAll('stock')).toEqual(['low']);
  for(const forbidden of ['site','resident','customer','stay','phone','payment','invoice','order','quantity'])
   expect(u.searchParams.has(forbidden)).toBe(false);
 });
 it('preserves source records and stock ledger summaries after calculating shortages',()=>{
  const itemIds=items.map(item=>item.id),bal=balances.map(row=>({...row}));
  lowStockInventory(items,balances,['park-a','park-b']);
  expect(items.map(item=>item.id)).toEqual(itemIds);
  expect(balances).toEqual(bal);
 });
});
