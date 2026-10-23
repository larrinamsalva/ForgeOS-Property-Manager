'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cents } from '@/lib/billing-domain';
import {
  draftOverdueReminder, overdueReminderTotal,
  type ReminderStyle, type OverdueReminderRow,
} from '@/lib/overdue-reminders';

export function OverdueReminderPanel({
  rows, residentName, propertyName, collectionsUrl,
}: {
  rows: OverdueReminderRow[];
  residentName: string;
  propertyName: string;
  collectionsUrl: string;
}) {
  const [style,setStyle] = useState<ReminderStyle>('friendly');
  const [status,setStatus] = useState('');
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
      <p className="muted small">Nothing is sent, scheduled or added to the balance here.
        Staff must verify the recipient, payment history, notice rules and permitted contact method.
        Formal pay-or-quit notices, late fees and eviction timelines require separate authorized review.</p>
    </section>
  );
}
