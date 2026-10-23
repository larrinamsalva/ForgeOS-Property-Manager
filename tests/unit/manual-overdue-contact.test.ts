import { describe, expect, it } from 'vitest';
import { manualContactBody, overdueContactHistory, isManualOverdueContact } from '../../src/lib/manual-overdue-contact';
import type { AccountNote } from '../../src/lib/collections-domain';
function note(id:string, property:string, customer:string, body:string, kind='note'): AccountNote {
  return {id,property_id:property,customer_id:customer,body,kind:kind as AccountNote['kind'],
    invoice_id:null,created_at:'2026-10-23T12:00:00.000Z',created_by:'staff',
    follow_up_on:null,promised_on:null,promised_amount_cents:null,resolves_id:null};
}
describe('manual overdue contact audit note',()=>{
 it('formats factual manually reported contact without legal or automated send claims',()=>{
  const body=manualContactBody('phone','attempted_no_response','Left a voicemail only after checking contact preferences.');
  expect(body).toContain('Manual past-due contact');
  expect(body).toContain('Phone call');
  expect(body).toContain('Attempted — no response');
  expect(body).not.toMatch(/message sent automatically|three-day notice|eviction order/i);
  expect(isManualOverdueContact(note('one','park','alice',body))).toBe(true);
 });
 it('rejects missing outcomes, short details or excessive text',()=>{
  expect(()=>manualContactBody('phone','other','')).toThrow();
  expect(()=>manualContactBody('phone','other','x'.repeat(1501))).toThrow();
  expect(()=>manualContactBody('fax' as 'phone','other','Factual details')).toThrow();
 });
 it('returns only this authorized customer and property history, not arbitrary notes or arrangements',()=>{
  const body=manualContactBody('in_person','spoke_with_resident','Resident visited office.');
  const notes=[
    note('one','park','alice',body),
    note('two','park','bob',body),
    note('three','other','alice',body),
    note('four','park','alice','Ordinary unrelated note'),
    note('five','park','alice',body,'arrangement'),
  ];
  expect(overdueContactHistory(notes,'park','alice').map(n=>n.id)).toEqual(['one']);
 });
});
