'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { canEditProperty, dateAtProperty, type Snapshot } from '@/lib/domain';
import { checklistState, type OperationsSnapshot } from '@/lib/operations-domain';
import { latestReview, type MeterSnapshot } from '@/lib/meter-domain';
import { dailyMoveChecklist } from '@/lib/daily-move-checklist';

type Loaded<T> = { status: 'loading' | 'ready' | 'unavailable'; data?: T };
export function EndOfDayReport({ snapshot, propertyId, href }: {
  snapshot: Snapshot;
  propertyId: string;
  href: (section: string, property?: string) => string;
}) {
  const [operations, setOperations] = useState<Loaded<OperationsSnapshot>>({ status: 'loading' });
  const [meters, setMeters] = useState<Loaded<MeterSnapshot>>({ status: 'loading' });
  const properties = snapshot.properties.filter((p) =>
    !p.archived_at && (!propertyId || p.id === propertyId) && canEditProperty(snapshot, p.id, true));
  const scopeIds = properties.map((p) => p.id).join(',');
  useEffect(() => {
    if (!scopeIds) return;
    const controller = new AbortController();
    async function get<T>(endpoint: string, setter: (value: Loaded<T>) => void) {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Could not load authorized records');
        const data = await response.json() as T;
        if (!controller.signal.aborted) setter({ status: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setter({ status: 'unavailable' });
      }
    }
    const org = encodeURIComponent(snapshot.organizationId);
    void get<OperationsSnapshot>('/api/operations?organization=' + org, setOperations);
    void get<MeterSnapshot>('/api/meters?organization=' + org, setMeters);
    return () => controller.abort();
  }, [snapshot.organizationId, scopeIds]);
  if (!properties.length) return null;
  const ready = operations.status === 'ready' && meters.status === 'ready';
  return <section className="panel" id="daily-manager-report" aria-label="End-of-day manager report">
    <div className="panel-heading">
      <div>
        <h2>End-of-day manager report</h2>
        <p>Live operational snapshot for each selected property; read-only and based on saved records.</p>
      </div>
      <button type="button" className="button" disabled={!ready} onClick={() => window.print()}>
        Print / Save PDF
      </button>
    </div>
    {!ready && <p role="status">{operations.status === 'unavailable' || meters.status === 'unavailable'
      ? 'Some operational records are unavailable. Printing is disabled so an incomplete report is not mistaken for complete.'
      : 'Loading authorized maintenance, checklist and meter records…'}</p>}
    {ready && properties.map((property) => {
      const today = dateAtProperty(property.timezone);
      const moves = dailyMoveChecklist(property.id,today,snapshot.reservations,snapshot.stays);
      const work = operations.data!.work.filter((w) => w.property_id === property.id);
      const finished = work.filter((w) => w.completed_on === today && ['completed', 'closed'].includes(w.status));
      const outstanding = work.filter((w) => !['completed', 'closed', 'cancelled'].includes(w.status));
      const overdue = outstanding.filter((w) => w.due_on && w.due_on < today);
      const runs = operations.data!.runs.filter((r) => r.property_id === property.id && r.scheduled_for === today);
      const items = runs.flatMap((r) => r.items.map((item) =>
        checklistState(operations.data!.entries, r.id, item.key)?.status ?? 'open'));
      const completed = items.filter((status) => status === 'done').length;
      const skipped = items.filter((status) => status === 'skipped').length;
      const unresolved = items.length - completed - skipped;
      const pending = meters.data!.readings.filter((reading) => reading.property_id === property.id &&
        !latestReview(reading.id, meters.data!.reviews));
      return <article key={property.id} className="ops-record daily-report-property">
        <h3>Morning priorities — {property.name}</h3>
        <p>Today in {property.timezone}. Review each item before assigning staff; counts do not make changes.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Confirmed arrivals</span><strong>{moves.confirmedArrivals}</strong><Link href={href('reservations',property.id)}>Arrival reservations</Link></div>
          <div className="stat-card"><span>Move-ins recorded today</span><strong>{moves.moveIns}</strong><Link href={href('occupancy',property.id)}>Occupancy records</Link></div>
          <div className="stat-card"><span>Planned departures today</span><strong>{moves.plannedDepartures}</strong><Link href={href('occupancy',property.id)}>Prepare move-outs</Link></div>
          <div className="stat-card"><span>Work orders overdue</span><strong>{overdue.length}</strong><Link href={href('maintenance',property.id)}>Prioritize repairs</Link></div>
          <div className="stat-card"><span>Checklist items unfinished</span><strong>{unresolved}</strong><Link href={href('operations',property.id)}>Assign daily tasks</Link></div>
          <div className="stat-card"><span>Meter readings awaiting review</span><strong>{pending.length}</strong><Link href={href('meters',property.id)}>Review meter queue</Link></div>
        </div>
        <p><strong>Recorded move-outs today:</strong> {moves.completedMoveOuts}. Past-due customer balances remain in authorized Payments &amp; collections.</p>
        <h3>End-of-day status</h3>
        <h3>{property.name} — {today}</h3>
        <p>Property local date ({property.timezone}). Report shows current stored status, not a frozen historical audit.</p>
        <div className="stat-grid">
          <div className="stat-card"><span>Maintenance finished today</span><strong>{finished.length}</strong></div>
          <div className="stat-card"><span>Open maintenance</span><strong>{outstanding.length}</strong>
            <span>{overdue.length} overdue</span></div>
          <div className="stat-card"><span>Checklist results today</span><strong>{completed}/{items.length}</strong>
            <span>{skipped} skipped; {unresolved} unrecorded</span></div>
          <div className="stat-card"><span>Pending meter reviews</span><strong>{pending.length}</strong></div>
        </div>
        <p><strong>Carry into tomorrow:</strong> {overdue.length} overdue work orders, {outstanding.filter((w) => !w.assigned_to).length} unassigned work orders, {unresolved} unrecorded checklist items, and {pending.length} readings requiring review.</p>
        <p className="daily-report-links">
          <Link href={href('maintenance', property.id)}>Maintenance details</Link>{' · '}
          <Link href={href('operations', property.id)}>Checklist history</Link>{' · '}
          <Link href={href('meters', property.id)}>Meter review</Link>{' · '}
          <Link href={href('collections', property.id)}>Authorized office &amp; collections follow-ups</Link>
        </p>
        <p>Office balances and customer issues must be reviewed in the restricted collections workspace; they are not included in this operations-only report.</p>
      </article>;
    })}
  </section>;
}
