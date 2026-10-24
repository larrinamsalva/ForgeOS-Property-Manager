'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Caravan,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Users,
  Layers3,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import type { Property, Site, Snapshot, Stay } from '@/lib/domain';
import type { SiteOverdueFlag } from '@/lib/site-overdue';
import type { OperationsSnapshot } from '@/lib/operations-domain';
import type { AccountNote } from '@/lib/collections-domain';
import { overviewStaffTasks } from '@/lib/overview-staff-tasks';
import { pastDueSiteReviewRows, pastDueSiteReviewCsv } from '@/lib/past-due-site-review';
import { cents } from '@/lib/billing-domain';
import {
  canEditProperty,
  customerName,
  dateAtProperty,
  isCurrentStay,
  money,
  siteStatus,
} from '@/lib/domain';
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="status-dot" />
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Layers3 size={25} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function StayHistory({
  stays,
  snapshot,
  onMoveout,
  onPlan,
  onTransfer,
}: {
  stays: Stay[];
  snapshot: Snapshot;
  onMoveout?: (id: string) => void;
  onPlan?: (id: string) => void;
  onTransfer?: (id: string) => void;
}) {
  if (!stays.length)
    return (
      <Empty title="No stays recorded yet">Occupancy history will appear here after the first move-in.</Empty>
    );
  return (
    <div className="table-wrap" role="region" aria-label="Occupancy records" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Site / unit</th>
            <th>Move-in</th>
            <th>Departure</th>
            <th>Agreed rent</th>
            <th>Status</th>
            <th>Handover</th>
            {onMoveout && (
              <th>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {[...stays]
            .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
            .map((stay) => (
              <tr key={stay.id}>
                <td>
                  <strong>{customerName(snapshot.customers.find((c) => c.id === stay.customer_id))}</strong>
                </td>
                <td>
                  {snapshot.sites.find((s) => s.id === stay.site_id)?.label ?? 'Archived site'}
                  {stay.previous_stay_id && (
                    <small>
                      Transferred from{' '}
                      {snapshot.sites.find(
                        (s) => s.id === snapshot.stays.find((o) => o.id === stay.previous_stay_id)?.site_id
                      )?.label ?? 'earlier stay'}
                    </small>
                  )}
                </td>
                <td>{stay.starts_on}</td>
                <td>
                  {stay.ends_on ?? '—'}
                  {!stay.ends_on && (
                    <small>{stay.planned_ends_on ? `Planned: ${stay.planned_ends_on}` : 'Open-ended'}</small>
                  )}
                </td>
                <td>
                  {money(stay.agreed_rate_cents)}
                  <small>/ {stay.billing_period ?? 'monthly'}</small>
                </td>
                <td>
                  <Badge status={stay.ends_on ? 'completed' : 'active'} />
                </td>
                <td>
                  {[
                    stay.occupants,
                    stay.vehicle_details,
                    stay.arrival_condition,
                    stay.departure_condition,
                    stay.initial_meter_notes,
                    stay.final_meter_notes,
                    stay.deposit_notes,
                    stay.handover_notes,
                    stay.document_reference,
                    stay.plan_notes,
                    stay.notes,
                  ].some(Boolean) || stay.maintenance_needed ? (
                    <details className="handover-notes">
                      <summary>View handover</summary>
                      {Object.entries({
                        Occupants: stay.occupants,
                        Vehicle: stay.vehicle_details,
                        'Move-in condition': stay.arrival_condition,
                        'Initial meter notes': stay.initial_meter_notes,
                        'Document reference': stay.document_reference,
                        'Move-out condition': stay.departure_condition,
                        'Final meter notes': stay.final_meter_notes,
                        'Billing / deposit notes': stay.deposit_notes,
                        'Departure notes': stay.handover_notes,
                        'Departure plan': stay.plan_notes,
                        'Stay notes': stay.notes,
                      })
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <p key={k}>
                            <strong>{k}:</strong> {v}
                          </p>
                        ))}
                      {stay.maintenance_needed && <p>Maintenance follow-up needed</p>}
                    </details>
                  ) : (
                    '—'
                  )}
                </td>
                {onMoveout && (
                  <td className="row-actions">
                    {!stay.ends_on && canEditProperty(snapshot, stay.property_id, true) && (
                      <>
                        {onPlan && (
                          <button className="text-button" onClick={() => onPlan(stay.id)}>
                            Departure plan
                          </button>
                        )}
                        {onTransfer && (
                          <button className="text-button" onClick={() => onTransfer(stay.id)}>
                            Transfer
                          </button>
                        )}
                        <button className="text-button" onClick={() => onMoveout(stay.id)}>
                          Move out
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function SiteMap({
  sites,
  snapshot,
  onSelect,
  overdueSites = {},
  financialStatus = 'restricted',
}: {
  sites: Site[];
  snapshot: Snapshot;
  onSelect: (id: string) => void;
  overdueSites?: Record<string, SiteOverdueFlag>;
  financialStatus?: string;
}) {
  const [reviewSearch, setReviewSearch] = useState('');
  const [safetyWork, setSafetyWork] = useState<OperationsSnapshot['work'] | null>(null);
  const [safetyError, setSafetyError] = useState('');
  useEffect(() => {
    if (!sites.length || !snapshot.organizationId) return;
    const controller = new AbortController();
    const today = new Date().toISOString().slice(0, 10);
    fetch('/api/operations?' + new URLSearchParams({
      organization: snapshot.organizationId, starts: today, ends: today,
    }), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Safety maintenance records unavailable');
        return response.json() as Promise<OperationsSnapshot>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setSafetyWork(data.work.filter((work) => sites.some((site) => site.id === work.site_id)));
          setSafetyError('');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSafetyWork(null);
          setSafetyError(error instanceof Error ? error.message : 'Safety records unavailable');
        }
      });
    return () => controller.abort();
  }, [snapshot.organizationId, sites]);
  const activeSafety = (safetyWork ?? []).filter((work) => !['closed', 'cancelled'].includes(work.status));
  const safetyForSite = (siteId: string) => {
    const open = activeSafety.filter((work) => work.site_id === siteId);
    return open.some((work) => work.priority === 'urgent') ? 'red' :
      open.length ? 'yellow' : 'green';
  };
  if (!sites.length)
    return (
      <Empty title="Your layout starts with a site">
        Add sites and set their map rows and columns to build a practical property grid.
      </Empty>
    );
  const cells = new Map<string, Site[]>();
  for (const site of sites) {
    const key = `${site.map_x}:${site.map_y}`;
    cells.set(key, [...(cells.get(key) ?? []), site]);
  }
  const columns = Math.max(...sites.map((s) => s.map_x)) + 1;
  const pastDueRows = financialStatus === 'ready'
    ? pastDueSiteReviewRows(sites, overdueSites, snapshot.stays, snapshot.customers, snapshot.properties)
    : [];
  const outstandingCents = pastDueRows.reduce((sum, row) => sum + BigInt(row.outstandingCents), 0n);
  const visibleReview = pastDueRows.filter(row =>
    (row.siteLabel + ' ' + row.resident).toLowerCase().includes(reviewSearch.trim().toLowerCase()));
  const overdueCount = pastDueRows.length;
  function downloadOverdueReview() {
    // Export only the currently authorized/visible records. No outbound sending.
    if (financialStatus !== 'ready' || !visibleReview.length) return;
    const content = pastDueSiteReviewCsv(visibleReview);
    const url = URL.createObjectURL(new Blob([content], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ForgeOS-past-due-site-review.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      {financialStatus === 'ready' && <p className="muted small" role="status">
        {overdueCount} occupied site{overdueCount === 1 ? '' : 's'} with overdue issued balances.
        Flags use actual invoice status, not the day of the month alone.
      </p>}
      {financialStatus === 'loading' && <p className="muted small" role="status">Checking issued invoice balances…</p>}
      {financialStatus === 'unavailable' && <p className="muted small" role="alert">
        Financial flags are unavailable. Open Payments &amp; collections to review balances.
      </p>}
      {financialStatus === 'ready' && overdueCount > 0 && (
        <section className="map-overdue-queue" aria-label="Past-due site review queue">
          <div className="map-overdue-queue-heading">
            <div>
              <h3>Sites needing a payment review</h3>
              <p className="muted small">Verified current-resident balances on issued overdue invoices only.
                Click a space to review the current stay, bills, receipts and optional reminder draft.</p>
            </div>
            <div className="map-overdue-queue-total">
              <strong>{cents(outstandingCents)}</strong>
              <small>Outstanding on {overdueCount} flagged site{overdueCount === 1 ? '' : 's'}</small>
            </div>
          </div>
          <div className="map-overdue-controls">
            <label className="map-overdue-queue-search">Find flagged space or resident
              <input type="search" aria-label="Find flagged space or resident"
                value={reviewSearch} onChange={e => setReviewSearch(e.target.value)}
                placeholder="Search space or resident" />
            </label>
            <button type="button" className="button secondary"
              disabled={!visibleReview.length} onClick={downloadOverdueReview}>
              Export filtered overdue review (CSV)
            </button>
          </div>
          {visibleReview.length ? (
            <div className="table-wrap" role="region" aria-label="Past-due sites and balances" tabIndex={0}>
              <table>
                <thead><tr>
                  <th scope="col">Site / resident</th>
                  <th scope="col">Issued overdue invoices</th>
                  <th scope="col">Oldest recorded due date</th>
                  <th scope="col">Longest past-due age</th>
                  <th scope="col">Verified outstanding</th>
                  <th scope="col">Review</th>
                </tr></thead>
                <tbody>{visibleReview.map(row => (
                  <tr key={row.siteId}>
                    <th scope="row"><strong>{row.siteLabel}</strong><small>{row.resident}</small>
                      <small>{row.propertyName}</small></th>
                    <td>{row.invoiceCount}</td>
                    <td>{row.earliestDueOn ?? 'Not available'}</td>
                    <td>{row.maxDaysPastDue === null ? 'Not available' :
                      row.maxDaysPastDue + ' days'}</td>
                    <td><strong className="map-overdue-amount">{cents(row.outstandingCents)}</strong></td>
                    <td><button type="button" className="button secondary small"
                      onClick={() => onSelect(row.siteId)}
                      aria-label={'Review account at ' + row.siteLabel}>Review site account</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p>No past-due sites match this search.</p>}
          <p className="muted small">The due date and days overdue come from recorded account data.
            They do not set an eviction deadline. The exported file contains resident financial
            information; store and share it securely.</p>
          <p className="muted small">This is an internal review queue, not a legal notice.
            Confirm recent payments, account holds and local rules before any staff follow-up.
            No reminder is automatically sent and no late fee is applied.</p>
        </section>
      )}
      <section aria-label="Property safety map status">
        <h3>Maintenance safety indicators</h3>
        <p className="muted small">Red = urgent open work order; yellow = another open work order; green = no open work orders currently recorded. Green does not certify a site as safe or inspected. Indicators are separate from rent and occupancy flags.</p>
        {safetyError && <p role="status">{safetyError}. Safety indicators are unavailable; do not assume sites are clear.</p>}
        {!safetyError && safetyWork === null && <p role="status">Loading site maintenance indicators…</p>}
        {safetyWork && <p role="status">{sites.filter((site) => safetyForSite(site.id) === 'red').length} urgent sites · {sites.filter((site) => safetyForSite(site.id) === 'yellow').length} sites with other open work orders.</p>}
      </section>
      <div className="map-scroll">
        <div
          className="property-grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(108px,1fr))`,
            minWidth: Math.max(columns * 115, 350),
          }}
        >
          {[...cells].map(([key, cell]) => (
            <div
              key={key}
              className="map-cell"
              style={{ gridColumn: cell[0].map_x + 1, gridRow: cell[0].map_y + 1 }}
            >
              {cell.map((site) => {
                const timezone =
                  snapshot.properties.find((p) => p.id === site.property_id)?.timezone ??
                  'America/Los_Angeles';
                const status = siteStatus(
                  site,
                  snapshot.stays,
                  dateAtProperty(timezone),
                  snapshot.reservations
                );
                const Icon = site.kind === 'apartment' ? Building2 : Caravan;
                const overdue = overdueSites[site.id];
                return (
                  <button
                    className={`map-site map-${status}${overdue ? ' map-site-overdue' : ''}`}
                    key={site.id}
                    onClick={() => onSelect(site.id)}
                  >
                    <span className="map-site-top">
                      <Icon size={17} />
                      <span className="status-dot" />
                    </span>
                    <strong>{site.label}</strong>
                    <span>{status.replaceAll('_', ' ')}</span>
                    {safetyWork && <span className="map-safety-label" aria-label={'Maintenance status: ' + safetyForSite(site.id)}>
                      {safetyForSite(site.id) === 'red' ? '🔴 Urgent repair' : safetyForSite(site.id) === 'yellow' ? '🟡 Open repair' : '🟢 No open repairs'}
                    </span>}
                    {overdue && <span className="map-arrears-label">PAST DUE · {cents(overdue.outstandingCents)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="map-legend">
        {['available', 'reserved', 'occupied', 'in_preparation', 'blocked', 'out_of_service'].map((s) => (
          <Badge key={s} status={s} />
        ))}
      </div>
      <p className="muted small">
        Layout grid · Positions are stored with each site. Select a site to view its record.
      </p>
    </>
  );
}
export function Overview({
  snapshot,
  properties,
  sites,
  href,
  addProperty,
  viewSite,
  overdueSites = {},
  financialStatus = 'restricted',
  financialNotes = [],
}: {
  snapshot: Snapshot;
  properties: Property[];
  sites: Site[];
  href: (section: string, property?: string) => string;
  addProperty?: () => void;
  viewSite: (id: string) => void;
  overdueSites?: Record<string, SiteOverdueFlag>;
  financialStatus?: string;
  financialNotes?: AccountNote[];
}) {
  const propertyIds = new Set(properties.filter((p) => !p.archived_at).map((p) => p.id));
  const activeSites = sites.filter((s) => !s.archived_at && propertyIds.has(s.property_id));
  const status = (site: Site) =>
    siteStatus(
      site,
      snapshot.stays,
      dateAtProperty(
        snapshot.properties.find((p) => p.id === site.property_id)?.timezone ?? 'America/Los_Angeles'
      ),
      snapshot.reservations
    );
  const occupied = activeSites.filter((s) => status(s) === 'occupied').length;
  const available = activeSites.filter((s) => status(s) === 'available').length;
  const preparation = activeSites.filter((s) => status(s) === 'in_preparation').length;
  const unavailable = activeSites.filter((s) => ['blocked', 'out_of_service'].includes(status(s))).length;
  const overdueCount = activeSites.filter((site) => !!overdueSites[site.id]).length;
  const authorizedFinancialProperties = properties.filter(p =>
    !p.archived_at && canEditProperty(snapshot,p.id,true));
  const staffTasks = financialStatus === 'ready'
    ? overviewStaffTasks(financialNotes,authorizedFinancialProperties) : [];
  const dueStaffTasks = staffTasks.filter(task => task.state === 'due').length;
  const scheduledStaffTasks = staffTasks.length - dueStaffTasks;
  const staffTaskDestination = staffTasks[0]?.propertyId ?? authorizedFinancialProperties[0]?.id;
  const staffTaskLink = staffTaskDestination
    ? href('collections',staffTaskDestination) + '&focus=followups' : '';
  const arrivals = snapshot.reservations.filter(
    (r) =>
      propertyIds.has(r.property_id) &&
      r.status === 'confirmed' &&
      r.starts_on ===
        dateAtProperty(
          snapshot.properties.find((p) => p.id === r.property_id)?.timezone ?? 'America/Los_Angeles'
        )
  ).length;
  const currentStays = snapshot.stays.filter(
    (s) =>
      propertyIds.has(s.property_id) &&
      isCurrentStay(
        s,
        dateAtProperty(
          snapshot.properties.find((p) => p.id === s.property_id)?.timezone ?? 'America/Los_Angeles'
        )
      )
  );
  const stats = [
    { label: 'Properties', value: propertyIds.size, description: 'In this view', icon: Building2 },
    { label: 'Sites & units', value: activeSites.length, description: 'Active inventory', icon: Caravan },
    {
      label: 'Occupied',
      value: occupied,
      description: `${activeSites.length ? Math.round((occupied / activeSites.length) * 100) : 0}% occupancy`,
      icon: Users,
    },
    { label: 'Available', value: available, description: 'Ready for move-in', icon: CheckCircle2 },
  ];
  return (
    <>
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Your operation, connected</span>
          <h2>
            A clearer view of
            <br />
            every property.
          </h2>
          <p>
            Your sites, customers, and occupancy.
            <br />
            Together in one dependable workspace.
          </p>
          <Link className="button hero-button" href={href('map')}>
            Open property map <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-map">
            <span className="hero-office">
              <Building2 size={32} />
            </span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`hero-site hero-site-${i}`}>
                <Caravan size={24} />
              </span>
            ))}
            <span className="hero-road" />
          </div>
          <div className="hero-caption">
            <ShieldCheck size={17} />
            Your property. Your control.
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label="Operational totals">
        {stats.map(({ label, value, description, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">
              {label}
              <span className="stat-icon">
                <Icon size={18} />
              </span>
            </div>
            <strong>{value}</strong>
            <span>{description}</span>
          </div>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Portfolio</span>
              <h2>Your properties</h2>
            </div>
            <Link href={href('properties')} className="text-button">
              View all <ArrowUpRight size={16} />
            </Link>
          </div>
          {!properties.length ? (
            <Empty
              title="Add your first property"
              action={
                addProperty && (
                  <button className="button primary" onClick={addProperty}>
                    <Plus size={16} />
                    Add property
                  </button>
                )
              }
            >
              Start with an RV park, apartment building, or rental property.
            </Empty>
          ) : (
            <div className="portfolio-list">
              {properties
                .filter((p) => !p.archived_at)
                .map((property) => {
                  const list = activeSites.filter((s) => s.property_id === property.id);
                  const count = list.filter((s) => status(s) === 'occupied').length;
                  const percent = list.length ? Math.round((count / list.length) * 100) : 0;
                  return (
                    <Link href={href('sites', property.id)} className="portfolio-row" key={property.id}>
                      <span className="property-icon">
                        {property.category === 'apartments' ? <Building2 size={25} /> : <Caravan size={25} />}
                      </span>
                      <div className="portfolio-info">
                        <strong>{property.name}</strong>
                        <span>
                          <MapPin size={12} />
                          {[property.city, property.state].filter(Boolean).join(', ') || 'Location not added'}
                        </span>
                        <div className="occupancy-bar">
                          <span style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                      <div className="portfolio-meta">
                        <strong>
                          {count}
                          <small> / {list.length}</small>
                        </strong>
                        <span>occupied</span>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  );
                })}
            </div>
          )}
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Today’s operations</span>
              <h2>Keep things moving</h2>
            </div>
            <Clock3 size={20} />
          </div>
          <Link href={href('sites')} className="attention-row">
            <span className="attention-icon amber">
              <Clock3 size={19} />
            </span>
            <div>
              <strong>Sites in preparation</strong>
              <span>Review before the next move-in</span>
            </div>
            <b>{preparation}</b>
            <ArrowRight size={15} />
          </Link>
          <Link href={href('reservations')} className="attention-row">
            <span className="attention-icon slate">
              <ArrowRight size={19} />
            </span>
            <div>
              <strong>Arrivals today</strong>
              <span>Confirmed bookings ready for review</span>
            </div>
            <b>{arrivals}</b>
            <ArrowRight size={15} />
          </Link>
          <Link href={href('sites')} className="attention-row">
            <span className="attention-icon slate">
              <Caravan size={19} />
            </span>
            <div>
              <strong>Unavailable sites</strong>
              <span>Blocked or out of service</span>
            </div>
            <b>{unavailable}</b>
            <ArrowRight size={15} />
          </Link>
          {financialStatus === 'ready' && <Link href={href('collections')} className="attention-row" data-testid="live-overdue-summary">
            <span className="attention-icon amber"><Clock3 size={19} /></span>
            <div>
              <strong>Past-due issued balances</strong>
              <span>Open customer invoices and payment history</span>
            </div>
            <b>{overdueCount}</b>
            <ArrowRight size={15} />
          </Link>}
          {financialStatus === 'ready' && staffTaskDestination && (
            <section className="overview-followup-snapshot" aria-label="Staff follow-up snapshot">
              <Link href={staffTaskLink} className="attention-row" data-testid="office-followup-summary">
                <span className="attention-icon amber"><Clock3 size={19}/></span>
                <div>
                  <strong>Staff follow-ups due</strong>
                  <span>{scheduledStaffTasks} additional scheduled follow-up{scheduledStaffTasks===1?'':'s'} · Open office tasks</span>
                </div>
                <b>{dueStaffTasks}</b>
                <ArrowRight size={15}/>
              </Link>
              {staffTasks.length > 0 && (
                <ul className="overview-followup-preview" aria-label="Next staff tasks">
                  {staffTasks.slice(0,3).map(task => (
                    <li key={task.noteId}>
                      <Link href={href('collections',task.propertyId)+'&focus=followups'}
                        className="overview-followup-item">
                        <strong>{customerName(snapshot.customers.find(c =>
                          c.id === task.customerId && c.property_id === task.propertyId))}</strong>
                        <span>{task.propertyName} · {task.state==='due'?'Due':'Scheduled'} {task.dueOn}</span>
                        <ArrowRight size={14}/>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {financialStatus === 'unavailable' && <p className="muted small" role="alert">
            Past-due balances and staff follow-up status could not be verified;
            please check Payments &amp; collections.
          </p>}
          <div className="roadmap-note">
            <span className="eyebrow">Daily operations</span>
            <p>Review repairs, recurring checklists, low stock and equipment service.</p>
            <Link className="text-button" href={href('operations')}>
              Open daily operations
            </Link>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Live records</span>
            <h2>Current occupancy</h2>
          </div>
          <Link href={href('occupancy')} className="text-button">
            View history <ArrowUpRight size={16} />
          </Link>
        </div>
        <StayHistory stays={currentStays.slice(0, 6)} snapshot={snapshot} />
      </section>
      {properties.length === 1 && activeSites.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">On the ground</span>
              <h2>Property at a glance</h2>
            </div>
            <Link className="text-button" href={href('map')}>
              Open layout <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="panel-content">
            <SiteMap sites={activeSites} snapshot={snapshot} onSelect={viewSite} overdueSites={overdueSites} financialStatus={financialStatus} />
          </div>
        </section>
      )}
    </>
  );
}
