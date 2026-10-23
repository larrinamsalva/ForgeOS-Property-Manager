import type { AccountNote } from './collections-domain';

export type StaffFollowupState = 'due' | 'scheduled';
export interface StaffFollowupTask {
  note: AccountNote;
  dueOn: string;
  state: StaffFollowupState;
}

function earliestDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Read-only worklist from the authenticated, property-scoped notes ledger.
 * A paid invoice is not evidence a manual task was completed.
 * Only an explicit matching resolution hides its original note from the list.
 */
export function staffFollowupTasks(
  notes: AccountNote[],
  propertyId: string,
  today: string,
): StaffFollowupTask[] {
  const scoped=notes.filter(n => n.property_id === propertyId);
  const completed=new Set(scoped.filter(n => n.kind === 'resolution' && n.resolves_id)
    .flatMap(n => {
      const original=scoped.find(item => item.id === n.resolves_id);
      return original && original.customer_id === n.customer_id ? [original.id] : [];
    }));
  return scoped.flatMap(note => {
    if (note.kind === 'resolution' || completed.has(note.id)) return [];
    const dueOn=earliestDate(note.follow_up_on, note.promised_on);
    if (!dueOn) return [];
    return [{note,dueOn,state:dueOn <= today ? 'due' as const : 'scheduled' as const}];
  }).sort((a,b) =>
    (a.state === b.state ? 0 : a.state === 'due' ? -1 : 1) ||
    a.dueOn.localeCompare(b.dueOn) ||
    a.note.created_at.localeCompare(b.note.created_at) ||
    a.note.id.localeCompare(b.note.id));
}
