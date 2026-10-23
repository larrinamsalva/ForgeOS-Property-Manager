'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Customer } from '@/lib/domain';
import { customerName } from '@/lib/domain';
import type { MeterSnapshot } from '@/lib/meter-domain';
import { meterFileEntries } from '@/lib/meter-file';

export function SiteMeterFile({
  organizationId, propertyId, siteId, customerId, customers,
}: {
  organizationId: string;
  propertyId: string;
  siteId?: string;
  customerId?: string;
  customers: Customer[];
}) {
  // A unique response key prevents a prior record's response from appearing
  // inside a different customer's modal during rapid navigation.
  const key = organizationId + ':' + propertyId + ':' + (siteId ?? '') + ':' + (customerId ?? '');
  const [loaded, setLoaded] = useState<{ key: string; data?: MeterSnapshot; error?: boolean } | null>(null);
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
    return () => controller.abort();
  }, [organizationId, key]);
  const current = loaded?.key === key ? loaded : null;
  const entries = current?.data
    ? meterFileEntries(current.data, { siteId, customerId }) : [];
  const names = new Map(customers.map((customer) => [customer.id, customerName(customer)]));
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
