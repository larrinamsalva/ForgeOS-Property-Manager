import type {MeterAssignment, MeterReading} from './meter-domain';

export type MeterReadingOrder = 'newest' | 'oldest' | 'site';

export function sortMeterReadingWorklist(
 readings: readonly MeterReading[],
 assignments: readonly Pick<MeterAssignment,'id'|'site_id'|'site_label'>[],
 order: MeterReadingOrder,
): MeterReading[] {
 const sites=new Map(assignments.map(a=>[a.id,a]));
 const timestamp=(reading:MeterReading)=>{
  const value=Date.parse(reading.captured_at);
  return Number.isFinite(value)?value:0;
 };
 const chronological=(a:MeterReading,b:MeterReading)=>
  (order==='oldest'?timestamp(a)-timestamp(b):timestamp(b)-timestamp(a));
 return [...readings].sort((a,b)=>{
  if(order==='site'){
   const siteA=sites.get(a.assignment_id);
   const siteB=sites.get(b.assignment_id);
   // Missing assignments are shown last, not silently discarded.
   if(!siteA && siteB) return 1;
   if(siteA && !siteB) return -1;
   const siteName=(siteA?.site_label ?? '').localeCompare(siteB?.site_label ?? '',undefined,{numeric:true});
   return siteName || (siteA?.site_id ?? '').localeCompare(siteB?.site_id ?? '') ||
    chronological(a,b) || a.id.localeCompare(b.id);
  }
  return chronological(a,b) || a.id.localeCompare(b.id);
 });
}
