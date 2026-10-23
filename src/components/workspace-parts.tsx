'use client';
import Link from 'next/link';
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
  const overdueCount = sites.filter((site) => !!overdueSites[site.id]).length;
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
}: {
  snapshot: Snapshot;
  properties: Property[];
  sites: Site[];
  href: (section: string, property?: string) => string;
  addProperty?: () => void;
  viewSite: (id: string) => void;
  overdueSites?: Record<string, SiteOverdueFlag>;
  financialStatus?: string;
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
          {financialStatus === 'unavailable' && <p className="muted small" role="alert">
            Past-due account status could not be loaded; please check Payments &amp; collections.
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
