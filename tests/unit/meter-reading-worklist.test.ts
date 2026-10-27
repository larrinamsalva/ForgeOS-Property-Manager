import {describe, it, expect} from 'vitest';
import {filterMeterReadingWorklist} from '../../src/lib/meter-reading-worklist';
import type {MeterReading, MeterReview} from '../../src/lib/meter-domain';

function reading(id:string,meterId='meter-1',flag='none',exceptions:string[]=[]):MeterReading{
 return {
  id,organization_id:'org-1',property_id:'property-1',route_item_id:'item-1',
  assignment_id:'assignment-1',meter_id:meterId,captured_at:'2026-10-26T09:00:00Z',
  captured_by:'staff-1',value:'11',flag,kind:'actual',notes:'',exceptions,
  created_at:'2026-10-26T09:00:00Z',
 };
}
function review(id:string,readingId:string,decision:'accepted'|'rejected',at='2026-10-26T10:00:00Z'):MeterReview{
 return {id,reading_id:readingId,decision,corrected_value:null,
  reason:'Supervisor verified',created_at:at,created_by:'manager-1'};
}
describe('meter review attention list',()=>{
 const readings=[
  reading('unreviewed'),reading('accepted'),reading('rejected'),
  reading('flagged','meter-2','damaged'),reading('exception','meter-2','none',['unusual_delta']),
 ];
 const reviews=[
  review('r1','accepted','accepted'),
  review('r2','rejected','rejected'),
  review('r3','flagged','accepted'),
  review('r4','exception','accepted'),
 ];
 it('shows every reading in all mode and only actionable readings when attention is selected',()=>{
  expect(filterMeterReadingWorklist(readings,reviews,'',false).map(r=>r.id))
   .toEqual(['unreviewed','accepted','rejected','flagged','exception']);
  expect(filterMeterReadingWorklist(readings,reviews,'',true).map(r=>r.id))
   .toEqual(['unreviewed','rejected','flagged','exception']);
 });
 it('applies the same meter and attention filters to the visible rows and counts',()=>{
  const shown=filterMeterReadingWorklist(readings,reviews,'meter-2',true);
  expect(shown.map(r=>r.id)).toEqual(['flagged','exception']);
  expect(shown).toHaveLength(2);
  expect(filterMeterReadingWorklist(readings,reviews,'meter-1',true).map(r=>r.id))
   .toEqual(['unreviewed','rejected']);
  expect(filterMeterReadingWorklist(readings,reviews,'missing',true)).toEqual([]);
 });
 it('uses the latest review, including deterministic tied-timestamp ordering',()=>{
  const row=[reading('a')];
  const earlierRejected=review('r1','a','rejected','2026-10-25T01:00:00Z');
  const newestAccepted=review('r2','a','accepted','2026-10-26T01:00:00Z');
  expect(filterMeterReadingWorklist(row,[newestAccepted,earlierRejected],'',true)).toEqual([]);
  expect(filterMeterReadingWorklist(row,[newestAccepted,review('r3','a','rejected','2026-10-26T01:00:00Z')],'',true))
   .toHaveLength(1);
 });
 it('does not mutate source readings or the review audit trail',()=>{
  const copied=filterMeterReadingWorklist(readings,reviews,'',true);
  expect(copied).not.toBe(readings);
  expect(readings).toHaveLength(5);
  expect(reviews).toHaveLength(4);
 });
});
