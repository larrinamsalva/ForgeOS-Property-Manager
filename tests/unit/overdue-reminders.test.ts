import { describe, expect, it } from 'vitest';
import { customerOverdueReminders, draftOverdueReminder, overdueReminderTotal } from '../../src/lib/overdue-reminders';
import type { CollectionsSnapshot } from '../../src/lib/collections-domain';
const record=(state:string,balance:string,invoiceId='inv-a',customer='alice')=>({
 invoice_id:invoiceId,property_id:'park',customer_id:customer,state,
 outstanding_cents:balance,issued_on:'2026-09-30',due_on:'2026-10-05',days_past_due:10,
});
const invoice=(id:string,customer='alice',status='approved')=>({
 id,property_id:'park',customer_id:customer,status,number:id.toUpperCase(),
 due_on:'2026-10-05',
});
const data={
 invoices:[invoice('inv-a'),invoice('inv-b'),invoice('inv-c','bob'),invoice('inv-d','alice','draft')],
 summary:{accounts:[
  record('overdue','1500'),record('overdue','250','inv-b'),
  record('overdue','9900','inv-c','bob'),record('overdue','10000','inv-d'),
  record('approved_unissued','9000','inv-e'),
  record('paid','0','inv-f'),
 ]},
} as unknown as CollectionsSnapshot;
describe('manager-reviewed account reminders',()=>{
 it('uses only authentic issued overdue balances for the correct resident and property',()=>{
  const items=customerOverdueReminders(data,'park','alice');
  expect(items.map(i=>i.invoiceId)).toEqual(['inv-a','inv-b']);
  expect(overdueReminderTotal(items)).toBe('1750');
  expect(customerOverdueReminders(data,'another','alice')).toEqual([]);
  expect(customerOverdueReminders(data,'park','bob')).toHaveLength(1);
 });
 it('does not treat unpaid drafts, unissued accounts, paid balances, or wrong tenants as debt',()=>{
  const variant={...data,summary:{accounts:[
   record('overdue','0'),record('approved_unissued','500'),
   {...record('overdue','800'),issued_on:null},
   record('overdue','10000','inv-d'),
  ]}} as unknown as CollectionsSnapshot;
  expect(customerOverdueReminders(variant,'park','alice')).toEqual([]);
 });
 it('provides factual reminders, no invented pay-or-quit deadline or legal penalty',()=>{
  const rows=customerOverdueReminders(data,'park','alice');
  const message=draftOverdueReminder({style:'past_due',propertyName:'Pine Creek RV Park',
   residentName:'Alice Resident',rows});
  expect(message).toContain('Hello Alice Resident');
  expect(message).toContain('IN​V-A'.replace('​',''));
  expect(message).toContain('$17.50');
  expect(message).toContain('due 2026-10-05');
  expect(message).not.toMatch(/evict|legal notice|pay or quit|late fee|within 3 days/i);
  expect(draftOverdueReminder({style:'friendly',propertyName:'Park',residentName:'Alice',rows:[]}))
   .toBe('');
 });
});
