'use client';

import { useState } from 'react';
import type { DemoCustomer, DemoSite } from './guest-record-editors';

export type DemoMeterReading = {
  site: string;
  value: number;
  usage: number;
  recordedAt: string;
  customerId: number | null;
};
export type DemoNoticeKind = 'reminder' | 'past_due' | 'late_fee_review' | 'three_day_review';
export type DemoPreparedNotice = {
  id: number;
  siteId: string;
  customerId: number;
  kind: DemoNoticeKind;
  preparedAt: string;
  message: string;
};

export function demoRentMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return { key: part('year') + '-' + part('month'), day: Number(part('day')) };
}
export function demoRentIsPastDue(
  site: DemoSite, customer: DemoCustomer | undefined,
  paid: Record<string, boolean>, month = demoRentMonth()
): boolean {
  // Fictional demo convention only: rent starts unrecorded/unpaid for the
  // sample month. Production MUST check issued invoice balances instead.
  return site.status === 'occupied' && !!customer && month.day > 5 &&
    paid[customer.id + ':' + month.key] !== true;
}

export function GuestSiteLedger({
  site, customer, customers, readings, paid, notices, customerView = false, onSetPaid, onPrepare,
}: {
  site?: DemoSite;
  customer?: DemoCustomer;
  customerView?: boolean;
  customers: DemoCustomer[];
  readings: DemoMeterReading[];
  paid: Record<string, boolean>;
  notices: DemoPreparedNotice[];
  onSetPaid: (customerId: number, value: boolean) => void;
  onPrepare: (notice: Omit<DemoPreparedNotice, 'id'>) => void;
}) {
  const [kind, setKind] = useState<DemoNoticeKind>('reminder');
  const [feeAmount, setFeeAmount] = useState('25');
  const [error, setError] = useState('');
  const month = demoRentMonth();
  const key = customer ? customer.id + ':' + month.key : '';
  const rentPaid = !!key && paid[key] === true;
  const pastDue = site ? demoRentIsPastDue(site, customer, paid, month) : false;
  const siteReadings = site ? readings.filter((reading) => reading.site === site.id) : [];
  const customerReadings = customer ? readings.filter((reading) => reading.customerId === customer.id) : [];
  const displayReadings = customerView ? customerReadings : site ? siteReadings : customerReadings;
  const noticeHistory = notices.filter((n) => n.customerId === customer?.id &&
    (!site || n.siteId === site.id));
  const canPrepare = !!site && !!customer && site.status === 'occupied';

  function prepare() {
    if (!site || !customer || !canPrepare) return;
    if (kind === 'late_fee_review' &&
      (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(feeAmount) || Number(feeAmount) <= 0 ||
      Number(feeAmount) > 10000)) {
      setError('Enter a sample late fee greater than $0, up to $10,000.');
      return;
    }
    const intro = `Example for ${customer.name}, ${site.label}: `;
    const messages: Record<DemoNoticeKind, string> = {
      reminder: intro + `This is a friendly reminder that rent for ${month.key} is due on the 5th. Please contact the office about your account.`,
      past_due: intro + `Our fictional ledger shows the monthly rent for ${month.key} as past due. Please contact the office to verify the balance and arrange payment.`,
      late_fee_review: intro + `A proposed late fee of $${Number(feeAmount).toFixed(2)} is awaiting owner review. No fee has been charged. Check your lease, grace period and local law before approval.`,
      three_day_review: intro + 'LEGAL REVIEW REQUIRED: This is only a placeholder for a possible three-day pay-or-quit notice. The owner must verify the balance, applicable law, notice wording, and legally valid method of service. This draft is NOT a served notice.',
    };
    onPrepare({
      siteId: site.id, customerId: customer.id, kind, message: messages[kind],
      preparedAt: new Date().toISOString(),
    });
    setError('');
  }

  return <section className="demo-panel demo-site-ledger"
    aria-label={site ? 'Meter and rent history for ' + site.id : 'Meter and rent history for ' + (customer?.name ?? 'customer')}>
    <div className="demo-section-head"><div>
      <h2>Meter readings, rent &amp; notice history</h2>
      <p>{site ? 'Site ' + site.label : customer?.name} · All entries shown are fictional and local to this demo.</p>
    </div>{pastDue && <span className="demo-overdue-badge">Past due after the 5th</span>}</div>
    <div className="demo-ledger-grid">
      <div>
        <h3>Monthly rent status · {month.key}</h3>
        {customer && site ? <>
          <p>{customer.name} · {site.label} · {site.rent.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per month</p>
          <p className={pastDue ? 'demo-ledger-overdue' : ''}>
            {rentPaid ? 'Marked paid for this demo month.' : month.day > 5
              ? 'Sample rent not marked paid by the 5th — red flag shown on site map.'
              : 'Due on the 5th — sample payment not recorded yet.'}
          </p>
          <div className="demo-ledger-actions">
            <button type="button" className="demo-small-button" onClick={() => onSetPaid(customer.id, true)}>Mark sample rent paid</button>
            <button type="button" className="demo-small-button" onClick={() => onSetPaid(customer.id, false)}>Mark sample rent unpaid</button>
          </div>
        </> : <p>No currently assigned resident to assess. Past tenants keep their own historical readings.</p>}
        <small>Demo status only, not a payment receipt or real invoice. Real overdue balances must use issued bills and actual posted payments.</small>
      </div>
      <div>
        <h3>{customerView || !site ? 'Customer meter-reading history' : 'Site meter-reading history'}</h3>
        {displayReadings.length ? <div className="demo-ledger-history">
          {[...displayReadings].reverse().map((r, i) => <div key={r.recordedAt + ':' + i}>
            <strong>{r.site} · {r.value.toLocaleString()} kWh</strong>
            <span>Usage +{r.usage} kWh · {new Date(r.recordedAt).toLocaleString()}</span>
            {site && <small>Resident at reading: {customers.find((c) => c.id === r.customerId)?.name ?? 'No customer assigned'}</small>}
          </div>)}
        </div> : <p>No sample readings on this {site ? 'site' : 'customer file'} yet. Add one from Meter readings.</p>}
      </div>
    </div>
    {site && <div className="demo-ledger-notices">
      <h3>Past-due actions &amp; notice drafts</h3>
      <p>Select a notice for the correct customer and review it before contacting them.</p>
      <div className="demo-ledger-actions">
        <label>Choose action
          <select aria-label="Past-due notice action" value={kind} onChange={(e) => setKind(e.target.value as DemoNoticeKind)}>
            <option value="reminder">Rent payment reminder</option>
            <option value="past_due">Past-due warning</option>
            <option value="late_fee_review">Late fee — owner review</option>
            <option value="three_day_review">3-day pay or quit — legal review only</option>
          </select>
        </label>
        {kind === 'late_fee_review' && <label>Proposed fee ($)
          <input type="number" aria-label="Proposed late fee" min="0.01" max="10000" step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)}/>
        </label>}
        <button type="button" className="demo-action" disabled={!canPrepare} onClick={prepare}>Prepare sample notice</button>
      </div>
      {error && <p className="demo-record-error" role="alert">{error}</p>}
      <p className="demo-ledger-caution">No automatic texts, legal notices or late fees are sent from the guest demo. Real SMS requires a connected messaging provider, verified consent and owner-approved rules. A 3-day notice may need legally prescribed service beyond texting.</p>
    </div>}
    {noticeHistory.length > 0 && <div className="demo-ledger-notices">
      <h3>Prepared notices · not sent</h3>
      {noticeHistory.slice().reverse().map((n) => <div className="demo-ledger-draft" key={n.id}>
        <strong>{n.kind.replaceAll('_', ' ')} · {new Date(n.preparedAt).toLocaleString()} · DRAFT</strong>
        <p>{n.message}</p>
        <small>Addressed to customer #{n.customerId} at site {n.siteId}. No SMS was transmitted.</small>
      </div>)}
    </div>}
  </section>;
}
