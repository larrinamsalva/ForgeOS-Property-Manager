import {describe,it,expect} from 'vitest';
import {
 searchMeterReadingWorklist,filterMeterReadingsBySite,filterMeterReadingsByUtility,
 filterMeterReadingsByCaptureMonth,filterMeterReadingWorklist,
} from '../../src/lib/meter-reading-worklist';
import {sortMeterReadingWorklist} from '../../src/lib/meter-reading-order';
import {filteredMeterReadingCsv} from '../../src/lib/meter-reading-export';
import type {Meter,MeterAssignment,MeterReading,MeterReview} from '../../src/lib/meter-domain';

const assignments=[
 {id:'assignment-old',site_id:'site-12',site_label:'Space 12'},
 {id:'assignment-new',site_id:'site-88',site_label:'Space 88'},
 {id:'assignment-water',site_id:'site-88',site_label:'Space 88'},
 {id:'assignment-other',site_id:'site-99',site_label:'Space 99'},
] as MeterAssignment[];
const meters=[
 {id:'meter-moved',label:'Electric Main',utility:'electric',serial_number:'000123'},
 {id:'meter-water',label:'Water North',utility:'water',serial_number:'W-0088'},
 {id:'meter-other',label:'Water North',utility:'water',serial_number:'W-0099'},
] as Meter[];
function reading(id:string,assignment_id:string,meter_id:string,date='2026-10-26T10:00:00Z'):MeterReading{
 return {
  id,organization_id:'org-secret',property_id:'park',route_item_id:'route-private',
  assignment_id,meter_id,captured_at:date,captured_by:'PRIVATE STAFF',
  value:'101',flag:'none',kind:'actual',notes:'SECRET Resident Doe notes',
  exceptions:[],created_at:date,
 };
}
const readings=[
 reading('old-site','assignment-old','meter-moved'),
 reading('new-site','assignment-new','meter-moved'),
 reading('water-88','assignment-water','meter-water'),
 reading('water-99','assignment-other','meter-other'),
];

describe('supervisor meter worklist quick search',()=>{
 it('matches site label, meter label, utility and serial number with case folding',()=>{
  expect(searchMeterReadingWorklist(readings,assignments,meters,'Space 88').map(r=>r.id))
   .toEqual(['new-site','water-88']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'electric').map(r=>r.id))
   .toEqual(['old-site','new-site']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'000123').map(r=>r.id))
   .toEqual(['old-site','new-site']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'w-0088').map(r=>r.id))
   .toEqual(['water-88']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'WATER NORTH').map(r=>r.id))
   .toEqual(['water-88','water-99']);
 });
 it('combines whitespace-separated terms across site, meter, serial and utility',()=>{
  expect(searchMeterReadingWorklist(readings,assignments,meters,'  space  88   WaTeR  ').map(r=>r.id))
   .toEqual(['water-88']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'space 88 000123').map(r=>r.id))
   .toEqual(['new-site']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'space 99 electric')).toEqual([]);
 });
 it('uses historic assignment when one meter was moved between spaces',()=>{
  expect(searchMeterReadingWorklist(readings,assignments,meters,'Space 12').map(r=>r.id))
   .toEqual(['old-site']);
  expect(searchMeterReadingWorklist(readings,assignments,meters,'Space 88 Electric').map(r=>r.id))
   .toEqual(['new-site']);
 });
 it('does not search resident names, free-form notes, private staff or IDs',()=>{
  for(const sensitive of ['Resident Doe','SECRET','PRIVATE STAFF','org-secret','route-private','assignment-old','meter-moved']){
   expect(searchMeterReadingWorklist(readings,assignments,meters,sensitive)).toEqual([]);
  }
  expect(searchMeterReadingWorklist(readings,assignments,meters,'no-match')).toEqual([]);
 });
 it('composes site, utility, month, reason and order with a private-safe CSV',()=>{
  const site=filterMeterReadingsBySite(readings,assignments,'site-88');
  const utility=filterMeterReadingsByUtility(site,meters,'water');
  const month=filterMeterReadingsByCaptureMonth(utility,'2026-10','America/Los_Angeles');
  const searched=searchMeterReadingWorklist(month,assignments,meters,'w-0088');
  const reviews=[{id:'review-one',reading_id:'water-88',decision:'rejected',
   created_at:'2026-10-26T11:00:00Z',corrected_value:null,created_by:'manager',reason:'inspect'}] as MeterReview[];
  const attention=filterMeterReadingWorklist(searched,reviews,'',true,'rejected');
  const sorted=sortMeterReadingWorklist(attention,assignments,'newest');
  const csv=filteredMeterReadingCsv('Test Park',sorted,meters,assignments,reviews);
  expect(sorted.map(r=>r.id)).toEqual(['water-88']);
  expect(csv).toContain('Water North');
  expect(csv).not.toContain('Space 99');
  expect(csv).not.toContain('PRIVATE STAFF');
  expect(csv).not.toContain('Resident Doe');
 });
 it('clearing search restores a new array in original order without changing records',()=>{
  const all=searchMeterReadingWorklist(readings,assignments,meters,'  ');
  expect(all).toEqual(readings);
  expect(all).not.toBe(readings);
  expect(readings).toHaveLength(4);
  expect(meters).toHaveLength(3);
 });
 it('skips missing meter or assignment metadata without throwing or leaking other data',()=>{
  const orphan=reading('orphan','assignment-hidden','meter-hidden');
  expect(searchMeterReadingWorklist([orphan],assignments,meters,'water')).toEqual([]);
  expect(searchMeterReadingWorklist([orphan],assignments,meters,'Space 88')).toEqual([]);
 });
});
