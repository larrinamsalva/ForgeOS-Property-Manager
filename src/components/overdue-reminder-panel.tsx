'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { cents } from '@/lib/billing-domain';
import {
  contactMethods, contactOutcomes, manualContactBody,
  type ContactMethod, type ContactOutcome,
} from '@/lib/manual-overdue-contact';
import {
  draftOverdueReminder, overdueReminderTotal,
  type ReminderStyle, type OverdueReminderRow,
} from '@/lib/overdue-reminders';

export function OverdueReminderPanel({
  rows, residentName, propertyName, collectionsUrl,
  organizationId, propertyId, customerId, onSaved,
}: {
  rows: OverdueReminderRow[];
  residentName: string;
  propertyName: string;
  collectionsUrl: string;
  organizationId: string;
  propertyId: string;
  customerId: string;
  onSaved: () => void;
}) {
  const [style,setStyle] = useState<ReminderStyle>('friendly');
  const [status,setStatus] = useState('');
  const [contactMethod,setContactMethod] = useState<ContactMethod>('phone');
  const [contactOutcome,setContactOutcome] = useState<ContactOutcome>('attempted_no_response');
  const [contactDetails,setContactDetails] = useState('');
  const [followUpOn,setFollowUpOn] = useState('');
  const [saving,setSaving] = useState(false);
  const [contactError,setContactError] = useState('');
  const [contactNotice,setContactNotice] = useState('');
  const requestId = useRef<string | null>(null);
  if (!rows.length) return null;
  const message = draftOverdueReminder({style, residentName, propertyName, rows});
  async function copyForReview() {
    try {
      await navigator.clipboard.writeText(message);
      setStatus('Reminder copied. Review it before sending through your own approved communication channel.');
    } catch {
      setStatus('Automatic copy is unavailable. Select and copy the message from the text box.');
    }
  }
  async function recordManualContact() {
    if (saving) return;
    setContactError('');
    setContactNotice('');
    try {
      const body = manualContactBody(contactMethod,contactOutcome,contactDetails);
      if (followUpOn && !/^\d{4}-\d{2}-\d{2}$/.test(followUpOn))
        throw new Error('Enter a valid follow-up date or leave it blank.');
      if (!requestId.current) requestId.current = crypto.randomUUID();
      setSaving(true);
      const response = await fetch('/api/collections', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          command:'account_note',
          payload:{
            organization_id:organizationId, property_id:propertyId,
            request_id:requestId.current, customer_id:customerId,
            invoice_id: rows.length===1 ? rows[0].invoiceId : null,
            kind:'note',body,follow_up_on:followUpOn || null,
            promised_on:null,promised_amount_cents:null,resolves_id:null,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not record this contact.');
      requestId.current = null;
      setContactDetails('');
      setFollowUpOn('');
      setContactNotice('Manual contact note saved in the audited customer record. No message was sent.');
      onSaved();
    } catch (error) {
      setContactError(error instanceof Error ? error.message : 'Could not record the contact.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="customer-overdue-followup" aria-label="Resident overdue follow-up review">
      <div>
        <h4>Past-due account · review required</h4>
        <p>Recorded overdue balance: <strong>{cents(overdueReminderTotal(rows))}</strong> across
          {' '}{rows.length} issued invoice{rows.length === 1 ? '' : 's'}.</p>
        <p className="muted small">Only actual issued invoices with an overdue ledger status are shown.
          A payment or adjustment may not yet be recorded; verify the account first.</p>
      </div>
      <div className="customer-overdue-items">
        {rows.map(row => <p key={row.invoiceId}>
          <Link href={'/invoices/' + row.invoiceId}>{row.number}</Link>
          {' · '}{cents(row.outstandingCents)} outstanding
          {' · '}due {row.dueOn}
          {' · '}{row.daysPastDue} days past due
        </p>)}
      </div>
      <div className="field">
        <label htmlFor="reminder-style">Reminder style</label>
        <select id="reminder-style" value={style} onChange={e=>{
          setStyle(e.target.value as ReminderStyle); setStatus('');
        }}>
          <option value="friendly">Friendly balance check-in</option>
          <option value="past_due">Past-due balance reminder</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="resident-reminder-draft">Review reminder before copying</label>
        <textarea id="resident-reminder-draft" rows={9} readOnly value={message} />
      </div>
      <div className="customer-overdue-actions">
        <button type="button" className="button secondary" onClick={copyForReview}>
          Copy reminder for review
        </button>
        <Link href={collectionsUrl} className="text-button">Open collections account</Link>
      </div>
      {status && <p role="status" className="muted small">{status}</p>}
      <div className="customer-contact-log" role="group" aria-label="Manual overdue contact log">
        <h4>Record a manual contact attempt</h4>
        <p className="muted small">After contacting or attempting to contact this resident outside
          ForgeOS, record what actually happened. Saving a note does not call, text, email,
          deliver or legally serve any notice. Verify contact preferences and permission first.</p>
        <label>Contact method
          <select aria-label="Manual contact method" value={contactMethod}
            onChange={e=>{setContactMethod(e.target.value as ContactMethod);requestId.current=null;}}>
            {contactMethods.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Reported outcome
          <select aria-label="Manual contact outcome" value={contactOutcome}
            onChange={e=>{setContactOutcome(e.target.value as ContactOutcome);requestId.current=null;}}>
            {contactOutcomes.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>What actually happened (required)
          <textarea aria-label="Manual contact details" rows={3} maxLength={1500}
            value={contactDetails} onChange={e=>{setContactDetails(e.target.value);requestId.current=null;}}
            placeholder="E.g. called number on file, left no voicemail; follow up tomorrow."/>
        </label>
        <label>Next staff follow-up date (optional)
          <input aria-label="Next contact follow-up date" type="date" value={followUpOn}
            onChange={e=>{setFollowUpOn(e.target.value);requestId.current=null;}}/>
        </label>
        <button type="button" className="button primary" disabled={saving || contactDetails.trim().length<3}
          onClick={recordManualContact}>
          {saving ? 'Saving manual contact…' : 'Save manual contact note'}
        </button>
        {contactError && <p role="alert">{contactError}</p>}
        {contactNotice && <p role="status">{contactNotice}</p>}
      </div>
      <p className="muted small">Nothing is sent, scheduled or added to the balance here.
        Staff must verify the recipient, payment history, notice rules and permitted contact method.
        Formal pay-or-quit notices, late fees and eviction timelines require separate authorized review.</p>
    </section>
  );
}
