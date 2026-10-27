import type {MeterReading, MeterReview} from './meter-domain';

// Keep the supervisor queue and its displayed counts on the same predicate.
// Resolve the newest review by timestamp/id, just like latestReview(), but
// once per snapshot rather than rescanning the entire review log per reading.
export function filterMeterReadingWorklist(
 readings:readonly MeterReading[],
 reviews:readonly MeterReview[],
 meterId:string,
 attentionOnly:boolean,
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
  return !review || review.decision==='rejected' ||
   reading.exceptions.length>0 || reading.flag!=='none';
 });
}
