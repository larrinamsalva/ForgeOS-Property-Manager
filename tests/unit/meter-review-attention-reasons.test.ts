import {describe,it,expect} from 'vitest';
import {filterMeterReadingWorklist,type MeterAttentionReason} from '../../src/lib/meter-reading-worklist';
import type {MeterReading,MeterReview} from '../../src/lib/meter-domain';

function reading(id:string,meterId:string,flag='none',exceptions:string[]=[]):MeterReading{
 return {id,organization_id:'org',property_id:'park',route_item_id:'route-stop',
  assignment_id:'assignment',meter_id:meterId,captured_at:'2026-10-26T09:00:00Z',
  captured_by:'reader',value:'102',flag,kind:'actual',notes:'',exceptions,
  created_at:'2026-10-26T09:00:00Z'};
}
function review(id:string,readingId:string,decision:'accepted'|'rejected',at='2026-10-26T10:00:00Z'):MeterReview{
 return {id,reading_id:readingId,decision,corrected_value:null,
  reason:'Supervisor check',created_at:at,created_by:'manager'};
}
const readings=[
 reading('unreviewed','meter-1'),
 reading('accepted','meter-1'),
 reading('rejected','meter-1'),
 reading('flagged','meter-2','damaged'),
 reading('exception','meter-2','none',['large_delta']),
 reading('both','meter-2','reset',['unexpected_reset']),
];
const reviews=[
 review('rev-1','accepted','accepted'),
 review('rev-2','rejected','rejected'),
 review('rev-3','flagged','accepted'),
 review('rev-4','exception','accepted'),
 review('rev-5','both','rejected'),
];
const keys=(reason:MeterAttentionReason,meter='')=>
 filterMeterReadingWorklist(readings,reviews,meter,true,reason).map(r=>r.id);

describe('meter supervisor review reasons',()=>{
 it('keeps all and overall attention behavior, including accepted captures that have flags',()=>{
  expect(filterMeterReadingWorklist(readings,reviews,'',false).map(r=>r.id))
   .toEqual(['unreviewed','accepted','rejected','flagged','exception','both']);
  expect(keys('all')).toEqual(['unreviewed','rejected','flagged','exception','both']);
 });
 it('narrows to each reason without losing overlapping categories',()=>{
  expect(keys('unreviewed')).toEqual(['unreviewed']);
  expect(keys('rejected')).toEqual(['rejected','both']);
  expect(keys('exceptions')).toEqual(['exception','both']);
  expect(keys('flagged')).toEqual(['flagged','both']);
 });
 it('keeps reason counts and rows within the selected meter only',()=>{
  expect(keys('all','meter-1')).toEqual(['unreviewed','rejected']);
  expect(keys('rejected','meter-1')).toEqual(['rejected']);
  expect(keys('unreviewed','meter-2')).toEqual([]);
  expect(keys('exceptions','meter-2')).toEqual(['exception','both']);
  expect(keys('all','other')).toEqual([]);
 });
 it('uses newest review by timestamp and ID even when incoming reviews are unsorted',()=>{
  const row=[reading('changed','meter-1')];
  const newest=review('revision-b','changed','accepted','2026-10-26T11:00:00Z');
  const old=review('revision-a','changed','rejected','2026-10-26T10:00:00Z');
  expect(filterMeterReadingWorklist(row,[newest,old],'',true,'rejected')).toEqual([]);
  const sameTimestamp=review('revision-c','changed','rejected','2026-10-26T11:00:00Z');
  expect(filterMeterReadingWorklist(row,[sameTimestamp,newest],'',true,'rejected').map(r=>r.id))
   .toEqual(['changed']);
 });
 it('leaves readings and reviews untouched and preserves input row order',()=>{
  const original=readings.map(r=>r.id);
  const selected=filterMeterReadingWorklist(readings,reviews,'',true,'rejected');
  expect(selected).not.toBe(readings);
  expect(readings.map(r=>r.id)).toEqual(original);
  expect(reviews).toHaveLength(5);
 });
});
