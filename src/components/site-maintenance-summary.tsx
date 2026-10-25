'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import { opsLabel } from '@/lib/operations-domain';

export function SiteMaintenanceSummary({ organizationId, propertyId, siteId }: {
  organizationId: string; propertyId: string; siteId: string;
}) {
  const key = organizationId + ':' + propertyId + ':' + siteId;
  const [loaded, setLoaded] = useState<{ key: string; data?: OperationsSnapshot; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ organization: organizationId });
    fetch('/api/operations?' + params, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Maintenance details unavailable.');
        return response.json() as Promise<OperationsSnapshot>;
      }).then(data => {
        if (!controller.signal.aborted) setLoaded({ key, data });
      }).catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, error: 'Maintenance details unavailable.' });
      });
    return () => controller.abort();
  }, [key, organizationId]);
  const current = loaded?.key === key ? loaded : null;
  const work = current?.data?.work.filter(item => item.property_id === propertyId && item.site_id === siteId) ?? [];
  const open = work.filter(item => !['completed', 'closed', 'cancelled'].includes(item.status));
  const urgent = open.filter(item => item.priority === 'urgent' || item.priority === 'high');
  const completed = work.filter(item => item.status === 'completed' || item.status === 'closed');
  const staff = current?.data?.context.work ?? [];
  return <section className="site-account-review" aria-label="Site maintenance summary">
    <h3>Site maintenance · live records</h3>
    {!current && <p role="status">Loading site maintenance…</p>}
    {current?.error && <p role="alert">{current.error} Open Maintenance to check the current work orders.</p>}
    {current?.data && <>
      <div className="stat-grid">
        <div className="stat-card"><span>Open work orders</span><strong>{open.length}</strong></div>
        <div className="stat-card"><span>Urgent / high priority</span><strong>{urgent.length}</strong></div>
        <div className="stat-card"><span>Completed records</span><strong>{completed.length}</strong></div>
      </div>
      {!work.length ? <p>No maintenance work orders are currently linked to this space.</p> :
        <div className="table-wrap" role="region" aria-label="Maintenance history for this site" tabIndex={0}>
          <table><thead><tr><th>Work order</th><th>Priority</th><th>Status</th><th>Assigned</th></tr></thead>
          <tbody>{[...work].sort((a,b) => b.requested_on.localeCompare(a.requested_on)).slice(0,12).map(item => <tr key={item.id}>
            <th scope="row">{item.number}<small>{item.title}</small></th>
            <td>{opsLabel(item.priority)}</td><td>{opsLabel(item.status)}</td>
            <td>{staff.find(person => person.id === item.id)?.assigned_name || 'Not assigned'}</td>
          </tr>)}</tbody></table>
        </div>}
      {work.length > 12 && <p className="muted small">Showing 12 most recent linked work orders. Open Maintenance for the full history.</p>}
    </>}
    <Link className="button secondary" href={'/maintenance?' + new URLSearchParams({ organization: organizationId, property: propertyId })}>Open Maintenance</Link>
    <p className="muted small">This view uses authorized property maintenance records. It does not change work orders or mark repairs complete.</p>
  </section>;
}
