import {describe,it,expect} from 'vitest';
import {siteRepeatRepairAlerts} from '../../src/lib/site-repeat-repairs';
import type {WorkOrder} from '../../src/lib/operations-domain';
const work=[
 {id:'1',property_id:'park',site_id:'88',category:'Plumbing',status:'closed',requested_on:'2026-03-01'},
 {id:'2',property_id:'park',site_id:'88',category:' plumbing ',status:'completed',requested_on:'2026-07-01'},
 {id:'3',property_id:'park',site_id:'88',category:'PLUMBING',status:'in_progress',requested_on:'2026-10-20'},
 {id:'4',property_id:'park',site_id:'88',category:'plumbing',status:'cancelled',requested_on:'2026-10-21'},
 {id:'5',property_id:'park',site_id:'89',category:'plumbing',status:'closed',requested_on:'2026-10-20'},
 {id:'6',property_id:'other',site_id:'88',category:'plumbing',status:'closed',requested_on:'2026-10-20'},
 {id:'7',property_id:'park',site_id:'88',category:'plumbing',status:'closed',requested_on:'2024-10-20'},
] as WorkOrder[];
describe('site repeat repair alerts',()=>{
 it('flags 3 real non-cancelled repairs in the same category within the lookback window',()=>{
  expect(siteRepeatRepairAlerts(work,'park','88','2025-10-26')).toEqual([
   {category:'plumbing',count:3,latest:'2026-10-20'},
  ]);
 });
 it('does not confuse neighboring spaces or inaccessible properties',()=>{
  expect(siteRepeatRepairAlerts(work,'park','89','2025-10-26')).toEqual([]);
  expect(siteRepeatRepairAlerts(work,'other','88','2025-10-26')).toEqual([]);
 });
});