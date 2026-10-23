'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cents } from '@/lib/billing-domain';
import { stateLabel, type CollectionsSnapshot } from '@/lib/collections-domain';
import { customerBillingSummary } from '@/lib/customer-billing-file';
import { customerOverdueReminders } from '@/lib/overdue-reminders';
import { OverdueReminderPanel } from './overdue-reminder-panel';
import { ResidentContactHistory } from './resident-contact-history';

export function CustomerBillingFile({
  organizationId, propertyId, customerId, residentName, propertyName, propertyTimezone,
}: { organizationId: string; propertyId: string; customerId: string; residentName: string; propertyName: string; propertyTimezone: string }) {
  const key = organizationId + ':' + propertyId + ':' + customerId;
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data?: CollectionsSnapshot; error?: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/collections?organization=' + encodeURIComponent(organizationId), {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Account not available');
      return response.json() as Promise<CollectionsSnapshot>;
    }).then((data) => {
      if (!controller.signal.aborted) setLoaded({ key, data });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded({ key, error: true });
    });
    return () => controller.abort();
  }, [organizationId, key, refresh]);
  const current = loaded?.key === key ? loaded : null;
  const summary = current?.data ? customerBillingSummary(current.data, customerId, propertyId) : null;
  const overdue = current?.data ? customerOverdueReminders(current.data, propertyId, customerId) : [];
  const refreshHistory = () => {setLoaded(null);setRefresh(v => v+1);};
  const financialUrl = '/collections?' + new URLSearchParams({ organization: organizationId, property: propertyId });
  return (
    <section className="customer-billing-file" aria-label="Customer monthly bills, payments and receipts">
      <div className="meter-file-heading">
        <div>
          <h3>Monthly bills, payments &amp; receipts</h3>
          <p className="muted small">Official issued bills only. Payment status and remaining balance come from the collections ledger.</p>
        </div>
        <div className="customer-billing-actions">
          <button type="button" className="button secondary" onClick={refreshHistory}
            disabled={!current}>Refresh customer billing history</button>
          <Link href={financialUrl} className="button secondary">Payment area &amp; receipts</Link>
        </div>
      </div>
      {!current && <p role="status">Loading customer billing history…</p>}
      {current?.error && <p role="alert">Billing history is unavailable. Open Payments &amp; collections to review the account.</p>}
      {summary && <>
        <div className="customer-bill-stats">
          <div><small>Most recent issued bill total</small><strong>{summary.latestBillCents === null ? 'No bill issued' : cents(summary.latestBillCents)}</strong></div>
          <div><small>Total remaining on issued bills</small><strong>{cents(summary.totalOutstandingCents)}</strong></div>
        </div>
        {!summary.bills.length ? <p>No issued monthly bills yet. Drafts are not payment requests.</p> : (
          <div className="table-wrap" role="region" aria-label="Customer billed totals and payments" tabIndex={0}>
            <table>
              <thead><tr><th>Bill / period</th><th>Total billed</th><th>Applied payments</th><th>Remaining</th><th>Due / state</th></tr></thead>
              <tbody>{summary.bills.slice(0, 12).map((b) => <tr key={b.id}>
                <th scope="row"><Link href={'/invoices/' + b.id}>{b.number}</Link>
                  <small>{b.startsOn} to {b.endsOn} (exclusive)</small></th>
                <td>{cents(b.statementCents)}</td>
                <td>{cents(b.appliedCents)}</td>
                <td><strong>{cents(b.balanceCents)}</strong></td>
                <td>{b.dueOn}<small>{stateLabel(b.status)}</small></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        {summary.bills.length > 12 && <p className="muted small">Showing 12 newest bills; open Payments &amp; collections for full history.</p>}
        {overdue.length > 0 && <OverdueReminderPanel
          rows={overdue}
          residentName={residentName}
          propertyName={propertyName}
          collectionsUrl={financialUrl}
          organizationId={organizationId}
          propertyId={propertyId}
          customerId={customerId}
          onSaved={refreshHistory}
        />}
        <ResidentContactHistory
          notes={current?.data?.notes ?? []}
          propertyId={propertyId}
          customerId={customerId}
          collectionsUrl={financialUrl}
          organizationId={organizationId}
          propertyTimezone={propertyTimezone}
          onSaved={refreshHistory}
        />
        <h4>Payment &amp; receipt history</h4>
        {!summary.receipts.length ? <p>No receipt recorded yet.</p> :
          <div className="customer-receipt-list">
            {summary.receipts.slice(0, 8).map((r) => <div className="customer-receipt-row" key={r.id}>
              <span><strong>{r.number}</strong> · {r.snapshot.effective_on} · {stateLabel(r.snapshot.kind)}
                <small>{cents(r.snapshot.amount_cents)} · {r.snapshot.method ?? 'Adjustment'}</small></span>
              <Link href={'/receipts/' + r.id}>Receipt</Link>
            </div>)}
          </div>
        }
        {summary.receipts.length > 8 && <p className="muted small">More receipts are available in Payments &amp; collections.</p>}
        <p className="muted small">Record money only after it is actually received. Creating a manual payment makes a receipt; allocate it to an issued invoice in Payments &amp; collections. Security deposits stay separate.</p>
      </>}
    </section>
  );
}
