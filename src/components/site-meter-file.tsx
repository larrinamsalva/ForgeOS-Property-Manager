'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Customer, Site } from '@/lib/domain';
import type { BillingSnapshot } from '@/lib/billing-domain';
import { cents } from '@/lib/billing-domain';
import { siteUtilitySummaries } from '@/lib/site-utility-summary';
import { SiteUtilityVoice } from './site-utility-voice';
import { customerName } from '@/lib/domain';
import type { MeterSnapshot } from '@/lib/meter-domain';
import { meterFileEntries } from '@/lib/meter-file';

export function SiteMeterFile({
  organizationId, propertyId, siteId, customerId, customers, site, currentStayId,
}: {
  organizationId: string;
  propertyId: string;
  siteId?: string;
  customerId?: string;
  customers: Customer[];
  site?: Site;
  currentStayId?: string;
}) {
  // A unique response key prevents a prior record's response from appearing
  // inside a different customer's modal during rapid navigation.
  const key = organizationId + ':' + propertyId + ':' + (siteId ?? '') + ':' + (customerId ?? '');
  const [loaded, setLoaded] = useState<{ key: string; data?: MeterSnapshot; error?: boolean } | null>(null);
  const [bill, setBill] = useState<{ key: string; data?: BillingSnapshot; error?: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/meters?organization=' + encodeURIComponent(organizationId), {
      cache: 'no-store', signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Meter reading history unavailable');
        return response.json() as Promise<MeterSnapshot>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setLoaded({ key, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, error: true });
      });
    if (siteId) {
      fetch('/api/billing?organization=' + encodeURIComponent(organizationId), {
        cache: 'no-store', signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error('Billing data unavailable');
        return response.json() as Promise<BillingSnapshot>;
      }).then((data) => {
        if (!controller.signal.aborted) setBill({ key, data });
      }).catch(() => {
        if (!controller.signal.aborted) setBill({ key, error: true });
      });
    }
    return () => controller.abort();
  }, [organizationId, key, siteId]);
  const current = loaded?.key === key ? loaded : null;
  const entries = current?.data
    ? meterFileEntries(current.data, { siteId, customerId }) : [];
  const names = new Map(customers.map((customer) => [customer.id, customerName(customer)]));
  const billCurrent = bill?.key === key ? bill : null;
  const summaries = site && current?.data
    ? siteUtilitySummaries(current.data, site.id, {
      electric: site.electric, water: site.water, gas: site.gas,
    }, currentStayId, billCurrent?.data) : [];
  const utilityName = (kind: string) => kind === 'electric' ? 'Electricity'
    : kind === 'water' ? 'Water' : 'Gas';
  return (
    <section className="meter-file-panel" aria-label="Linked meter reading history">
      <div className="meter-file-heading">
        <div>
          <h3>Meter readings &amp; history</h3>
          <p className="muted small">Original, supervisor-reviewed and dated readings from the tablet reader. Read-only customer/site history.</p>
        </div>
        <Link className="text-button" href={'/meters?' + new URLSearchParams({
          organization: organizationId, property: propertyId,
        })}>Open meter reader <span aria-hidden="true">↗</span></Link>
      </div>
      {!current && <p role="status">Loading meter history…</p>}
      {current?.error && <p role="alert">Meter history is unavailable. Use Meters &amp; reader to check your connection or access.</p>}
      {site && currentStayId && !site.archived_at && (
        <div className="site-monthly-bill-link">
          <div>
            <strong>Monthly billing for {site.label}</strong>
            <p className="muted small">Prepare a rent, electric, water and gas draft from approved records. Nothing is issued from this profile.</p>
          </div>
          <Link className="button primary" href={'/billing?' + new URLSearchParams({
            organization: organizationId, property: propertyId, site: site.id, stay: currentStayId,
          })}>Prepare monthly bill</Link>
        </div>
      )}
      {site && current?.data && (
        <section className="site-utility-section" aria-label="Site water electric gas utility summary">
          <h4>Water, electric &amp; gas · automatic readings</h4>
          <p className="muted small">Usage automatically compares approved readings from the same meter and current stay, including meter multiplier. Exact charges below come only from an issued billing statement.</p>
          <div className="site-utility-grid">
            {summaries.map(card => <article key={card.kind} className="site-utility-card"
              aria-label={utilityName(card.kind) + ' meter details'}>
              <div className="site-utility-card-heading">
                <strong>{utilityName(card.kind)}</strong>
                <span className="utility-chip">{card.available ? 'Available' : 'Not marked as supplied'}</span>
              </div>
              {card.meters.length === 0 ? <p>No active {card.kind} meter linked.</p> :
                card.meters.map(m => <div className="site-utility-meter" key={m.meterId}>
                  <strong>{m.meterLabel}</strong>
                  <dl>
                    <dt>Latest approved</dt>
                    <dd>{m.latestApproved ?? 'Awaiting review'} {m.latestApproved ? m.unit : ''}
                      {m.latestOn && <small>{new Date(m.latestOn).toLocaleDateString()}</small>}</dd>
                    <dt>Previous approved</dt>
                    <dd>{m.previousApproved ?? 'Not available'} {m.previousApproved ? m.unit : ''}</dd>
                    <dt>Auto-calculated register usage</dt>
                    <dd><strong>{m.scaledUsage ?? 'Needs review'} {m.scaledUsage ? m.unit : ''}</strong>
                      <small>{m.notice}</small></dd>
                  </dl>
                </div>)
              }
              <div className="site-utility-bill">
                {billCurrent?.error ? <p role="alert">Issued charge unavailable.</p> :
                  !billCurrent ? <p>Checking issued charges…</p> :
                  card.lastIssued ? <>
                    <small>Last issued {card.kind} charge (including line tax)</small>
                    <strong>{cents(card.lastIssued.amountCents)}</strong>
                    <Link href={'/invoices/' + card.lastIssued.invoiceId}>
                      {card.lastIssued.invoiceNumber} · {card.lastIssued.startsOn} to {card.lastIssued.endsOn}
                    </Link>
                    {card.billedStatus === 'included' && <small>Included in rent per recorded rate</small>}
                  </> : <p>No separate issued {card.kind} charge for the current stay.</p>
                }
              </div>
            </article>)}
          </div>
          <SiteUtilityVoice siteLabel={site.label} cards={summaries} />
          <p className="muted small">A displayed usage figure is not an invoice. Tiered rates, sewer, taxes, discounts, resets and boundary readings are handled by Utilities &amp; billing. No charges are posted from this screen.</p>
        </section>
      )}
      {current?.data && !entries.length && <p>No recorded meter readings for this {siteId ? 'site' : 'customer'} yet.</p>}
      {current?.data && entries.length > 0 && (
        <div className="table-wrap" role="region" aria-label="Linked meter reading table" tabIndex={0}>
          <table className="meter-file-table">
            <thead><tr>
              <th>Captured</th>
              <th>Meter / site</th>
              <th>Reading</th>
              <th>Review</th>
              {siteId && <th>Resident at capture</th>}
            </tr></thead>
            <tbody>
              {entries.map((reading) => <tr key={reading.id}>
                <td>{new Date(reading.capturedAt).toLocaleString()}<small>{reading.recordedOn}</small></td>
                <td><strong>{reading.meterLabel}</strong><small>{reading.siteLabel} · {reading.utility}</small></td>
                <td>{reading.original ?? 'No register value'} {reading.unit}
                  <small>{reading.effective === null ? 'Not approved for billing' :
                    'Reviewed: ' + reading.effective + ' ' + reading.unit}</small>
                </td>
                <td><span className="status-badge">{reading.reviewStatus}</span>
                  {reading.exceptions.length > 0 && <small>{reading.exceptions.join(', ')}</small>}
                </td>
                {siteId && <td>{reading.customerId
                  ? (names.get(reading.customerId) ?? 'Previous customer') : 'Vacant at capture'}</td>}
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {current?.data && entries.length >= 50 && <p className="muted small">
        Showing the latest 50 readings. Open Meters &amp; reader for complete meter history and correction details.
      </p>}
    </section>
  );
}
