import {csv} from './domain';
import type {Meter, MeterAssignment, MeterReading, MeterReview} from './meter-domain';

const columns=[
 'Property','Site / unit','Meter','Utility','Captured at (ISO)',
 'Capture type','Original value','Validated value','Review status',
 'Capture flag','Automatic exceptions',
];

/**
 * Export only the ordered, already-filtered on-screen readings.
 *
 * Supervisor CSV has site/meter operational data but deliberately omits
 * resident identities, customer or stay IDs, internal record IDs, notes,
 * photos and signed evidence URLs. The shared CSV writer escapes spreadsheet
 * formulas and quotes so user-entered site/meter labels remain plain text.
 */
export function filteredMeterReadingCsv(
 property:string,
 readings:readonly MeterReading[],
 meters:readonly Pick<Meter,'id'|'label'|'utility'>[],
 assignments:readonly Pick<MeterAssignment,'id'|'site_label'>[],
 reviews:readonly MeterReview[],
):string{
 const byMeter=new Map(meters.map(m=>[m.id,m]));
 const byAssignment=new Map(assignments.map(a=>[a.id,a]));
 const latest=new Map<string,MeterReview>();
 for(const review of reviews){
  const previous=latest.get(review.reading_id);
  if(!previous || review.created_at>previous.created_at ||
     (review.created_at===previous.created_at && review.id>previous.id))
   latest.set(review.reading_id,review);
 }
 const rows=readings.map(reading=>{
  const meter=byMeter.get(reading.meter_id);
  const assignment=byAssignment.get(reading.assignment_id);
  const review=latest.get(reading.id);
  const validated=review?.decision==='accepted' ? review.corrected_value ?? reading.value ?? '' : '';
  const decision=review?.decision==='accepted'?'Accepted':review?.decision==='rejected'?'Rejected':'Needs review';
  return [
   property,assignment?.site_label ?? 'Site unavailable',meter?.label ?? 'Meter unavailable',
   meter?.utility ?? 'Unknown',reading.captured_at,reading.kind,reading.value ?? '',
   validated,decision,reading.flag,reading.exceptions.join('; '),
  ];
 });
 return '\uFEFF'+csv([columns,...rows])+'\r\n';
}
