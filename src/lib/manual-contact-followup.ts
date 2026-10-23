import type { AccountNote } from './collections-domain';
import { isManualOverdueContact } from './manual-overdue-contact';

export type ManualFollowUpStatus = 'none' | 'scheduled' | 'due' | 'resolved';

export function manualContactFollowUpStatus(
  contact: AccountNote, notes: AccountNote[], today: string,
): { status: ManualFollowUpStatus; resolution: AccountNote | null } {
  if (!isManualOverdueContact(contact)) return {status:'none',resolution:null};
  const resolution=notes.filter(note => note.kind === 'resolution' &&
    note.resolves_id === contact.id &&
    note.property_id === contact.property_id &&
    note.customer_id === contact.customer_id)
    .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null;
  if (resolution) return {status:'resolved',resolution};
  if (!contact.follow_up_on) return {status:'none',resolution:null};
  return {status:contact.follow_up_on <= today ? 'due' : 'scheduled',resolution:null};
}
