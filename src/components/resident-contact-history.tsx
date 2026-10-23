'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { AccountNote } from '@/lib/collections-domain';
import { dateAtProperty } from '@/lib/domain';
import { overdueContactHistory } from '@/lib/manual-overdue-contact';
import { manualContactFollowUpStatus } from '@/lib/manual-contact-followup';

export function ResidentContactHistory({
  notes, propertyId, customerId, collectionsUrl,
  organizationId, propertyTimezone, onSaved,
}: {
  notes: AccountNote[];
  propertyId: string;
  customerId: string;
  collectionsUrl: string;
  organizationId: string;
  propertyTimezone: string;
  onSaved: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolutionDetails, setResolutionDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const contacts = overdueContactHistory(notes, propertyId, customerId);
  const today = dateAtProperty(propertyTimezone || 'America/Los_Angeles');

  function startResolution(id: string) {
    setSelectedId(id);
    setResolutionDetails('');
    setError('');
    requestId.current = null;
  }
  async function resolve(contact: AccountNote) {
    if (saving || !contact.follow_up_on ||
      manualContactFollowUpStatus(contact, notes, today).status === 'resolved') return;
    const body=resolutionDetails.trim();
    if (body.length < 3 || body.length > 2000) {
      setError('Explain how this follow-up was completed in 3–2000 characters.');
      return;
    }
    if (!requestId.current) requestId.current=crypto.randomUUID();
    setSaving(true);
    setError('');
    try {
      const response=await fetch('/api/collections',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          command:'account_note',
          payload:{
            organization_id:organizationId,property_id:propertyId,
            request_id:requestId.current,customer_id:customerId,
            invoice_id:contact.invoice_id,kind:'resolution',
            body,follow_up_on:null,promised_on:null,
            promised_amount_cents:null,resolves_id:contact.id,
          },
        }),
      });
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not resolve this follow-up.');
      requestId.current=null;
      setSelectedId(null);
      setResolutionDetails('');
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resolve this follow-up.');
    } finally {
      setSaving(false);
    }
  }

  if (!contacts.length) return null;
  const statuses=contacts.map(contact => manualContactFollowUpStatus(contact,notes,today));
  const due=statuses.filter(item=>item.status==='due').length;
  const scheduled=statuses.filter(item=>item.status==='scheduled').length;

  return (
    <section className="resident-contact-history" aria-label="Resident manual contact history">
      <div className="meter-file-heading">
        <div>
          <h4>Recorded manual contact history</h4>
          <p className="muted small">
            Staff-reported contacts stay in the account after payment.
            A follow-up is closed only when staff explicitly records a resolution.
            These entries are not proof of delivery or legal service.
          </p>
        </div>
        <Link className="text-button" href={collectionsUrl}>All account notes</Link>
      </div>
      <p className="muted small" role="status">
        {due} due follow-up{due===1?'':'s'} · {scheduled} scheduled · Property-local date: {today}
      </p>
      <div className="customer-contact-history">
        {contacts.slice(0,10).map((note,index) => {
          const {status,resolution}=statuses[index];
          return (
            <article key={note.id} aria-label="Manual contact record">
              <strong>{new Date(note.created_at).toLocaleString()}</strong>
              <p className="contact-record-body">{note.body.replace(/^Manual past-due contact\n/,'')}</p>
              {note.follow_up_on && <p>Staff follow-up: {note.follow_up_on}</p>}
              <p className="contact-followup-state">
                {status==='resolved' ? 'Resolved' :
                  status==='due' ? 'Follow-up due' :
                  status==='scheduled' ? 'Scheduled follow-up' : 'No follow-up scheduled'}
              </p>
              {resolution && <div className="contact-resolution-note">
                <p>Resolution recorded: {new Date(resolution.created_at).toLocaleString()}</p>
                <p className="contact-record-body">{resolution.body}</p>
              </div>}
              {note.invoice_id && <p>Linked invoice: <Link href={'/invoices/'+note.invoice_id}>View invoice</Link></p>}
              {note.follow_up_on && status!=='resolved' && (
                <button type="button" className="button secondary"
                  disabled={saving}
                  onClick={()=>startResolution(note.id)}>
                  Resolve this follow-up
                </button>
              )}
              {selectedId===note.id && status!=='resolved' && (
                <div className="contact-resolution-form" role="group" aria-label="Resolve manual follow-up">
                  <p className="muted small">
                    Confirm only after completing or explicitly closing the staff follow-up.
                    Resolution does not collect payment, send a reminder or clear the account balance.
                  </p>
                  <label>Resolution details (required)
                    <textarea aria-label="Resolution details" maxLength={2000}
                      rows={3} value={resolutionDetails}
                      onChange={e=>{setResolutionDetails(e.target.value);requestId.current=null;}} />
                  </label>
                  <div className="customer-overdue-actions">
                    <button className="button primary" type="button"
                      disabled={saving || resolutionDetails.trim().length<3}
                      onClick={()=>resolve(note)}>
                      {saving ? 'Recording resolution…' : 'Record completed follow-up'}
                    </button>
                    <button className="button secondary" type="button" disabled={saving}
                      onClick={()=>{setSelectedId(null);setError('');requestId.current=null;}}>
                      Cancel
                    </button>
                  </div>
                  {error && <p role="alert">{error}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {contacts.length > 10 && <p className="muted small">
        Showing the ten newest contacts. Open Payments &amp; collections for older notes and follow-ups.
      </p>}
    </section>
  );
}
