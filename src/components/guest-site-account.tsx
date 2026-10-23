'use client';
import { useState } from 'react';
import type { DemoCustomer, DemoSite } from '@/components/guest-record-editors';
import { demoNoticeOptions, demoNoticeText, demoRentStatus, rentMonthKey,
  type DemoNoticeKind, type DemoNoticeDraft } from '@/lib/guest-site-account';

export type DemoMeterRecord = { site: string; value: number; usage: number; capturedAt: string };

export function GuestSiteAccount({
  site, customer, readings, notices, paid, today, onRecordSamplePayment, onDraft, onGoMeters,
}: {
  site: DemoSite;
  customer?: DemoCustomer;
  readings: DemoMeterRecord[];
  notices: DemoNoticeDraft[];
  paid: boolean;
  today: string;
  onRecordSamplePayment: (customerId: number) => void;
  onDraft: (customer: DemoCustomer, kind: DemoNoticeKind, text: string) => void;
  onGoMeters: () => void;
}) {
  const [kind, setKind] = useState<DemoNoticeKind>('payment_reminder');
  const month = rentMonthKey(today);
  const status = demoRentStatus(today, site.status === 'occupied' && !!customer, paid);
  const history = readings.filter((r) => r.site === site.id).slice().reverse();
  const draftText = customer ? demoNoticeText(kind, customer.name, site.label, month, site.rent) : '';
  return <section className="demo-panel demo-site-account" aria-label={'Meter and rent account for ' + site.id}>
    <div className="demo-section-head">
      <div><h2>Site account · {site.label}</h2><p>Meter history, monthly rent, past-due flag and communication drafts in one customer-linked file.</p></div>
      <span className={'demo-account-badge ' + status} data-rent-status={status}>
        {status === 'past_due' ? 'RED FLAG · Rent past due' : status === 'paid' ? 'Rent paid' :
          status === 'pending' ? 'Rent due by the 5th' : 'No active customer'}
      </span>
    </div>
    <div className="demo-site-account-cols">
      <div className="demo-account-section">
        <h3>Electric meter &amp; history</h3>
        <p>Reading history belongs to this site. Current and previous readings stay visible when a customer moves out.</p>
        <div className="demo-table-wrap">
          <table className="demo-table" aria-label={'Meter history for ' + site.id}>
            <thead><tr><th>Recorded</th><th>Register</th><th>Usage</th></tr></thead>
            <tbody>{history.slice(0, 40).map((reading, i) => <tr key={i}>
              <td>{reading.capturedAt.slice(0, 10)}</td><td>{reading.value.toLocaleString()} kWh</td><td>+{reading.usage} kWh</td>
            </tr>)}
            {!history.length && <tr><td colSpan={3}>No readings yet for this site.</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" className="demo-small-button" onClick={onGoMeters}>Open meter reader to add a sample reading</button>
      </div>
      <div className="demo-account-section">
        <h3>Monthly rent · {month}</h3>
        <p>Example rent: <strong>{new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(site.rent)}</strong> · Grace through the 5th.</p>
        <p><strong>Customer:</strong> {customer?.name || 'None assigned'}</p>
        <p><strong>Current status:</strong> {status === 'past_due' ? 'Unpaid after the 5th — flag on site map' :
          status === 'paid' ? 'Marked paid for this sample month' :
          status === 'pending' ? 'Unpaid; not overdue until after the 5th' : 'No current rent due in this sample'}</p>
        <p className="demo-caption">Illustration only. A live system must use issued invoices, actual payment allocations and each property's timezone and lease terms.</p>
        {customer && status !== 'paid' &&
          <button type="button" className="demo-small-button" onClick={() => onRecordSamplePayment(customer.id)}>
            Mark sample rent paid for {month}
          </button>}
      </div>
    </div>
    <div className="demo-account-section demo-notice-workflow">
      <h3>Choose notice type · Staff review</h3>
      <p>Drafts stay in this fictional site file. Nothing is sent to a phone, charged, served or scheduled.</p>
      {customer ? <>
        <p><strong>Customer phone:</strong> {customer.phone || 'No phone recorded'} · Requires verified SMS consent and an approved messaging provider before real texting.</p>
        <label htmlFor={'demo-notice-kind-' + site.id}>Notice to prepare
          <select id={'demo-notice-kind-' + site.id} value={kind} onChange={(e) => setKind(e.target.value as DemoNoticeKind)}>
            {demoNoticeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="demo-notice-preview" aria-label={'Notice preview for ' + site.id}>{draftText}</div>
        <button className="demo-small-button" type="button" onClick={() => onDraft(customer, kind, draftText)}>
          Save draft for staff review (no SMS)
        </button>
        <p className="demo-caption">A 3-day pay-or-quit notice requires a jurisdiction-specific legal review and lawful service; a text message alone is not treated as formal service. Late fees and utility charges must not appear in a California 3-day rent demand.</p>
      </> : <p>Assign a customer to this space to prepare a draft.</p>}
      <h3>Saved notice draft history</h3>
      {notices.length ? <ul className="demo-notice-history">{notices.slice().reverse().map((n) =>
        <li key={n.id}><strong>{demoNoticeOptions.find((o) => o.value === n.kind)?.label}</strong> · {n.preparedOn.slice(0, 10)} · Draft only, not sent
          <small>{n.message}</small></li>)}</ul>
      : <p>No notice drafts prepared.</p>}
    </div>
  </section>;
}
