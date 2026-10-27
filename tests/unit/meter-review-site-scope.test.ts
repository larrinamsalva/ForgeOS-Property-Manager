import {describe,it,expect} from 'vitest';
import {
  filterMeterReadingWorklist, filterMeterReadingsBySite, meterReadingSiteOptions,
} from '../../src/lib/meter-reading-worklist';
import type {MeterReading,MeterReview,MeterAssignment} from '../../src/lib/meter-domain';

function reading(id:string,assignmentId:string,meterId:string,flag='none'):MeterReading{
 return {id,organization_id:'org',property_id:'park',route_item_id:'stop',
  assignment_id:assignmentId,meter_id:meterId,captured_at:'2026-10-26T09:00:00Z',
  captured_by:'staff',value:'120',flag,kind:'actual',notes:'',exceptions:[],
  created_at:'2026-10-26T09:00:00Z'};
}
const assignments=[
 {id:'assign-old',site_id:'site-a',site_label:'Space 2'},
 {id:'assign-new',site_id:'site-a',site_label:'Space 2'},
 {id:'assign-b',site_id:'site-b',site_label:'Space 10'},
 {id:'assign-duplicate-label',site_id:'site-c',site_label:'Space 2'},
] as MeterAssignment[];
const readings=[
 reading('previous','assign-old','shared-meter'),
 reading('current','assign-new','new-meter','damaged'),
 reading('other','assign-b','shared-meter'),
 reading('duplicate-label','assign-duplicate-label','meter-c'),
 reading('orphan','assignment-not-accessible','shared-meter'),
];
const reviews=[{
 id:'accepted',reading_id:'previous',decision:'accepted',corrected_value:null,
 reason:'Reviewed',created_at:'2026-10-26T10:00:00Z',created_by:'manager',
}] as MeterReview[];

describe('meter supervisor physical site scope',()=>{
 it('groups historical assignments at one physical site but separates duplicate site labels',()=>{
  expect(meterReadingSiteOptions(readings,assignments)).toEqual([
   {siteId:'site-a',label:'Space 2',count:2},
   {siteId:'site-c',label:'Space 2',count:1},
   {siteId:'site-b',label:'Space 10',count:1},
  ]);
 });
 it('selects past and current captures by assignment even when meters move',()=>{
  expect(filterMeterReadingsBySite(readings,assignments,'site-a').map(r=>r.id)).toEqual(['previous','current']);
  expect(filterMeterReadingsBySite(readings,assignments,'site-b').map(r=>r.id)).toEqual(['other']);
  expect(filterMeterReadingsBySite(readings,assignments,'site-c').map(r=>r.id)).toEqual(['duplicate-label']);
 });
 it('does not leak other-site or orphan readings into a selected site',()=>{
  expect(filterMeterReadingsBySite(readings,assignments,'nonexistent')).toEqual([]);
  expect(meterReadingSiteOptions(readings,assignments).reduce((n,s)=>n+s.count,0)).toBe(4);
  expect(filterMeterReadingsBySite(readings,assignments,'').map(r=>r.id)).toEqual(readings.map(r=>r.id));
 });
 it('combines site, meter and attention filters with correct visible counts',()=>{
  const siteReadings=filterMeterReadingsBySite(readings,assignments,'site-a');
  expect(filterMeterReadingWorklist(siteReadings,reviews,'',false)).toHaveLength(2);
  expect(filterMeterReadingWorklist(siteReadings,reviews,'',true).map(r=>r.id)).toEqual(['current']);
  expect(filterMeterReadingWorklist(siteReadings,reviews,'new-meter',true,'flagged').map(r=>r.id)).toEqual(['current']);
  expect(filterMeterReadingWorklist(siteReadings,reviews,'shared-meter',true)).toEqual([]);
  expect(filterMeterReadingWorklist(siteReadings,reviews,'',true,'unreviewed').map(r=>r.id)).toEqual(['current']);
 });
 it('does not mutate source readings or historical assignment records',()=>{
  const selected=filterMeterReadingsBySite(readings,assignments,'site-a');
  expect(selected).not.toBe(readings);
  expect(readings).toHaveLength(5);
  expect(assignments).toHaveLength(4);
 });
});
