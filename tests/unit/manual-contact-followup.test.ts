import { describe, expect, it } from 'vitest';
import { manualContactFollowUpStatus } from '../../src/lib/manual-contact-followup';
import { manualContactBody } from '../../src/lib/manual-overdue-contact';
import type { AccountNote } from '../../src/lib/collections-domain';

const content=manualContactBody('phone','follow_up_requested','Resident asked office to call next week.');
const make=(changes:Partial<AccountNote>={}):AccountNote=>({
 id:'contact-1',customer_id:'resident-a',property_id:'park-a',created_at:'2026-10-20T12:00:00Z',
 created_by:'staff-1',invoice_id:'bill-a',kind:'note',body:content,
 follow_up_on:'2026-10-25',promised_on:null,promised_amount_cents:null,resolves_id:null,
 ...changes,
});
describe('resident contact follow-up status',()=>{
 it('uses property-local calendar dates; future is scheduled, due today or before is due',()=>{
   const contact=make();
   expect(manualContactFollowUpStatus(contact,[contact],'2026-10-24').status).toBe('scheduled');
   expect(manualContactFollowUpStatus(contact,[contact],'2026-10-25').status).toBe('due');
   expect(manualContactFollowUpStatus(contact,[contact],'2026-11-01').status).toBe('due');
 });
 it('does not invent a follow-up when none was scheduled',()=>{
   const contact=make({follow_up_on:null});
   expect(manualContactFollowUpStatus(contact,[contact],'2026-10-30').status).toBe('none');
 });
 it('marks due and future follow-ups resolved only with matching immutable resolution record',()=>{
   const contact=make();
   const done=make({
     id:'resolved',kind:'resolution',body:'Confirmed call and wrote the outcome.',
     resolves_id:contact.id,created_at:'2026-10-26T08:00:00Z',
     follow_up_on:null,
   });
   expect(manualContactFollowUpStatus(contact,[contact,done],'2026-10-24'))
     .toEqual({status:'resolved',resolution:done});
 });
 it('rejects other tenants, properties, unrelated notes and wrong resolution targets',()=>{
   const contact=make();
   const fake=[
     make({id:'cross-property',kind:'resolution',resolves_id:contact.id,property_id:'park-b'}),
     make({id:'cross-tenant',kind:'resolution',resolves_id:contact.id,customer_id:'resident-b'}),
     make({id:'wrong',kind:'resolution',resolves_id:'another-note'}),
     make({id:'not-resolution',kind:'note',resolves_id:contact.id}),
   ];
   expect(manualContactFollowUpStatus(contact,[contact,...fake],'2026-10-30').status).toBe('due');
 });
 it('does not treat ordinary notes as manual overdue contacts',()=>{
   const normal=make({body:'Regular account note'});
   expect(manualContactFollowUpStatus(normal,[normal],'2026-10-30').status).toBe('none');
 });
});
