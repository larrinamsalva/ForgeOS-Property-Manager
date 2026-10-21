'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import type { Field } from './record-form';
import { RecordForm, arrivalChecklistFields, billingOptions } from './record-form';
import { Modal } from './modal';
import { Badge, Empty } from './workspace-parts';
import {
  addDays,
  calendarMonth,
  canEditProperty,
  customerName,
  dateAtProperty,
  money,
  moneyInput,
  planningDeparture,
  rangesOverlap,
  siteAvailable,
} from '@/lib/domain';
import type { LeaseTerm, Reservation, Snapshot } from '@/lib/domain';

const editableStatuses = ['inquiry', 'tentative', 'confirmed'];
async function write(
  snapshot: Snapshot,
  entity: string,
  action: string,
  values?: unknown,
  record?: { id: string; updated_at?: string }
) {
  const response = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity,
      action,
      organization_id: snapshot.organizationId,
      ...(values === undefined ? {} : { values }),
      ...(record ? { id: record.id, ...(record.updated_at ? { version: record.updated_at } : {}) } : {}),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not save this record.');
}
function bookingFields(snapshot: Snapshot, propertyId: string, record?: Reservation): Field[] {
  const original = snapshot.sites.find((s) => s.id === record?.site_id);
  return [
    {
      name: 'property_id',
      label: 'Property',
      type: 'select',
      options: snapshot.properties
        .filter((p) => p.id === propertyId)
        .map((p) => ({ value: p.id, label: p.name })),
    },
    {
      name: 'site_id',
      label: 'Site / unit',
      type: 'select',
      required: true,
      options: snapshot.sites
        .filter(
          (s) => s.property_id === propertyId && !s.archived_at && (!original || s.kind === original.kind)
        )
        .map((s) => ({ value: s.id, label: `${s.label} · ${s.kind}` })),
    },
    {
      name: 'customer_id',
      label: 'Customer',
      type: 'select',
      required: true,
      options: snapshot.customers
        .filter((c) => c.property_id === propertyId && !c.archived_at)
        .map((c) => ({ value: c.id, label: customerName(c) })),
    },
    { name: 'starts_on', label: 'Arrival date', type: 'date', required: true },
    { name: 'ends_on', label: 'Departure date', type: 'date', required: true },
    {
      name: 'status',
      label: 'Booking status',
      type: 'select',
      required: true,
      default: 'tentative',
      options: editableStatuses.map((value) => ({
        value,
        label: value.replace(/^./, (c) => c.toUpperCase()),
      })),
      help: 'Only confirmed bookings hold availability.',
    },
    {
      name: 'billing_period',
      label: 'Billing period',
      type: 'select',
      options: billingOptions,
      required: true,
      default: 'nightly',
    },
    {
      name: 'agreed_rate',
      label: 'Agreed rate ($)',
      required: true,
      default: '0.00',
      help: 'Reference rate per selected period. Invoicing is a later milestone.',
    },
    { name: 'deposit_required', label: 'Deposit requirement ($)', required: true, default: '0.00' },
    {
      name: 'deposit_recorded',
      label: 'Deposit noted as received ($)',
      required: true,
      default: '0.00',
      help: 'Manual reference only; reconcile with your payment records.',
    },
    { name: 'deposit_reference', label: 'Deposit reference' },
    {
      name: 'guest_count',
      label: 'Guest count',
      type: 'number',
      min: '1',
      max: '99',
      step: '1',
      required: true,
      default: '1',
    },
    { name: 'rv_length_ft', label: 'RV length (ft)', type: 'number', min: '0', max: '1000', step: '0.01' },
    { name: 'vehicle_details', label: 'Vehicle / RV details', type: 'textarea' },
    { name: 'pet_notes', label: 'Pet notes', type: 'textarea' },
    { name: 'notes', label: 'Booking notes', type: 'textarea' },
  ];
}
function BookingEditor({
  snapshot,
  propertyId,
  record,
  siteId,
  from,
  until,
  onClose,
  onSave,
}: {
  snapshot: Snapshot;
  propertyId: string;
  record?: Reservation;
  siteId?: string;
  from: string;
  until: string;
  onClose: () => void;
  onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [chosenProperty, setChosenProperty] = useState(record?.property_id ?? propertyId);
  const properties = snapshot.properties.filter(
    (p) => !p.archived_at && p.operating_status === 'active' && canEditProperty(snapshot, p.id, true)
  );
  const property = properties.find((p) => p.id === chosenProperty) ?? properties[0];
  if (!property)
    return (
      <Modal title="Add a reservation" onClose={onClose}>
        <Empty title="Add an active property first">A reservation needs a property, site and customer.</Empty>
      </Modal>
    );
  const initial = record
    ? {
        ...record,
        agreed_rate: moneyInput(record.agreed_rate_cents),
        deposit_required: moneyInput(record.deposit_required_cents),
        deposit_recorded: moneyInput(record.deposit_recorded_cents),
        rv_length_ft: record.rv_length_ft ?? '',
      }
    : { property_id: property.id, site_id: siteId ?? '', starts_on: from, ends_on: until };
  return (
    <Modal title={record ? 'Edit reservation' : 'New reservation'} onClose={onClose}>
      {!record && properties.length > 1 && (
        <div className="planning-property">
          <label htmlFor="booking-property">Booking property</label>
          <select
            id="booking-property"
            value={property.id}
            onChange={(e) => setChosenProperty(e.target.value)}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="muted">
        Arrival is inclusive; departure is exclusive. Availability is checked again when you save.
      </p>
      <RecordForm
        key={property.id}
        fields={bookingFields(snapshot, property.id, record)}
        initial={initial}
        locked={['property_id']}
        onCancel={onClose}
        onSave={onSave}
        submit={record ? 'Save reservation' : 'Create reservation'}
      />
    </Modal>
  );
}
function BookingDetails({
  record,
  snapshot,
  onClose,
  onEdit,
  onAction,
}: {
  record: Reservation;
  snapshot: Snapshot;
  onClose: () => void;
  onEdit: () => void;
  onAction: (action: 'confirm' | 'cancel' | 'no_show' | 'checkin') => void;
}) {
  const property = snapshot.properties.find((p) => p.id === record.property_id);
  const today = dateAtProperty(property?.timezone ?? 'America/Los_Angeles');
  const editable =
    canEditProperty(snapshot, record.property_id, true) && editableStatuses.includes(record.status);
  return (
    <Modal title={record.confirmation_code} onClose={onClose}>
      <div className="planning-detail">
        <Badge status={record.status} />
        <h3>{customerName(snapshot.customers.find((c) => c.id === record.customer_id))}</h3>
        <p>
          {property?.name} · {snapshot.sites.find((s) => s.id === record.site_id)?.label}
        </p>
        <dl>
          <dt>Arrival / departure</dt>
          <dd>
            {record.starts_on} → {record.ends_on}
          </dd>
          <dt>Agreed rate</dt>
          <dd>
            {money(record.agreed_rate_cents)} / {record.billing_period}
          </dd>
          <dt>Guests</dt>
          <dd>{record.guest_count}</dd>
          <dt>Deposit requirement / noted received</dt>
          <dd>
            {money(record.deposit_required_cents)} / {money(record.deposit_recorded_cents)}
            {record.deposit_reference && ` · ${record.deposit_reference}`}
          </dd>
        </dl>
        {record.vehicle_details && <p>Vehicle: {record.vehicle_details}</p>}
        {record.pet_notes && <p>Pets: {record.pet_notes}</p>}
        {record.notes && <p>{record.notes}</p>}
        {record.cancellation_reason && <p>Reason: {record.cancellation_reason}</p>}
      </div>
      {editable && (
        <div className="planning-actions">
          <button className="button secondary" onClick={onEdit}>
            Edit reservation
          </button>
          {record.status !== 'confirmed' && (
            <button className="button primary" onClick={() => onAction('confirm')}>
              Confirm booking
            </button>
          )}
          {record.status === 'confirmed' && record.starts_on <= today && record.ends_on > today && (
            <button className="button primary" onClick={() => onAction('checkin')}>
              Check in
            </button>
          )}
          <button className="button secondary" onClick={() => onAction('cancel')}>
            Cancel booking
          </button>
          {record.starts_on <= today && (
            <button className="button secondary" onClick={() => onAction('no_show')}>
              Mark no-show
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
type BookingDialog =
  | { type: 'edit'; record?: Reservation; siteId?: string; propertyId?: string }
  | { type: 'detail'; record: Reservation }
  | { type: 'action'; record: Reservation; action: 'confirm' | 'cancel' | 'no_show' | 'checkin' };
export function PlanningWorkspace({
  snapshot,
  propertyId,
  section,
  navigationPending = false,
}: {
  snapshot: Snapshot;
  propertyId: string;
  section: 'reservations' | 'leases';
  navigationPending?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const first = snapshot.properties.find((p) => p.id === propertyId) ?? snapshot.properties[0];
  const today = dateAtProperty(first?.timezone ?? 'America/Los_Angeles');
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(addDays(today, 1));
  const [searchRange, setSearchRange] = useState<{ from: string; until: string } | null>(null);
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState<BookingDialog | null>(null);
  const [leaseDialog, setLeaseDialog] = useState<{ record?: LeaseTerm; void?: boolean } | null>(null);
  const properties = snapshot.properties.filter((p) => !propertyId || p.id === propertyId);
  const ids = new Set(properties.map((p) => p.id));
  const sites = snapshot.sites
    .filter(
      (s) =>
        ids.has(s.property_id) &&
        !s.archived_at &&
        !snapshot.properties.find((p) => p.id === s.property_id)?.archived_at
    )
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const bookings = snapshot.reservations.filter((r) => ids.has(r.property_id));
  const leases = snapshot.leaseTerms.filter((l) => ids.has(l.property_id));
  const editable = properties.some(
    (p) => !p.archived_at && p.operating_status === 'active' && canEditProperty(snapshot, p.id, true)
  );
  const matches = (r: Reservation) =>
    `${r.confirmation_code} ${customerName(snapshot.customers.find((c) => c.id === r.customer_id))} ${snapshot.sites.find((s) => s.id === r.site_id)?.label}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()) &&
    (filter === 'all' || r.status === filter);
  const refresh = () => {
    setDialog(null);
    setLeaseDialog(null);
    setMessage('Your changes have been saved.');
    startTransition(() => router.refresh());
  };
  const save = async (
    entity: string,
    action: string,
    values: unknown,
    record?: { id: string; updated_at?: string }
  ) => {
    await write(snapshot, entity, action, values, record);
    refresh();
  };
  const calendarStart = view === 'month' ? anchor.slice(0, 7) + '-01' : anchor;
  const calendarDays =
    view === 'day'
      ? 1
      : view === 'week'
        ? 7
        : new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0).getDate();
  const dates = Array.from({ length: calendarDays }, (_, i) => addDays(calendarStart, i));
  const label = (id: string) => snapshot.sites.find((s) => s.id === id)?.label ?? 'Site';
  const name = (id: string) => customerName(snapshot.customers.find((c) => c.id === id));
  const arrivals = bookings.filter(
    (r) => r.starts_on === anchor && ['confirmed', 'checked_in'].includes(r.status)
  );
  const departures = snapshot.stays.filter(
    (s) => ids.has(s.property_id) && (s.ends_on === anchor || (!s.ends_on && s.planned_ends_on === anchor))
  );
  return (
    <fieldset
      className="planning-workspace"
      disabled={pending || navigationPending}
      aria-busy={pending || navigationPending}
    >
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="planning-toolbar">
        <p>
          {section === 'reservations'
            ? 'Plan arrivals with confidence. Keep actual occupancy separate until check-in.'
            : 'Record reviewed agreement terms and preserve every renewal.'}
        </p>
        <button
          className="button primary"
          disabled={
            pending ||
            !editable ||
            (section === 'leases' && !snapshot.stays.some((s) => ids.has(s.property_id)))
          }
          onClick={() =>
            section === 'reservations'
              ? setDialog({ type: 'edit', propertyId: propertyId || first?.id })
              : setLeaseDialog({})
          }
        >
          <Plus size={17} />
          {section === 'reservations' ? 'New reservation' : 'Record lease terms'}
        </button>
      </div>
      {section === 'reservations' ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Search by dates</span>
                <h2>Available sites & units</h2>
              </div>
              <Search size={20} />
            </div>
            <form
              className="availability-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearchRange({ from, until });
              }}
            >
              <label>
                Arrival
                <input type="date" value={from} required onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                Departure
                <input
                  type="date"
                  value={until}
                  required
                  min={from ? addDays(from, 1) : undefined}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <button className="button secondary" type="submit">
                Search availability
              </button>
            </form>
            {searchRange && (
              <div className="availability-results" role="region" aria-label="Availability results">
                <p>
                  {searchRange.from} → {searchRange.until} · Departure day is available for the next arrival.
                </p>
                {sites.filter((s) => siteAvailable(s, searchRange.from, searchRange.until, snapshot))
                  .length ? (
                  <div className="available-sites">
                    {sites
                      .filter((s) => siteAvailable(s, searchRange.from, searchRange.until, snapshot))
                      .map((s) => (
                        <button
                          disabled={pending || !canEditProperty(snapshot, s.property_id, true)}
                          key={s.id}
                          className="available-site"
                          onClick={() => {
                            setFrom(searchRange.from);
                            setUntil(searchRange.until);
                            setDialog({ type: 'edit', siteId: s.id, propertyId: s.property_id });
                          }}
                        >
                          <CheckCircle2 size={17} />
                          <strong>{s.label}</strong>
                          <span>
                            {snapshot.properties.find((p) => p.id === s.property_id)?.name} · {s.kind}
                          </span>
                          <span>
                            Book site <ChevronRight size={14} />
                          </span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <Empty title="No sites available for these dates">
                    Try another property or date range. Active occupants, confirmed bookings and physical
                    condition affect availability.
                  </Empty>
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Property planning</span>
                <h2>Reservation calendar</h2>
              </div>
              <CalendarDays size={20} />
            </div>
            <div className="calendar-controls">
              <div className="calendar-views" role="group" aria-label="Calendar view">
                {(['day', 'week', 'month'] as const).map((v) => (
                  <button
                    key={v}
                    className="button secondary"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <div className="calendar-date">
                <button
                  className="icon-button"
                  aria-label="Previous calendar period"
                  onClick={() =>
                    setAnchor(
                      view === 'month' ? calendarMonth(anchor, -1) : addDays(calendarStart, -calendarDays)
                    )
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <label>
                  <span className="sr-only">Calendar date</span>
                  <input
                    type="date"
                    value={anchor}
                    required
                    onChange={(e) => {
                      if (e.target.value) setAnchor(e.target.value);
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Next calendar period"
                  onClick={() =>
                    setAnchor(
                      view === 'month' ? calendarMonth(anchor, 1) : addDays(calendarStart, calendarDays)
                    )
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            {sites.length ? (
              <div
                className="table-wrap reservation-calendar"
                role="region"
                aria-label="Reservation calendar grid"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Site / unit</th>
                      {dates.map((d) => (
                        <th scope="col" key={d}>
                          <time dateTime={d}>
                            {new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </time>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((s) => (
                      <tr key={s.id}>
                        <th scope="row">
                          <strong>{s.label}</strong>
                          <small>{snapshot.properties.find((p) => p.id === s.property_id)?.name}</small>
                        </th>
                        {dates.map((d) => {
                          const localToday = dateAtProperty(
                            snapshot.properties.find((p) => p.id === s.property_id)?.timezone ??
                              'America/Los_Angeles'
                          );
                          const stays = snapshot.stays.filter(
                            (o) =>
                              o.site_id === s.id &&
                              rangesOverlap(d, addDays(d, 1), o.starts_on, planningDeparture(o, localToday))
                          );
                          const events = bookings.filter(
                            (r) =>
                              r.site_id === s.id &&
                              editableStatuses.includes(r.status) &&
                              rangesOverlap(d, addDays(d, 1), r.starts_on, r.ends_on)
                          );
                          return (
                            <td key={d} className={d === localToday ? 'calendar-today' : ''}>
                              {stays.map((o) => (
                                <span
                                  className="calendar-event occupied"
                                  key={o.id}
                                  title={`${name(o.customer_id)} · ${o.starts_on} → ${o.ends_on ?? o.planned_ends_on ?? 'Open-ended'}`}
                                >
                                  {name(o.customer_id)}
                                  <small>{o.ends_on ? 'Completed stay' : 'Occupancy'}</small>
                                </span>
                              ))}
                              {events.map((r) => (
                                <button
                                  className={`calendar-event ${r.status}`}
                                  key={r.id}
                                  onClick={() => setDialog({ type: 'detail', record: r })}
                                >
                                  {name(r.customer_id)}
                                  <small>{r.status}</small>
                                </button>
                              ))}
                              {!stays.length && !events.length && (
                                <span className="calendar-empty">
                                  {s.physical_status === 'ready'
                                    ? '—'
                                    : s.physical_status.replaceAll('_', ' ')}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Add a site to start planning">
                Your calendar will show actual records from authorized properties.
              </Empty>
            )}
            <p className="planning-caption">
              Confirmed bookings hold the date range. Inquiry and tentative records remain visible without
              holding a site. Open-ended or overdue stays need a departure plan or move-out.
            </p>
          </section>
          <div className="planning-operations">
            <section className="panel">
              <div className="panel-heading">
                <h2>Arrivals · {anchor}</h2>
                <span className="count-pill">{arrivals.length}</span>
              </div>
              <div className="panel-content">
                {arrivals.length ? (
                  arrivals.map((r) => (
                    <button
                      className="operation-item"
                      key={r.id}
                      onClick={() => setDialog({ type: 'detail', record: r })}
                    >
                      <span>
                        <strong>{name(r.customer_id)}</strong>
                        <small>
                          {label(r.site_id)} · {r.confirmation_code}
                        </small>
                      </span>
                      <Badge status={r.status} />
                      <ChevronRight size={16} />
                    </button>
                  ))
                ) : (
                  <p className="muted">No confirmed arrivals on this date.</p>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Departures · {anchor}</h2>
                <span className="count-pill">{departures.length}</span>
              </div>
              <div className="panel-content">
                {departures.length ? (
                  departures.map((s) => (
                    <div className="operation-item" key={s.id}>
                      <span>
                        <strong>{name(s.customer_id)}</strong>
                        <small>{label(s.site_id)}</small>
                      </span>
                      <Badge status={s.ends_on ? 'completed' : 'departure_due'} />
                    </div>
                  ))
                ) : (
                  <p className="muted">No planned or completed departures on this date.</p>
                )}
                <p className="muted small">Complete departures in Occupancy & history.</p>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Every booking retained</span>
                <h2>Booking records</h2>
              </div>
              <span className="count-pill">{bookings.length}</span>
            </div>
            <div className="planning-filters">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search booking code, customer, or site"
                  placeholder="Search booking code, customer, or site"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Status
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  {[
                    'all',
                    'inquiry',
                    'tentative',
                    'confirmed',
                    'checked_in',
                    'completed',
                    'cancelled',
                    'no_show',
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {bookings.filter(matches).length ? (
              <div className="table-wrap" role="region" aria-label="Booking records" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Customer</th>
                      <th>Property / site</th>
                      <th>Arrival</th>
                      <th>Departure</th>
                      <th>Rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings
                      .filter(matches)
                      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="title-button"
                              onClick={() => setDialog({ type: 'detail', record: r })}
                            >
                              {r.confirmation_code}
                            </button>
                          </td>
                          <td>{name(r.customer_id)}</td>
                          <td>
                            {label(r.site_id)}
                            <small>{snapshot.properties.find((p) => p.id === r.property_id)?.name}</small>
                          </td>
                          <td>{r.starts_on}</td>
                          <td>{r.ends_on}</td>
                          <td>
                            {money(r.agreed_rate_cents)}
                            <small>/ {r.billing_period}</small>
                          </td>
                          <td>
                            <Badge status={r.status} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No matching bookings">Create a reservation or change the filters.</Empty>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Agreement registry</span>
                <h2>Lease terms & renewals</h2>
              </div>
              <span className="count-pill">{leases.length} records</span>
            </div>
            <p className="panel-content muted">
              Record the terms your business has reviewed. Renewals create a new term linked to the previous
              one. Availability follows the stay’s planned departure; update that plan separately when
              extending a stay.
            </p>
            {leases.length ? (
              <div className="table-wrap" role="region" aria-label="Lease terms" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Customer / site</th>
                      <th>Term</th>
                      <th>Rate</th>
                      <th>Deposit requirement</th>
                      <th>Reference / notes</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leases
                      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
                      .map((l) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{name(l.customer_id)}</strong>
                            <small>
                              {label(l.site_id)} ·{' '}
                              {snapshot.properties.find((p) => p.id === l.property_id)?.name}
                            </small>
                          </td>
                          <td>
                            {l.starts_on} → {l.ends_on}
                            <small>{l.renewed_from_id ? 'Renewal' : 'Initial term'}</small>
                          </td>
                          <td>
                            {money(l.agreed_rate_cents)}
                            <small>/ {l.billing_period}</small>
                          </td>
                          <td>{money(l.deposit_required_cents)}</td>
                          <td className="planning-note">
                            {l.document_reference || 'No reference'}
                            {l.notes && <small>{l.notes}</small>}
                            {l.void_reason && <small>Void reason: {l.void_reason}</small>}
                          </td>
                          <td>
                            <Badge status={l.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              {l.status === 'recorded' &&
                                canEditProperty(snapshot, l.property_id, true) &&
                                !snapshot.leaseTerms.some(
                                  (v) => v.renewed_from_id === l.id && v.status === 'recorded'
                                ) && (
                                  <button
                                    className="text-button"
                                    disabled={pending}
                                    onClick={() => setLeaseDialog({ record: l })}
                                  >
                                    Renew
                                  </button>
                                )}
                              {l.status === 'recorded' && canEditProperty(snapshot, l.property_id) && (
                                <button
                                  className="text-button"
                                  disabled={pending}
                                  onClick={() => setLeaseDialog({ record: l, void: true })}
                                >
                                  Void
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Lease history starts with a stay">
                Record an occupancy first, then add its reviewed agreement terms.
              </Empty>
            )}
          </section>
        </>
      )}
      {dialog?.type === 'edit' && (
        <BookingEditor
          snapshot={snapshot}
          propertyId={dialog.record?.property_id ?? dialog.propertyId ?? first?.id ?? ''}
          record={dialog.record}
          siteId={dialog.siteId}
          from={from}
          until={until}
          onClose={() => setDialog(null)}
          onSave={(v) => save('reservation', dialog.record ? 'update' : 'create', v, dialog.record)}
        />
      )}
      {dialog?.type === 'detail' && (
        <BookingDetails
          record={dialog.record}
          snapshot={snapshot}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ type: 'edit', record: dialog.record })}
          onAction={(action) => setDialog({ type: 'action', record: dialog.record, action })}
        />
      )}
      {dialog?.type === 'action' && (
        <Modal
          title={
            dialog.action === 'checkin'
              ? 'Check in reservation'
              : dialog.action === 'confirm'
                ? 'Confirm booking?'
                : dialog.action === 'cancel'
                  ? 'Cancel booking?'
                  : 'Mark no-show?'
          }
          onClose={() => setDialog(null)}
        >
          <p>
            {dialog.record.confirmation_code} · {name(dialog.record.customer_id)} ·{' '}
            {label(dialog.record.site_id)}
          </p>
          {dialog.action === 'checkin' && (
            <p className="muted">
              {money(dialog.record.agreed_rate_cents)} / {dialog.record.billing_period} · Planned departure{' '}
              {dialog.record.ends_on}. Confirm the site is ready before check-in.
            </p>
          )}
          <RecordForm
            fields={
              dialog.action === 'checkin'
                ? [
                    {
                      name: 'starts_on',
                      label: 'Actual move-in date',
                      type: 'date',
                      required: true,
                      default: dateAtProperty(
                        snapshot.properties.find((p) => p.id === dialog.record.property_id)?.timezone ??
                          'America/Los_Angeles'
                      ),
                      min: dialog.record.starts_on,
                      max: dateAtProperty(
                        snapshot.properties.find((p) => p.id === dialog.record.property_id)?.timezone ??
                          'America/Los_Angeles'
                      ),
                    },
                    ...arrivalChecklistFields,
                    { name: 'notes', label: 'Stay notes', type: 'textarea' },
                  ]
                : dialog.action === 'confirm'
                  ? []
                  : [{ name: 'reason', label: 'Reason', type: 'textarea', required: true }]
            }
            onCancel={() => setDialog(null)}
            submit={
              dialog.action === 'checkin'
                ? 'Confirm check-in'
                : dialog.action === 'confirm'
                  ? 'Confirm booking'
                  : dialog.action === 'cancel'
                    ? 'Confirm cancellation'
                    : 'Confirm no-show'
            }
            onSave={(v) => save('reservation', dialog.action, v, dialog.record)}
          />
        </Modal>
      )}
      {leaseDialog &&
        (leaseDialog.void && leaseDialog.record ? (
          <Modal title="Void recorded terms?" onClose={() => setLeaseDialog(null)}>
            <p>The original terms and your correction reason remain in history.</p>
            <RecordForm
              fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true }]}
              submit="Void terms"
              onCancel={() => setLeaseDialog(null)}
              onSave={(v) => save('lease', 'void', v, leaseDialog.record)}
            />
          </Modal>
        ) : (
          <LeaseEditor
            snapshot={snapshot}
            propertyIds={ids}
            previous={leaseDialog.record}
            onClose={() => setLeaseDialog(null)}
            onSave={(v) => save('lease', 'create', v)}
          />
        ))}
    </fieldset>
  );
}
function LeaseEditor({
  snapshot,
  propertyIds,
  previous,
  onClose,
  onSave,
}: {
  snapshot: Snapshot;
  propertyIds: Set<string>;
  previous?: LeaseTerm;
  onClose: () => void;
  onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const stays = snapshot.stays.filter(
    (s) => propertyIds.has(s.property_id) && canEditProperty(snapshot, s.property_id, true)
  );
  const [stayId, setStayId] = useState(
    previous?.stay_id ?? stays.find((s) => !s.ends_on)?.id ?? stays[0]?.id ?? ''
  );
  const stay = stays.find((s) => s.id === stayId);
  if (!stay)
    return (
      <Modal title="Record lease terms" onClose={onClose}>
        <Empty title="Choose an existing stay first">
          Agreement records belong to a retained occupancy record.
        </Empty>
      </Modal>
    );
  const start = previous?.ends_on ?? stay.starts_on;
  const fields: Field[] = [
    {
      name: 'stay_id',
      label: 'Linked stay',
      type: 'select',
      required: true,
      options: [
        {
          value: stay.id,
          label: `${customerName(snapshot.customers.find((c) => c.id === stay.customer_id))} · ${snapshot.sites.find((s) => s.id === stay.site_id)?.label} · ${stay.starts_on}`,
        },
      ],
    },
    { name: 'starts_on', label: 'Term start', type: 'date', required: true },
    { name: 'ends_on', label: 'Term end', type: 'date', required: true },
    {
      name: 'billing_period',
      label: 'Billing period',
      type: 'select',
      options: billingOptions,
      required: true,
    },
    { name: 'agreed_rate', label: 'Agreed rate ($)', required: true },
    { name: 'deposit_required', label: 'Deposit requirement ($)', required: true },
    { name: 'document_reference', label: 'Agreement or document reference' },
    { name: 'notes', label: 'Term notes', type: 'textarea' },
  ];
  return (
    <Modal title={previous ? 'Record renewal' : 'Record lease terms'} onClose={onClose}>
      {!previous && (
        <div className="planning-property">
          <label htmlFor="lease-stay">Existing stay</label>
          <select id="lease-stay" value={stayId} onChange={(e) => setStayId(e.target.value)}>
            {stays.map((s) => (
              <option key={s.id} value={s.id}>
                {customerName(snapshot.customers.find((c) => c.id === s.customer_id))} ·{' '}
                {snapshot.sites.find((u) => u.id === s.site_id)?.label} · {s.starts_on}
                {s.ends_on ? ' · Completed' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="muted">
        A saved term is retained permanently. Correct an error by voiding it with a reason, then recording the
        reviewed terms.
      </p>
      <RecordForm
        key={stay.id}
        fields={fields}
        locked={['stay_id', ...(previous ? ['starts_on'] : [])]}
        initial={{
          stay_id: stay.id,
          starts_on: start,
          ends_on: addDays(start, 30),
          billing_period: previous?.billing_period ?? stay.billing_period,
          agreed_rate: moneyInput(previous?.agreed_rate_cents ?? stay.agreed_rate_cents),
          deposit_required: moneyInput(previous?.deposit_required_cents ?? stay.deposit_required_cents),
        }}
        submit={previous ? 'Save renewal' : 'Save lease terms'}
        onCancel={onClose}
        onSave={(v) => onSave({ ...v, renewed_from_id: previous?.id ?? '' })}
      />
    </Modal>
  );
}
export function PlanningHistory({
  snapshot,
  customerId,
  siteId,
}: {
  snapshot: Snapshot;
  customerId?: string;
  siteId?: string;
}) {
  const bookings = snapshot.reservations.filter(
    (r) => (!customerId || r.customer_id === customerId) && (!siteId || r.site_id === siteId)
  );
  const terms = snapshot.leaseTerms.filter(
    (l) => (!customerId || l.customer_id === customerId) && (!siteId || l.site_id === siteId)
  );
  return (
    <div className="planning-history">
      <h3>Reservations</h3>
      {bookings.length ? (
        bookings.map((r) => (
          <div className="history-item" key={r.id}>
            <strong>{r.confirmation_code}</strong>
            <span>
              {r.starts_on} → {r.ends_on}
            </span>
            <Badge status={r.status} />
            {r.cancellation_reason && <p>{r.cancellation_reason}</p>}
          </div>
        ))
      ) : (
        <p className="muted">No reservations recorded.</p>
      )}
      <h3>Lease history</h3>
      {terms.length ? (
        terms.map((l) => (
          <div className="history-item" key={l.id}>
            <span>
              {l.starts_on} → {l.ends_on}
            </span>
            <span>
              {money(l.agreed_rate_cents)} / {l.billing_period}
            </span>
            <Badge status={l.status} />
            {l.document_reference && <p>{l.document_reference}</p>}
            {l.void_reason && <p>{l.void_reason}</p>}
          </div>
        ))
      ) : (
        <p className="muted">No lease terms recorded.</p>
      )}
    </div>
  );
}
