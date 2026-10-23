import type { AccountNote } from './collections-domain';

const PREFIX = 'Manual past-due contact\n';
export type ContactMethod = 'phone' | 'email' | 'in_person' | 'other';
export type ContactOutcome = 'attempted_no_response' | 'spoke_with_resident' |
  'follow_up_requested' | 'other';

export const contactMethods: { value: ContactMethod; label: string }[] = [
  {value:'phone',label:'Phone call'},
  {value:'email',label:'Email handled outside ForgeOS'},
  {value:'in_person',label:'In-person conversation'},
  {value:'other',label:'Other manual contact'},
];
export const contactOutcomes: { value: ContactOutcome; label: string }[] = [
  {value:'attempted_no_response',label:'Attempted — no response'},
  {value:'spoke_with_resident',label:'Spoke with resident'},
  {value:'follow_up_requested',label:'Resident requested follow-up'},
  {value:'other',label:'Other outcome (explain below)'},
];

/**
 * A dated manual staff statement, NOT evidence that ForgeOS delivered a
 * message. Uses existing immutable collections account notes and audit trail.
 * No recipient address, phone number, payment details or notice is embedded.
 */
export function manualContactBody(
  method: ContactMethod,
  outcome: ContactOutcome,
  details: string,
): string {
  if (!contactMethods.some(value => value.value === method) ||
      !contactOutcomes.some(value => value.value === outcome)) {
    throw new Error('Choose the contact method and reported outcome.');
  }
  const text = details.trim();
  if (text.length < 3 || text.length > 1500)
    throw new Error('Explain what happened in 3–1500 characters.');
  return PREFIX +
    'Method: ' + contactMethods.find(value => value.value === method)!.label + '\n' +
    'Outcome: ' + contactOutcomes.find(value => value.value === outcome)!.label + '\n' +
    'Staff details: ' + text;
}
export function isManualOverdueContact(note: Pick<AccountNote,'kind'|'body'>): boolean {
  return note.kind === 'note' && note.body.startsWith(PREFIX);
}
export function overdueContactHistory(
  notes: AccountNote[], propertyId: string, customerId: string,
): AccountNote[] {
  return notes.filter(note => note.property_id === propertyId &&
    note.customer_id === customerId && isManualOverdueContact(note))
    .sort((a,b)=> b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}
