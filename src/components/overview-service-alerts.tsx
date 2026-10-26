'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@/lib/domain';
import { canEditProperty, dateAtProperty } from '@/lib/domain';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import { latestReview, type MeterSnapshot } from '@/lib/meter-domain';

type Load<T> = { status: 'loading' | 'ready' | 'unavailable'; data?: T };
export function OverviewServiceAlerts({ snapshot, propertyId, href }: {
  snapshot: Snapshot;
  propertyId: string;
  href: (target: string, property?: string) => string;
}) {
  const [operations, setOperations] = useState<Load<OperationsSnapshot>>({ status: 'loading' });
  const [meters, setMeters] = useState<Load<MeterSnapshot>>({ status: 'loading' });
  const authorized = snapshot.properties.filter((p) =>
    !p.archived_at && (!propertyId || p.id === propertyId) &&
    (canEditProperty(snapshot, p.id, true) ||
      snapshot.propertyMemberships.some((m) => m.user_id === snapshot.userId && m.property_id === p.id && m.role === 'maintenance'))
  );
  const authorizedIds = new Set(authorized.map((p) => p.id));
  useEffect(() => {
    const controller = new AbortController();
    async function load<T>(path: string, setter: (v: Load<T>) => void) {
      try {
        const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json() as T;
        if (!controller.signal.aborted) setter({ status: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setter({ status: 'unavailable' });
      }
    }
    if (!authorizedIds.size) return;
    load<OperationsSnapshot>('/api/operations?organization=' + encodeURIComponent(snapshot.organizationId), setOperations);
    load<MeterSnapshot>('/api/meters?organization=' + encodeURIComponent(snapshot.organizationId), setMeters);
    return () => controller.abort();
  // Scope to the currently selected authorized property; no access without a matching staff role.
  }, [snapshot.organizationId, propertyId, snapshot.userId, authorizedIds.size]);
  if (!authorizedIds.size) return null;
  const openWork = operations.data?.work.filter((w) => authorizedIds.has(w.property_id) &&
    !['completed', 'closed', 'cancelled'].includes(w.status)) ?? [];
  const overdue = openWork.filter((w) => {
    const property = authorized.find((p) => p.id === w.property_id);
    return !!w.due_on && !!property && w.due_on < dateAtProperty(property.timezone);
  }).length;
  const unassigned = openWork.filter((w) => !w.assigned_to).length;
  const scopedReadings = meters.data?.readings.filter(r => authorizedIds.has(r.property_id)) ?? [];
  const pendingReviews = scopedReadings.filter(r => !latestReview(r.id, meters.data!.reviews)).length;
  const reviewedReadings = scopedReadings.filter(r => !!latestReview(r.id, meters.data!.reviews)).length;
  const metric = (load: Load<unknown>, value: number) =>
    load.status === 'ready' ? String(value) : load.status === 'loading' ? 'Checking…' : 'Unavailable';
  return <section className="panel" aria-label="Maintenance and meter alerts">
    <h2>Maintenance &amp; meter alerts</h2>
    <p>Live staff queues from authorized property records. Missing data is never shown as zero.</p>
    <div className="stat-grid">
      <div className="stat-card"><span>Open maintenance orders</span><strong>{metric(operations, openWork.length)}</strong>
        <Link href={href('maintenance')}>Open maintenance board</Link></div>
      <div className="stat-card"><span>Overdue maintenance</span><strong>{metric(operations, overdue)}</strong>
        <Link href={href('maintenance')}>View work orders</Link></div>
      <div className="stat-card"><span>Unassigned work orders</span><strong>{metric(operations, unassigned)}</strong>
        <Link href={href('maintenance')}>Assign workers</Link></div>
      <div className="stat-card"><span>Meter readings reviewed</span><strong>{metric(meters, reviewedReadings)}</strong>
        <Link href={href('meters')}>View meter history</Link></div>
      <div className="stat-card"><span>Meter readings awaiting review</span><strong>{metric(meters, pendingReviews)}</strong>
        <Link href={href('meters')}>Review readings</Link></div>
    </div>
    <p>Readings due on a schedule will be added only when verified route requirements are available.</p>
  </section>;
}
