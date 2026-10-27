import {describe,it,expect} from 'vitest';
import {sortMeterReadingWorklist} from '../../src/lib/meter-reading-order';
import {filterMeterReadingsBySite,filterMeterReadingsByUtility,filterMeterReadingWorklist} from '../../src/lib/meter-reading-worklist';
import type {MeterAssignment,MeterReading,MeterReview,Meter} from '../../src/lib/meter-domain';

const assignments=[
 {id:'a10',site_id:'site-10',site_label:'Space 10'},
 {id:'a2',site_id:'site-2',site_label:'Space 2'},
 {id:'a2old',site_id:'site-2',site_label:'Space 2'},
 {id:'a2other',site_id:'site-other',site_label:'Space 2'},
] as MeterAssignment[];
function capture(id:string,assignment_id:string,meter_id:string,captured_at:string):MeterReading{
 return {id,organization_id:'org',property_id:'park',route_item_id:'stop',
  assignment_id,meter_id,captured_at,captured_by:'reader',value:'100',
  flag:'none',kind:'actual',notes:'',exceptions:[],created_at:captured_at};
}
const captures=[
 capture('newest','a10','water','2026-10-26T17:00:00Z'),
 capture('offset','a2','water','2026-10-26T08:00:00-07:00'),
 capture('oldest','a2old','electric','2026-10-26T14:00:00Z'),
 capture('duplicate-label','a2other','water','2026-10-25T14:00:00Z'),
 capture('orphan','missing-assignment','water','2026-10-27T14:00:00Z'),
];
describe('supervisor reading sort',()=>{
 it('orders by real capture instants across time zones, newest or oldest first',()=>{
  expect(sortMeterReadingWorklist(captures,assignments,'newest').map(r=>r.id))
   .toEqual(['orphan','newest','offset','oldest','duplicate-label']);
  expect(sortMeterReadingWorklist(captures,assignments,'oldest').map(r=>r.id))
   .toEqual(['duplicate-label','oldest','offset','newest','orphan']);
 });
 it('uses natural site numbers and historical assignment identity, with unknown sites last',()=>{
  expect(sortMeterReadingWorklist(captures,assignments,'site').map(r=>r.id))
   .toEqual(['offset','oldest','duplicate-label','newest','orphan']);
 });
 it('is stable for equal timestamps using reading ID without modifying captures',()=>{
  const a=capture('a','a2','water','2026-10-26T00:00:00Z');
  const b=capture('b','a2','water','2026-10-26T00:00:00Z');
  expect(sortMeterReadingWorklist([b,a],assignments,'newest').map(r=>r.id)).toEqual(['a','b']);
  expect(sortMeterReadingWorklist([b,a],assignments,'site').map(r=>r.id)).toEqual(['a','b']);
  expect(captures[0].id).toBe('newest');
 });
 it('composes with selected site, utility and attention reason without adding other readings',()=>{
  const bySite=filterMeterReadingsBySite(captures,assignments,'site-2');
  const meters=[{id:'water',utility:'water'},{id:'electric',utility:'electric'}] as Meter[];
  const water=filterMeterReadingsByUtility(bySite,meters,'water');
  const reviews=[{id:'review',reading_id:'oldest',decision:'accepted',created_at:'2026-10-26T15:00:00Z'}] as MeterReview[];
  const attention=filterMeterReadingWorklist(water,reviews,'',true);
  expect(sortMeterReadingWorklist(attention,assignments,'oldest').map(r=>r.id)).toEqual(['offset']);
  expect(water.map(r=>r.id)).toEqual(['offset']);
 });
 it('returns a new array for an empty or already sorted list',()=>{
  const original=captures.slice();
  expect(sortMeterReadingWorklist([],assignments,'site')).toEqual([]);
  expect(sortMeterReadingWorklist([captures[0]],assignments,'newest')).not.toBe(captures);
  expect(captures).toEqual(original);
 });
});
