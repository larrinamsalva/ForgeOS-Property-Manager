import {describe,it,expect} from 'vitest';
import {
 filterMeterReadingsByCaptureMonth,filterMeterReadingsBySite,
 filterMeterReadingsByUtility,filterMeterReadingWorklist,
} from '../../src/lib/meter-reading-worklist';
import {sortMeterReadingWorklist} from '../../src/lib/meter-reading-order';
import type {Meter,MeterAssignment,MeterReading,MeterReview} from '../../src/lib/meter-domain';

function capture(id:string,at:string,assignment='assigned-88',meter='water-88'):MeterReading{
 return {id,organization_id:'org',property_id:'park',route_item_id:'stop',assignment_id:assignment,
  meter_id:meter,captured_at:at,captured_by:'staff',value:'123',flag:'none',
  kind:'actual',notes:'',exceptions:[],created_at:at};
}

describe('property-local capture month filter for supervisor meter readings',()=>{
 const captures=[
  capture('oct-la','2026-11-01T06:59:00Z'),
  capture('nov-la','2026-11-01T07:00:00Z'),
  capture('nov-water','2026-11-18T08:00:00Z'),
  capture('other-site','2026-11-11T18:00:00Z','assigned-99','water-99'),
  capture('oct-gas','2026-10-15T18:00:00Z','assigned-gas','gas-88'),
  capture('invalid','not-a-date'),
 ];
 const assignments=[
  {id:'assigned-88',site_id:'site-88',site_label:'Space 88'},
  {id:'assigned-99',site_id:'site-99',site_label:'Space 99'},
  {id:'assigned-gas',site_id:'site-88',site_label:'Space 88'},
 ] as MeterAssignment[];
 const meters=[
  {id:'water-88',utility:'water'},{id:'water-99',utility:'water'},{id:'gas-88',utility:'gas'},
 ] as Meter[];

 it('compares captures to the property timezone across the UTC month boundary',()=>{
  const october=filterMeterReadingsByCaptureMonth(captures,'2026-10','America/Los_Angeles');
  expect(october.map(r=>r.id)).toEqual(['oct-la','oct-gas']);
  const november=filterMeterReadingsByCaptureMonth(captures,'2026-11','America/Los_Angeles');
  expect(november.map(r=>r.id)).toEqual(['nov-la','nov-water','other-site']);
  expect(filterMeterReadingsByCaptureMonth(captures,'2026-11','UTC').map(r=>r.id))
   .toEqual(['oct-la','nov-la','nov-water','other-site']);
 });
 it('handles the local March boundary and does not assume the computer timezone',()=>{
  const entries=[capture('feb','2026-03-01T07:59:00Z'),capture('mar','2026-03-01T08:00:00Z')];
  expect(filterMeterReadingsByCaptureMonth(entries,'2026-02','America/Los_Angeles').map(r=>r.id))
   .toEqual(['feb']);
  expect(filterMeterReadingsByCaptureMonth(entries,'2026-03','America/Los_Angeles').map(r=>r.id))
   .toEqual(['mar']);
 });
 it('composes site/utility/month/review filters without adding other-site captures',()=>{
  const site=filterMeterReadingsBySite(captures,assignments,'site-88');
  const utility=filterMeterReadingsByUtility(site,meters,'water');
  const november=filterMeterReadingsByCaptureMonth(utility,'2026-11','America/Los_Angeles');
  const reviews=[{id:'review-1',reading_id:'nov-la',decision:'accepted',
    corrected_value:null,reason:'Verified',created_at:'2026-11-02T00:00:00Z',
    created_by:'manager'}] as MeterReview[];
  expect(november.map(r=>r.id)).toEqual(['nov-la','nov-water']);
  const attention=filterMeterReadingWorklist(november,reviews,'',true);
  expect(sortMeterReadingWorklist(attention,assignments,'oldest').map(r=>r.id)).toEqual(['nov-water']);
  expect(filterMeterReadingWorklist(november,reviews,'',false)).toHaveLength(2);
 });
 it('clearing or invalidating the month shows the unmodified set without mutating source',()=>{
  const all=filterMeterReadingsByCaptureMonth(captures,'','America/Los_Angeles');
  expect(all).not.toBe(captures);
  expect(all).toEqual(captures);
  for(const invalid of ['2026-00','2026-13','2026-1','october','2026-11-01']){
   expect(filterMeterReadingsByCaptureMonth(captures,invalid,'America/Los_Angeles')).toEqual(captures);
  }
  expect(captures[0].id).toBe('oct-la');
 });
 it('does not show invalid captured timestamps in any specific month',()=>{
  expect(filterMeterReadingsByCaptureMonth([capture('bad','invalid-date')],'2026-10','UTC')).toEqual([]);
 });
});
