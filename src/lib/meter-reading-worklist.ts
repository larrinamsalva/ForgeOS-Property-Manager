import type {Meter, MeterAssignment, MeterReading, MeterReview} from './meter-domain';
import {dateAtProperty} from './domain';

export type MeterAttentionReason = 'all' | 'unreviewed' | 'rejected' | 'exceptions' | 'flagged';

// Keep the supervisor queue and its displayed counts on the same predicate.
// Resolve the newest review by timestamp/id, just like latestReview(), but
// once per snapshot rather than rescanning the entire review log per reading.
export function filterMeterReadingWorklist(
 readings:readonly MeterReading[],
 reviews:readonly MeterReview[],
 meterId:string,
 attentionOnly:boolean,
 reason:MeterAttentionReason='all',
):MeterReading[]{
 const latest=new Map<string,MeterReview>();
 if(attentionOnly){
  for(const review of reviews){
   const previous=latest.get(review.reading_id);
   if(!previous || review.created_at>previous.created_at ||
     (review.created_at===previous.created_at && review.id>previous.id))
    latest.set(review.reading_id,review);
  }
 }
 return readings.filter(reading=>{
  if(meterId && reading.meter_id!==meterId) return false;
  if(!attentionOnly) return true;
  const review=latest.get(reading.id);
  // Rejected captures still need follow-up even though they have a review.
  const unreviewed=!review;
  const rejected=review?.decision==='rejected';
  const exceptions=reading.exceptions.length>0;
  const flagged=reading.flag!=='none';
  if(!(unreviewed || rejected || exceptions || flagged)) return false;
  if(reason==='unreviewed') return unreviewed;
  if(reason==='rejected') return rejected;
  if(reason==='exceptions') return exceptions;
  if(reason==='flagged') return flagged;
  return true;
 });
}

export interface MeterReadingSiteOption {siteId:string; label:string; count:number}

// Scope by the historical assignment ID attached to each capture. Meter ID
// alone is unsafe: a meter can move between sites without moving past readings.
export function filterMeterReadingsBySite(
 readings:readonly MeterReading[],
 assignments:readonly Pick<MeterAssignment,'id'|'site_id'>[],
 siteId:string,
):MeterReading[]{
 if(!siteId) return [...readings];
 const assignedIds=new Set(assignments.filter(a=>a.site_id===siteId).map(a=>a.id));
 return readings.filter(r=>assignedIds.has(r.assignment_id));
}

// Only sites with captured readings appear. Multiple historical assignments
// to the same site remain one option, and duplicate labels keep distinct IDs.
export function meterReadingSiteOptions(
 readings:readonly MeterReading[],
 assignments:readonly Pick<MeterAssignment,'id'|'site_id'|'site_label'>[],
):MeterReadingSiteOption[]{
 const byAssignment=new Map(assignments.map(a=>[a.id,a]));
 const bySite=new Map<string,MeterReadingSiteOption>();
 for(const reading of readings){
  const a=byAssignment.get(reading.assignment_id);
  if(!a) continue;
  const current=bySite.get(a.site_id);
  if(current) current.count+=1;
  else bySite.set(a.site_id,{siteId:a.site_id,label:a.site_label,count:1});
 }
 return [...bySite.values()].sort((a,b)=>
  a.label.localeCompare(b.label,undefined,{numeric:true})||a.siteId.localeCompare(b.siteId));
}

export function filterMeterReadingsByUtility(
 readings:readonly MeterReading[],
 meters:readonly Pick<Meter,'id'|'utility'>[],
 utility:'all'|Meter['utility'],
):MeterReading[]{
 if(utility==='all') return [...readings];
 const meterIds=new Set(meters.filter(m=>m.utility===utility).map(m=>m.id));
 return readings.filter(reading=>meterIds.has(reading.meter_id));
}

/**
 * Show captures belonging to a property-local calendar month, regardless of
 * the supervisor device time zone. This is a captured-on filter, not a billing
 * period or a statement about whether a reading was approved.
 */
export function filterMeterReadingsByCaptureMonth(
 readings:readonly MeterReading[],
 month:string,
 timezone:string,
):MeterReading[]{
 if(!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [...readings];
 return readings.filter(reading=>{
  const date=new Date(reading.captured_at);
  return !Number.isNaN(date.getTime()) && dateAtProperty(timezone,date).startsWith(month+'-');
 });
}
