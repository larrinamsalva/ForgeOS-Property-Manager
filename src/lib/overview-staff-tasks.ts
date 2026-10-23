import type { AccountNote } from './collections-domain';
import type { Property } from './domain';
import { dateAtProperty } from './domain';
import { staffFollowupTasks, type StaffFollowupState } from './staff-followup-worklist';

export interface OverviewStaffTask {
  noteId: string;
  customerId: string;
  propertyId: string;
  propertyName: string;
  dueOn: string;
  state: StaffFollowupState;
}

/**
 * Caller passes only property-authorized records. The collections API still
 * enforces server permissions; this is a second client-side scoping guard.
 * Dates are evaluated in each property's local calendar, not the browser zone.
 */
export function overviewStaffTasks(
  notes: AccountNote[],
  authorizedProperties: Pick<Property, 'id' | 'name' | 'timezone' | 'archived_at'>[],
  now = new Date(),
): OverviewStaffTask[] {
  return authorizedProperties.filter(property => !property.archived_at)
    .flatMap(property => staffFollowupTasks(
      notes, property.id, dateAtProperty(property.timezone || 'America/Los_Angeles', now)
    ).map(task => ({
      noteId:task.note.id, customerId:task.note.customer_id,
      propertyId:property.id,propertyName:property.name,
      dueOn:task.dueOn,state:task.state,
    })))
    .sort((a,b) => (a.state === b.state ? 0 : a.state === 'due' ? -1 : 1) ||
      a.dueOn.localeCompare(b.dueOn) ||
      a.propertyName.localeCompare(b.propertyName) ||
      a.noteId.localeCompare(b.noteId));
}
