import {describe,it,expect} from 'vitest';
import {maintenanceSpendingTrends} from '../../src/lib/maintenance-spending-trends';
import type {WorkCost,WorkOrder} from '../../src/lib/operations-domain';
describe('maintenance expense trend isolation',()=>{
 const work=[
  {id:'w1',property_id:'park',site_id:'88',category:'Plumbing'},
  {id:'w2',property_id:'park',site_id:null,category:'Cleaning'},
  {id:'w3',property_id:'other',site_id:'4',category:'Plumbing'},
 ] as WorkOrder[];
 const costs=[
  {property_id:'park',work_order_id:'w1',kind:'expense',amount_cents:'12000',created_at:'2026-10-02T12:00:00Z'},
  {property_id:'park',work_order_id:'w1',kind:'estimate',amount_cents:'90000',created_at:'2026-10-02T12:00:00Z'},
  {property_id:'park',work_order_id:'w2',kind:'expense',amount_cents:'1500',created_at:'2026-10-04T12:00:00Z'},
  {property_id:'other',work_order_id:'w3',kind:'expense',amount_cents:'900000',created_at:'2026-10-02T12:00:00Z'},
  {property_id:'park',work_order_id:'w3',kind:'expense',amount_cents:'70000',created_at:'2026-10-02T12:00:00Z'},
 ] as WorkCost[];
 it('groups only authorized actual expense entries, ignoring estimates and mismatched work owners',()=>{
  expect(maintenanceSpendingTrends(work,costs,['park'],'2026-01-01')).toEqual({
   monthly:[{key:'park|2026-10',amountCents:'13500'}],
   categories:[{key:'park|Plumbing',amountCents:'12000'},{key:'park|Cleaning',amountCents:'1500'}],
   sites:[{key:'park|88',amountCents:'12000'}],
  });
 });
 it('honors inclusive date boundaries and does not include out-of-period expense entries',()=>{
  expect(maintenanceSpendingTrends(work,costs,['park'],'2026-11-01','2026-11-30')).toEqual({monthly:[],categories:[],sites:[]});
  expect(maintenanceSpendingTrends(work,costs,['park'],'2026-10-02','2026-10-02')).toEqual({
   monthly:[{key:'park|2026-10',amountCents:'12000'}],
   categories:[{key:'park|Plumbing',amountCents:'12000'}],
   sites:[{key:'park|88',amountCents:'12000'}],
  });
 });
 it('hides unauthorized property records',()=>{
  expect(maintenanceSpendingTrends(work,costs,[],'2026-01-01')).toEqual({monthly:[],categories:[],sites:[]});
 });
});