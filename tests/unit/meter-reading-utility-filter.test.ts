import {describe,it,expect} from 'vitest';
import {filterMeterReadingsByUtility,filterMeterReadingsBySite,filterMeterReadingWorklist} from '../../src/lib/meter-reading-worklist';
import type {Meter, MeterAssignment, MeterReading, MeterReview} from '../../src/lib/meter-domain';

const meters=[
 {id:'electric-88',utility:'electric'}, {id:'water-88',utility:'water'},
 {id:'gas-88',utility:'gas'}, {id:'water-99',utility:'water'},
] as Meter[];
const assignments=[
 {id:'a-electric',site_id:'site-88'}, {id:'a-water',site_id:'site-88'},
 {id:'a-gas',site_id:'site-88'}, {id:'b-water',site_id:'site-99'},
] as MeterAssignment[];
function reading(id:string,meter_id:string,assignment_id:string,flag='none'):MeterReading{
 return {id,organization_id:'org',property_id:'park',route_item_id:'item',
  meter_id,assignment_id,captured_at:'2026-10-26T09:00:00Z',
  captured_by:'staff',value:'101',flag,kind:'actual',notes:'',exceptions:[],
  created_at:'2026-10-26T09:00:00Z'};
}
const readings=[
 reading('electric-capture','electric-88','a-electric'),
 reading('water-capture','water-88','a-water'),
 reading('gas-capture','gas-88','a-gas','damaged'),
 reading('other-water','water-99','b-water'),
];
const reviews=[{
 id:'review-1',reading_id:'water-capture',decision:'accepted',corrected_value:null,
 reason:'Verified',created_at:'2026-10-26T10:00:00Z',created_by:'manager',
}] as MeterReview[];

describe('site and utility focused meter reviews',()=>{
 it('selects one utility by actual meter identity without matching labels or resident names',()=>{
  expect(filterMeterReadingsByUtility(readings,meters,'water').map(r=>r.id))
   .toEqual(['water-capture','other-water']);
  expect(filterMeterReadingsByUtility(readings,meters,'electric').map(r=>r.id))
   .toEqual(['electric-capture']);
  expect(filterMeterReadingsByUtility(readings,meters,'gas').map(r=>r.id))
   .toEqual(['gas-capture']);
 });
 it('combines historical site and utility scopes before review status predicates',()=>{
  const atSite=filterMeterReadingsBySite(readings,assignments,'site-88');
  const water=filterMeterReadingsByUtility(atSite,meters,'water');
  expect(water.map(r=>r.id)).toEqual(['water-capture']);
  expect(filterMeterReadingWorklist(water,reviews,'',true)).toEqual([]);
  expect(filterMeterReadingWorklist(water,reviews,'',false)).toHaveLength(1);
  const gas=filterMeterReadingsByUtility(atSite,meters,'gas');
  expect(filterMeterReadingWorklist(gas,reviews,'',true,'flagged').map(r=>r.id))
   .toEqual(['gas-capture']);
 });
 it('returns an empty scope when the site has no captures for that utility',()=>{
  const other=filterMeterReadingsBySite(readings,assignments,'site-99');
  expect(filterMeterReadingsByUtility(other,meters,'electric')).toEqual([]);
  expect(filterMeterReadingsByUtility(other,meters,'water').map(r=>r.id)).toEqual(['other-water']);
 });
 it('retains incoming order and source data when all utilities are selected',()=>{
  const selected=filterMeterReadingsByUtility(readings,meters,'all');
  expect(selected).toEqual(readings);
  expect(selected).not.toBe(readings);
  expect(readings).toHaveLength(4);
  expect(meters).toHaveLength(4);
 });
 it('ignores readings whose meter identity is not in the visible meter registry',()=>{
  const orphan=reading('missing-meter','unlisted','a-water');
  expect(filterMeterReadingsByUtility([orphan],meters,'water')).toEqual([]);
 });
});
