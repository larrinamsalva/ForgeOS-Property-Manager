import type { Reservation, Stay } from './domain';

// Count records for one property and its local calendar day. Planned departures
// are tasks to review, not proof that a resident has already moved out.
export function dailyMoveChecklist(
  propertyId:string,today:string,
  reservations:Pick<Reservation,'property_id'|'status'|'starts_on'>[],
  stays:Pick<Stay,'property_id'|'starts_on'|'ends_on'|'planned_ends_on'>[],
) {
  return {
    confirmedArrivals:reservations.filter(r=>r.property_id===propertyId &&
      r.status==='confirmed' && r.starts_on===today).length,
    moveIns:stays.filter(s=>s.property_id===propertyId && s.starts_on===today).length,
    plannedDepartures:stays.filter(s=>s.property_id===propertyId &&
      s.planned_ends_on===today && (!s.ends_on || s.ends_on>=today)).length,
    completedMoveOuts:stays.filter(s=>s.property_id===propertyId && s.ends_on===today).length,
  };
}
