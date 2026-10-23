'use client';

import Link from 'next/link';
import type { AccountNote } from '@/lib/collections-domain';
import { overdueContactHistory } from '@/lib/manual-overdue-contact';

export function ResidentContactHistory({
  notes, propertyId, customerId, collectionsUrl,
}: {
  notes: AccountNote[];
  propertyId: string;
  customerId: string;
  collectionsUrl: string;
}) {
  const contacts = overdueContactHistory(notes, propertyId, customerId);
  if (!contacts.length) return null;
  return (
    <section className="resident-contact-history" aria-label="Resident manual contact history">
      <div className="meter-file-heading">
        <div>
          <h4>Recorded manual contact history</h4>
          <p className="muted small">
            These are preserved staff-reported contact attempts from the resident account,
            including those recorded before a balance was paid. They are not proof that
            ForgeOS delivered any message or legal notice.
          </p>
        </div>
        <Link className="text-button" href={collectionsUrl}>All account notes</Link>
      </div>
      <div className="customer-contact-history">
        {contacts.slice(0,10).map(note => (
          <article key={note.id}>
            <strong>{new Date(note.created_at).toLocaleString()}</strong>
            <p className="contact-record-body">{note.body.replace(/^Manual past-due contact\n/,'')}</p>
            {note.follow_up_on && <p>Staff follow-up: {note.follow_up_on}</p>}
            {note.invoice_id && <p>Linked invoice: <Link href={'/invoices/'+note.invoice_id}>View invoice</Link></p>}
          </article>
        ))}
      </div>
      {contacts.length > 10 && <p className="muted small">
        Showing the ten newest entries. Open Payments &amp; collections for all notes and follow-ups.
      </p>}
    </section>
  );
}
