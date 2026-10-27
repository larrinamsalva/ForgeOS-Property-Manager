import {describe,it,expect} from 'vitest';
import {filteredMeterReadingCsv} from '../../src/lib/meter-reading-export';
import {sortMeterReadingWorklist} from '../../src/lib/meter-reading-order';
import {filterMeterReadingWorklist,filterMeterReadingsByUtility,filterMeterReadingsBySite,filterMeterReadingsByCaptureMonth} from '../../src/lib/meter-reading-worklist';
import type {Meter,MeterAssignment,MeterReading,MeterReview} from '../../src/lib/meter-domain';

const assignments=[
 {id:'assignment-A',site_id:'site-2',site_label:'Space 2'},
 {id:'assignment-B',site_id:'site-10',site_label:'Space 10'},
] as MeterAssignment[];
const meters=[
 {id:'meter-water',label:'Water A',utility:'water'},
 {id:'meter-gas',label:'Gas B',utility:'gas'},
] as Meter[];
function capture(id:string,assignment_id:string,meter_id:string,at:string,value:string):MeterReading{
 return {id,organization_id:'secret-org',property_id:'secret-property',route_item_id:'secret-route',
  assignment_id,meter_id,captured_at:at,captured_by:'secret-staff',value,flag:'none',
  kind:'actual',notes:'PRIVATE CUSTOMER PHONE 555-0100',exceptions:[],created_at:at};
}
const readings=[
 capture('reading-water','assignment-A','meter-water','2026-11-04T09:00:00Z','100.000'),
 capture('reading-gas','assignment-B','meter-gas','2026-10-04T09:00:00Z','5.2'),
];
const reviews=[
 {id:'old-review',reading_id:'reading-water',decision:'rejected',corrected_value:null,
  reason:'PRIVATE REVIEW REASON',created_at:'2026-11-05T09:00:00Z',created_by:'supervisor'},
 {id:'new-review',reading_id:'reading-water',decision:'accepted',corrected_value:'0',
  reason:'PRIVATE SECOND REVIEW',created_at:'2026-11-06T09:00:00Z',created_by:'supervisor'},
] as MeterReview[];

describe('private operational supervisor meter CSV',()=>{
 it('includes only the supplied ordered filtered readings, not other months, utilities or sites',()=>{
  const site=filterMeterReadingsBySite(readings,assignments,'site-2');
  const utility=filterMeterReadingsByUtility(site,meters,'water');
  const month=filterMeterReadingsByCaptureMonth(utility,'2026-11','UTC');
  const csv=filteredMeterReadingCsv('Park',month,meters,assignments,reviews);
  expect(csv).toContain('Space 2');
  expect(csv).toContain('Water A');
  expect(csv).not.toContain('Space 10');
  expect(csv).not.toContain('Gas B');
  expect(csv).not.toContain('5.2');
 });
 it('uses the latest accepted review and preserves explicit zero corrections and original values',()=>{
  const csv=filteredMeterReadingCsv('Park',readings,meters,assignments,reviews);
  expect(csv).toContain('"100.000","0","Accepted"');
  expect(csv).toContain('"5.2","","Needs review"');
  expect(csv).not.toContain('Rejected');
 });
 it('redacts resident, staff, note, review reason, and internal identifiers',()=>{
  const csv=filteredMeterReadingCsv('Park',readings,meters,assignments,reviews);
  for(const forbidden of ['secret-org','secret-property','secret-route','secret-staff','assignment-A',
   'meter-water','reading-water','old-review','PRIVATE CUSTOMER PHONE','PRIVATE REVIEW REASON','PRIVATE SECOND REVIEW']){
   expect(csv).not.toContain(forbidden);
  }
  expect(csv).toContain('Site / unit');
  expect(csv).toContain('Original value');
 });
 it('preserves exact filtered + sorted order and never adds accepted rows back to attention-only exports',()=>{
  const attention=filterMeterReadingWorklist(readings,reviews,'',true);
  expect(attention.map(r=>r.id)).toEqual(['reading-gas']);
  const csv=filteredMeterReadingCsv('Park',sortMeterReadingWorklist(readings,assignments,'oldest'),meters,assignments,reviews);
  expect(csv.indexOf('Space 10')).toBeLessThan(csv.indexOf('Space 2'));
  const actionCsv=filteredMeterReadingCsv('Park',attention,meters,assignments,reviews);
  expect(actionCsv).toContain('Space 10');
  expect(actionCsv).not.toContain('Space 2');
 });
 it('guards spreadsheet cells against formula injection and escapes special characters',()=>{
  const tricky=[{...assignments[0],site_label:'=HYPERLINK("evil","Click"), West'}] as MeterAssignment[];
  const trickyMeters=[{...meters[0],label:'@SUM(1,2)'}] as Meter[];
  const csv=filteredMeterReadingCsv('=EXPOSE',readings.slice(0,1),trickyMeters,tricky,reviews);
  expect(csv).toContain('"\'=EXPOSE"');
  expect(csv).toContain('"\'=HYPERLINK(""evil"",""Click""), West"');
  expect(csv).toContain('"\'@SUM(1,2)"');
 });
 it('renders an empty safe header for zero visible readings',()=>{
  const csv=filteredMeterReadingCsv('Park',[],meters,assignments,reviews);
  expect(csv).toContain('Captured at (ISO)');
  expect(csv).not.toContain('Space 2');
  expect(csv).toMatch(/\r\n$/);
 });
 it('shows rejected captures without treating them as validated, and retains exception flags',()=>{
  const flagged={...readings[1],flag:'damaged',exceptions:['high delta','unexpected reset']};
  const rejected=[{...reviews[0],reading_id:'reading-gas',corrected_value:'999'}];
  const csv=filteredMeterReadingCsv('Park',[flagged],meters,assignments,rejected);
  expect(csv).toContain('"5.2","","Rejected"');
  expect(csv).toContain('"damaged","high delta; unexpected reset"');
  expect(csv).not.toContain('999');
 });
});
