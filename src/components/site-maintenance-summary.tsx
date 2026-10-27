'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import { opsLabel } from '@/lib/operations-domain';
import { cents } from '@/lib/billing-domain';
import { siteRepeatRepairAlerts } from '@/lib/site-repeat-repairs';
import { siteMaintenanceLink, siteMaintenanceWorkLink, siteMaintenanceCreateLink } from '@/lib/site-maintenance-focus';

// Defined once outside React render to keep the component pure.
const repeatRepairLookback = new Date(Date.now() - 365 * 86400000).toISOString().slice(0,10);

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
  const repeatAlerts = siteRepeatRepairAlerts(work,propertyId,siteId,repeatRepairLookback);
  const staff = current?.data?.context.work ?? [];
  const costs = current?.data?.summary.work_costs ?? [];
  const actualFor = (id: string) => costs.find(row => row.id === id)?.actual_cents;
  const recordedCost = completed.reduce((sum,item) => sum + BigInt(actualFor(item.id) ?? '0'),0n);
  return <section className="site-account-review" aria-label="Site maintenance summary">
    <h3>Site maintenance · live records</h3>
    {!current && <p role="status">Loading site maintenance…</p>}
    {current?.error && <p role="alert">{current.error} Open Maintenance to check the current work orders.</p>}
    {current?.data && <>
      <div className="stat-grid">
        <div className="stat-card"><span>Open work orders</span><strong>{open.length}</strong></div>
        <div className="stat-card"><span>Urgent / high priority</span><strong>{urgent.length}</strong></div>
        <div className="stat-card"><span>Completed records</span><strong>{completed.length}</strong></div>
        <div className="stat-card"><span>Recorded actual costs (completed work)</span><strong>{cents(recordedCost)}</strong></div>
      </div>
      {repeatAlerts.length > 0 && <section className="ops-record" aria-label="Recurring repair category alerts">
        <h4>Repeat repair patterns to investigate</h4>
        <p>Three or more non-cancelled work orders in the same category during the past 365 days. These are review flags, not automatic diagnoses.</p>
        <ul>{repeatAlerts.map(alert=><li key={alert.category}>
          <strong>{opsLabel(alert.category)}</strong>: {alert.count} work orders · latest {alert.latest}
        </li>)}</ul>
        <Link href={siteMaintenanceLink(organizationId,propertyId,siteId)}>Review related repairs at this site</Link>
      </section>}
      {!work.length ? <p>No maintenance work orders are currently linked to this space.</p> :
        <div className="table-wrap" role="region" aria-label="Maintenance history for this site" tabIndex={0}>
          <table><thead><tr><th>Work order</th><th>Priority</th><th>Status</th><th>Requested / completed</th><th>Actual cost</th><th>Assigned</th><th>Details</th></tr></thead>
          <tbody>{[...work].sort((a,b) => b.requested_on.localeCompare(a.requested_on)).slice(0,12).map(item => <tr key={item.id}>
            <th scope="row">{item.number}<small>{item.title}</small></th>
            <td>{opsLabel(item.priority)}</td><td>{opsLabel(item.status)}</td>
            <td>{item.requested_on} / {item.completed_on ?? 'Not completed'}</td>
            <td>{actualFor(item.id) === undefined ? 'Unavailable' : cents(actualFor(item.id)!)}</td>
            <td>{staff.find(person => person.id === item.id)?.assigned_name || 'Not assigned'}</td>
            <td><Link className="button secondary small" href={siteMaintenanceWorkLink(organizationId,propertyId,siteId,item.id)} aria-label={'Open repair '+item.number}>Open repair</Link></td>
          </tr>)}</tbody></table>
        </div>}
      {work.length > 12 && <p className="muted small">Showing 12 most recent linked work orders. Open Maintenance for the full history.</p>}
    </>}
    <div className="action-group">
      <Link className="button secondary" href={siteMaintenanceLink(organizationId,propertyId,siteId)}>Open this site&apos;s maintenance worklist</Link>
      <Link className="button primary" href={siteMaintenanceCreateLink(organizationId,propertyId,siteId)}>Create repair for this site</Link>
    </div>
    <p className="muted small">Cost totals include recorded actual work-order costs for completed or closed repairs only; they are not estimates or proof of payment. Missing costs in individual rows are shown as unavailable, while the total sums recorded figures only. This view uses authorized property maintenance records and does not change work orders.</p>
  </section>;
}
