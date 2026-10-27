'use client';
import { useEffect, useState } from 'react';
import { Gauge, Tablet, Plus, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Snapshot } from '@/lib/domain';
import type { MeterView, MeterUtility } from '@/lib/meter-actions';
import { canEditProperty, dateAtProperty, addDays, customerName } from '@/lib/domain';
import { latestReview, type MeterSnapshot } from '@/lib/meter-domain';
import { filterMeterReadingWorklist, filterMeterReadingsBySite, filterMeterReadingsByUtility, filterMeterReadingsByCaptureMonth, meterReadingSiteOptions, type MeterAttentionReason } from '@/lib/meter-reading-worklist';
import { sortMeterReadingWorklist, type MeterReadingOrder } from '@/lib/meter-reading-order';
import { Modal } from './modal';
import { RecordForm, type Field } from './record-form';
import { Empty } from './workspace-parts';
const localTime = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const options = (values: string[]) => values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));
export function MeterWorkspace({
  snapshot,
  propertyId,
  navigationPending,
  initialTab,
  initialSiteId,
  initialUtility,
}: {
  snapshot: Snapshot;
  propertyId: string;
  navigationPending: boolean;
  initialTab?: MeterView;
  initialSiteId?: string;
  initialUtility?: MeterUtility;
}) {
  const [data, setData] = useState<MeterSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MeterView>(initialTab ?? 'directory');
  const [selectedProperty, setSelectedProperty] = useState(propertyId || snapshot.properties[0]?.id || '');
  const [search, setSearch] = useState('');
  const [historyMeterId, setHistoryMeterId] = useState('');
  const [historySiteId, setHistorySiteId] = useState(initialSiteId ?? '');
  const [historyUtility, setHistoryUtility] = useState<'all'|MeterUtility>(initialUtility ?? 'all');
  const [readingOrder, setReadingOrder] = useState<MeterReadingOrder>('newest');
  const [captureMonth, setCaptureMonth] = useState('');
  // When a billing approval task opens a site, start with readings needing follow-up.
  // Generic meter navigation and reading-history links still start with all readings.
  const [attentionOnly, setAttentionOnly] = useState(initialTab === 'review' && !!initialSiteId);
  const [attentionReason, setAttentionReason] = useState<MeterAttentionReason>('all');
  const [editor, setEditor] = useState<{ type: string; id?: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const property = snapshot.properties.find((p) => p.id === selectedProperty);
  const manage = !!property && canEditProperty(snapshot, property.id);
  const scope = { organization_id: snapshot.organizationId, property_id: selectedProperty };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/meters?organization=${snapshot.organizationId}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        setData(json);
        setError('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [snapshot.organizationId, refresh]);
  const reload = () => {
    setLoading(true);
    setRefresh((v) => v + 1);
  };
  async function save(command: string, values: Record<string, unknown>) {
    const response = await fetch('/api/meters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload: { ...scope, ...values } }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setEditor(null);
    setNotice('Meter records saved. Original readings and history are retained.');
    reload();
  }
  async function viewPhoto(id: string) {
    try {
      const r = await fetch(`/api/meters/photo?id=${id}`, { cache: 'no-store' });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setPhotoUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo unavailable.');
    }
  }
  const meters =
    data?.meters.filter(
      (m) =>
        m.property_id === selectedProperty &&
        `${m.label} ${m.serial_number} ${m.utility}`.toLowerCase().includes(search.toLowerCase())
    ) ?? [];
  const assignments = data?.assignments.filter((a) => a.property_id === selectedProperty) ?? [];
  const routes = data?.routes.filter((r) => r.property_id === selectedProperty) ?? [];
  const readings =
    data?.readings
      .filter((r) => r.property_id === selectedProperty)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at)) ?? [];
  const reviews = data?.reviews ?? [];
  const pending = readings.filter((r) => !latestReview(r.id, reviews));
  const exceptions = readings.filter((r) => r.exceptions.length > 0);
  const needsAttention = filterMeterReadingWorklist(readings, reviews, '', true);
  const readingSites = meterReadingSiteOptions(readings, assignments);
  const focusedSite = historySiteId ? snapshot.sites.find(s=>s.id===historySiteId && s.property_id===selectedProperty) : undefined;
  const siteReadings = filterMeterReadingsBySite(readings, assignments, historySiteId);
  const utilityReadings = filterMeterReadingsByUtility(siteReadings, data?.meters ?? [], historyUtility);
  const monthReadings = filterMeterReadingsByCaptureMonth(
    utilityReadings,captureMonth,property?.timezone ?? 'America/Los_Angeles',
  );
  const meterScopedReadings = filterMeterReadingWorklist(monthReadings, reviews, historyMeterId, false);
  const meterAttentionReadings = filterMeterReadingWorklist(monthReadings, reviews, historyMeterId, true);
  const visibleReadings = attentionOnly
    ? filterMeterReadingWorklist(monthReadings, reviews, historyMeterId, true, attentionReason)
    : meterScopedReadings;
  const orderedReadings = sortMeterReadingWorklist(visibleReadings, assignments, readingOrder);
  const attentionReasons: {value:MeterAttentionReason;label:string}[] = [
    {value:'all',label:'All attention reasons'},
    {value:'unreviewed',label:'Awaiting review'},
    {value:'rejected',label:'Rejected readings'},
    {value:'exceptions',label:'Automatic exceptions'},
    {value:'flagged',label:'Meter flags'},
  ];
  const damagedMeters = readings.filter((r) => ['damaged', 'missing', 'problem', 'reset'].includes(r.flag));
  const today = dateAtProperty(property?.timezone ?? 'America/Los_Angeles');
  function renderEditor() {
    if (!editor || !data) return null;
    let title = '',
      submit = 'Save',
      fields: Field[] = [],
      initial: Record<string, string | boolean> = {},
      onSave = (v: Record<string, unknown>) => save(editor.type, v);
    if (editor.type === 'new_meter') {
      title = 'Add meter';
      submit = 'Create meter';
      fields = [
        { name: 'label', label: 'Meter name', required: true },
        {
          name: 'utility',
          label: 'Utility',
          type: 'select',
          default: 'electric',
          options: options(['electric', 'water', 'gas']),
        },
        { name: 'serial_number', label: 'Serial number', required: true },
        { name: 'location', label: 'Meter location' },
        { name: 'unit', label: 'Measurement unit', required: true, default: 'kWh' },
        {
          name: 'register_digits',
          label: 'Register digits',
          type: 'number',
          required: true,
          min: '1',
          max: '12',
          default: '6',
        },
        { name: 'multiplier', label: 'Meter multiplier', required: true, default: '1' },
        {
          name: 'max_delta',
          label: 'Unusual register increase threshold',
          help: 'Optional. Raw register units; readings over this increase are flagged.',
        },
        {
          name: 'installed_at',
          label: 'Installed at',
          type: 'datetime-local',
          required: true,
          default: localTime(),
          help: 'Device local time. Captures use the property time zone for occupancy dates.',
        },
        { name: 'notes', label: 'Meter notes', type: 'textarea' },
      ];
      onSave = (v) =>
        save('new_meter', {
          ...v,
          max_delta: v.max_delta || null,
          installed_at: new Date(String(v.installed_at)).toISOString(),
        });
    }
    if (editor.type === 'new_assignment') {
      title = 'Assign meter to site';
      submit = 'Save assignment';
      fields = [
        {
          name: 'meter_id',
          label: 'Meter',
          type: 'select',
          required: true,
          options: data.meters
            .filter((m) => m.property_id === selectedProperty && !m.removed_at)
            .map((m) => ({ value: m.id, label: `${m.label} · ${m.serial_number}` })),
        },
        {
          name: 'site_id',
          label: 'Site / unit',
          type: 'select',
          required: true,
          options: snapshot.sites
            .filter((s) => s.property_id === selectedProperty && !s.archived_at)
            .map((s) => ({ value: s.id, label: s.label })),
        },
        {
          name: 'starts_at',
          label: 'Assignment starts at',
          type: 'datetime-local',
          required: true,
          default: localTime(),
          help: 'Assignments use exact instants. Close an existing assignment before replacing it.',
        },
      ];
      onSave = (v) =>
        save('new_assignment', { ...v, starts_at: new Date(String(v.starts_at)).toISOString() });
    }
    if (editor.type === 'close_assignment') {
      title = 'Close meter assignment';
      submit = 'Close assignment';
      fields = [
        {
          name: 'ends_at',
          label: 'Assignment ends at',
          type: 'datetime-local',
          required: true,
          default: localTime(),
        },
        { name: 'remove_meter', label: 'Retire this meter', type: 'checkbox' },
        { name: 'reason', label: 'Replacement or reassignment reason', type: 'textarea', required: true },
      ];
      onSave = (v) =>
        save('close_assignment', {
          ...v,
          assignment_id: editor.id,
          ends_at: new Date(String(v.ends_at)).toISOString(),
        });
    }
    if (editor.type === 'new_route') {
      title = 'Create reading route';
      submit = 'Create route';
      const members = snapshot.propertyMemberships.filter(
        (m) => m.property_id === selectedProperty && ['manager', 'meter_technician'].includes(m.role)
      );
      const users = Array.from(new Set([snapshot.userId, ...members.map((m) => m.user_id)]));
      fields = [
        { name: 'label', label: 'Route name', required: true },
        {
          name: 'assigned_to',
          label: 'Assigned employee',
          type: 'select',
          required: true,
          options: users.map((id) => ({
            value: id,
            label:
              id === snapshot.userId
                ? 'Me'
                : `${members.find((m) => m.user_id === id)?.role.replaceAll('_', ' ')} · ${id}`,
          })),
        },
        { name: 'starts_on', label: 'Collection starts', type: 'date', required: true, default: today },
        {
          name: 'ends_on',
          label: 'Collection ends (exclusive)',
          type: 'date',
          required: true,
          default: addDays(today, 1),
          help: 'Up to 31 days. Offline captures must sync within 14 days.',
        },
        {
          name: 'cadence',
          label: 'Schedule',
          type: 'select',
          default: 'monthly',
          options: options(['monthly', 'weekly', 'custom']),
        },
        ...assignments
          .filter((a) => !a.ends_at)
          .map((a) => ({
            name: `stop_${a.id}`,
            label: `${a.site_label} · ${data.meters.find((m) => m.id === a.meter_id)?.label ?? 'Meter'}`,
            type: 'checkbox' as const,
            default: true,
          })),
      ];
      onSave = (v) =>
        save('new_route', {
          label: v.label,
          assigned_to: v.assigned_to,
          starts_on: v.starts_on,
          ends_on: v.ends_on,
          cadence: v.cadence,
          assignments: assignments.filter((a) => v[`stop_${a.id}`] === true).map((a) => a.id),
        });
    }
    if (editor.type === 'cancel_route') {
      title = 'Cancel reading route';
      submit = 'Cancel route';
      fields = [{ name: 'reason', label: 'Cancellation reason', type: 'textarea', required: true }];
      onSave = (v) => save('cancel_route', { ...v, route_id: editor.id });
    }
    if (editor.type === 'resolve_conflict') {
      title = 'Resolve offline conflict';
      submit = 'Record resolution';
      const conflict = data.conflicts.find((c) => c.id === editor.id)!;
      fields = [
        {
          name: 'decision',
          label: 'Resolution',
          type: 'select',
          default: 'discarded',
          options: [
            { value: 'discarded', label: 'Discarded with reason / recollect on a new route' },
            { value: 'duplicate', label: 'Duplicate of an existing reading' },
          ],
        },
        {
          name: 'reading_id',
          label: 'Existing reading receipt ID',
          help: 'Required only for a duplicate. The reading must belong to the same meter assignment.',
        },
        {
          name: 'reason',
          label: 'Reconciliation reason and recovery reference',
          type: 'textarea',
          required: true,
          help: 'Preserve the encrypted recovery export when a queued photo cannot be uploaded. The original conflict remains in history.',
        },
      ];
      onSave = (v) =>
        save('resolve_conflict', { ...v, conflict_id: conflict.id, reading_id: v.reading_id || null });
    }
    if (editor.type === 'review') {
      const r = data.readings.find((r) => r.id === editor.id)!;
      const prior = latestReview(r.id, reviews);
      title = 'Review meter reading';
      submit = 'Save review';
      fields = [
        {
          name: 'decision',
          label: 'Review decision',
          type: 'select',
          options: options(['accepted', 'rejected']),
        },
        {
          name: 'corrected_value',
          label: 'Corrected register value',
          help: `Original: ${r.value ?? 'no numeric reading'}. Leave empty to retain the original.`,
        },
        { name: 'reason', label: 'Review and correction reason', type: 'textarea', required: true },
      ];
      initial = { decision: prior?.decision ?? 'accepted', corrected_value: prior?.corrected_value ?? '' };
      onSave = (v) =>
        save('review', {
          ...v,
          reading_id: r.id,
          previous_review_id: prior?.id ?? null,
          corrected_value: v.corrected_value || null,
        });
    }
    return (
      <Modal title={title} onClose={() => setEditor(null)}>
        <RecordForm
          key={`${editor.type}:${editor.id}`}
          fields={fields}
          initial={initial}
          submit={submit}
          onCancel={() => setEditor(null)}
          onSave={onSave}
        />
      </Modal>
    );
  }
  return (
    <div className="meter-workspace">
      <section className="reader-banner">
        <div className="reader-mark">
          <Gauge size={30} />
        </div>
        <div>
          <span className="eyebrow">FIELD OPERATIONS</span>
          <h2>Every meter. One clear route.</h2>
          <p>Collect readings and photos on a tablet, then sync for supervisor review.</p>
        </div>
        <a className="button primary" href={`/tablet/index.html?organization=${snapshot.organizationId}`}>
          <Tablet size={19} />
          Open tablet reader
        </a>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <fieldset disabled={navigationPending || loading} className="meter-controls">
        <label>
          Meter property
          <select
            aria-label="Meter property"
            value={selectedProperty}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              setEditor(null);
              setCaptureMonth('');
              setHistoryMeterId('');
              setHistorySiteId('');
              setHistoryUtility('all');
              setAttentionOnly(false);
              setAttentionReason('all');
            }}
          >
            {snapshot.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" onClick={reload}>
          <RefreshCw size={16} />
          Refresh meters
        </button>
      </fieldset>
      <div className="stats-grid meter-stats">
        <article className="stat-card">
          <Gauge />
          <span>Meters in view</span>
          <strong>{meters.length}</strong>
        </article>
        <article className="stat-card">
          <CheckCircle2 />
          <span>Awaiting review</span>
          <strong>{pending.length}</strong>
        </article>
        <article className="stat-card">
          <AlertCircle />
          <span>Reading exceptions</span>
          <strong>{exceptions.length}</strong>
        </article>
      </div>
      {data && (
        <section className="panel" aria-label="Meter reading attention summary">
          <div className="panel-heading">
            <div>
              <h2>Meter reading alerts</h2>
              <p>Review existing automatic exceptions, meter problem flags and captures awaiting supervisor approval. No new usage or billing thresholds are applied.</p>
            </div>
            <button type="button" className="button secondary" onClick={() => {
              setTab('review');
              setCaptureMonth('');
              setHistoryMeterId('');
              setHistorySiteId('');
              setHistoryUtility('all');
              setAttentionOnly(true);
              setAttentionReason('all');
            }}>Open attention queue ({needsAttention.length})</button>
          </div>
          <div className="stat-grid">
            <div className="stat-card"><span>Awaiting supervisor review</span><strong>{pending.length}</strong></div>
            <div className="stat-card"><span>Automatic usage exceptions</span><strong>{exceptions.length}</strong></div>
            <div className="stat-card"><span>Meter problem or reset flags</span><strong>{damagedMeters.length}</strong></div>
          </div>
        </section>
      )}
      <div className="planning-tabs" role="group" aria-label="Meter views">
        {[
          ['directory', 'Meter directory'],
          ['routes', 'Reading routes'],
          ['review', 'Supervisor review'],
          ['history', 'Reading history'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`button ${tab === id ? 'primary' : 'secondary'}`}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id as MeterView);
              setCaptureMonth('');
              setHistoryMeterId('');
              setHistorySiteId('');
              setHistoryUtility('all');
              setAttentionOnly(false);
              setAttentionReason('all');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && <p role="status">Loading meter records…</p>}
      {!loading && data && (
        <fieldset className="meter-content" disabled={navigationPending}>
          {tab === 'directory' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Meter directory</h2>
                  <p className="muted">Electric, water and gas meters with dated assignment history.</p>
                </div>
                {manage && (
                  <div className="action-group">
                    <button
                      className="button secondary"
                      onClick={() => setEditor({ type: 'new_assignment' })}
                    >
                      Assign meter
                    </button>
                    <button className="button primary" onClick={() => setEditor({ type: 'new_meter' })}>
                      <Plus size={16} />
                      Add meter
                    </button>
                  </div>
                )}
              </div>
              <label className="search-field">
                <input
                  aria-label="Search meters"
                  placeholder="Search meter, serial or utility"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {!meters.length ? (
                <Empty title="No meters in this view">
                  Managers can add meters and assign them to sites. Technicians see meters on their assigned
                  routes.
                </Empty>
              ) : (
                <div className="meter-directory">
                  {meters.map((m) => {
                    const history = assignments
                      .filter((a) => a.meter_id === m.id)
                      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
                    const accepted = readings.filter(
                      (r) => r.meter_id === m.id && latestReview(r.id, reviews)?.decision === 'accepted'
                    )[0];
                    return (
                      <article key={m.id} className="meter-card">
                        <div className="meter-card-heading">
                          <span className={`utility-chip ${m.utility}`}>{m.utility}</span>
                          <span className="muted">{m.removed_at ? 'Retired' : 'Installed'}</span>
                        </div>
                        <h3>{m.label}</h3>
                        <p className="mono">{m.serial_number}</p>
                        <p>{m.location || 'Location not recorded'}</p>
                        <dl className="meter-facts">
                          <div>
                            <dt>Register</dt>
                            <dd>
                              {m.register_digits} digits · {m.unit}
                            </dd>
                          </div>
                          <div>
                            <dt>Multiplier</dt>
                            <dd>{m.multiplier}</dd>
                          </div>
                          <div>
                            <dt>Last validated</dt>
                            <dd>
                              {accepted
                                ? (latestReview(accepted.id, reviews)?.corrected_value ?? accepted.value)
                                : 'None yet'}
                            </dd>
                          </div>
                        </dl>
                        <details>
                          <summary>Assignments & installation</summary>
                          <p>Installed {new Date(m.installed_at).toLocaleString()}</p>
                          {m.removed_at && <p>Removed {new Date(m.removed_at).toLocaleString()}</p>}
                          {history.length ? (
                            history.map((a) => (
                              <div key={a.id} className="assignment-row">
                                <strong>{a.site_label}</strong>
                                <small>
                                  {new Date(a.starts_at).toLocaleString()} →{' '}
                                  {a.ends_at ? new Date(a.ends_at).toLocaleString() : 'Current'}
                                </small>
                                {a.close_reason && <p>{a.close_reason}</p>}
                                {manage && !a.ends_at && (
                                  <button
                                    className="button secondary small"
                                    onClick={() => setEditor({ type: 'close_assignment', id: a.id })}
                                  >
                                    Close assignment
                                  </button>
                                )}
                              </div>
                            ))
                          ) : (
                            <p>Not assigned to a site.</p>
                          )}
                          {m.notes && <p>{m.notes}</p>}
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {tab === 'routes' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Reading routes</h2>
                  <p className="muted">
                    Monthly, weekly or custom collection windows. Create each run explicitly.
                  </p>
                </div>
                {manage && (
                  <button className="button primary" onClick={() => setEditor({ type: 'new_route' })}>
                    <Plus size={16} />
                    Create route
                  </button>
                )}
              </div>
              {!routes.length ? (
                <Empty title="No reading routes">
                  Assign meters and create a route for a manager or meter technician.
                </Empty>
              ) : (
                <div className="route-cards">
                  {routes.map((r) => {
                    const items = data.items.filter((i) => i.route_id === r.id);
                    const captures = readings.filter((read) =>
                      items.some((i) => i.id === read.route_item_id)
                    );
                    const capturedStops = new Set(captures.map((read) => read.route_item_id));
                    const collectedCount = items.filter((i) => capturedStops.has(i.id)).length;
                    const missing = items.filter((i) => !capturedStops.has(i.id));
                    const photoPending = data.photos.filter(
                      (p) => captures.some((read) => read.id === p.reading_id) && p.status !== 'uploaded'
                    );
                    return (
                      <article className="route-card" key={r.id}>
                        <span className="eyebrow">
                          {r.cadence} ·{' '}
                          {r.status === 'cancelled'
                            ? 'Cancelled'
                            : missing.length
                              ? 'In progress'
                              : 'Collected'}
                        </span>
                        <h3>{r.label}</h3>
                        <p>
                          {r.starts_on} → {r.ends_on} (exclusive)
                        </p>
                        <p className="mono">
                          {r.assigned_to === snapshot.userId ? 'Assigned to me' : r.assigned_to}
                        </p>
                        <progress
                          max={items.length || 1}
                          value={collectedCount}
                          aria-label={`${r.label} collection progress`}
                        />
                        <p>
                          <strong>
                            {collectedCount} / {items.length}
                          </strong>{' '}
                          stops collected · {missing.length} remaining ·{' '}
                          {
                            captures.filter((c) => latestReview(c.id, reviews)?.decision === 'accepted')
                              .length
                          }{' '}
                          accepted · {photoPending.length} photos pending
                        </p>
                        <details>
                          <summary>Route report & missing stops</summary>
                          {items.map((i) => {
                            const a = assignments.find((a) => a.id === i.assignment_id);
                            const capture = captures.find((c) => c.route_item_id === i.id);
                            const meter = data.meters.find((m) => m.id === a?.meter_id);
                            const previous = readings.find((read) =>
                              read.meter_id === a?.meter_id && read.assignment_id === i.assignment_id &&
                              read.route_item_id !== i.id && read.value !== null);
                            return (
                              <div key={i.id} className="route-stop">
                                <p><strong>{i.position}. {a?.site_label ?? 'Site not available'}</strong> ·{' '}
                                  {meter?.label ?? 'Meter not available'} ({meter?.utility ?? 'unknown utility'})</p>
                                <p>{capture ? `Collected: ${capture.value ?? capture.flag}` : 'Reading needed'}
                                  {previous && <> · Previous: {previous.value} ({previous.captured_at.slice(0, 10)})</>}
                                </p>
                                {meter && <button type="button" className="button secondary small" onClick={() => {
                                  setHistorySiteId('');
                                  setHistoryUtility('all');
                                  setCaptureMonth('');
                                  setHistoryMeterId(meter.id);
                                  setTab('history');
                                }}>View meter history</button>}
                              </div>
                            );
                          })}
                        </details>
                        {r.cancel_reason && <p>{r.cancel_reason}</p>}
                        {manage && r.status === 'open' && (
                          <button
                            className="button secondary small"
                            onClick={() => setEditor({ type: 'cancel_route', id: r.id })}
                          >
                            Cancel route
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {(tab === 'review' || tab === 'history') && (
            <section className="panel">
              <h2>{tab === 'review' ? 'Supervisor review' : 'Reading history'}</h2>
              <p className="muted">
                Original captures remain unchanged. Reviews and corrections append to the history. Collection
                completeness and approval are tracked separately.
              </p>
              {manage && data.conflicts.filter((c) => c.property_id === selectedProperty).length > 0 && (
                <div className="conflict-inbox">
                  <h3>Offline conflict inbox</h3>
                  {data.conflicts
                    .filter((c) => c.property_id === selectedProperty)
                    .map((c) => {
                      const resolution = data.resolutions.find((r) => r.conflict_id === c.id);
                      const a = assignments.find((a) => a.id === c.payload.assignment_id);
                      return (
                        <article key={c.id} className="conflict-record">
                          <strong>
                            {a?.site_label ?? 'Site'} · {c.payload.value ?? c.payload.flag} ·{' '}
                            {c.reason_code.replaceAll('_', ' ')}
                          </strong>
                          <p>
                            Captured {new Date(c.payload.captured_at).toLocaleString()} · operation {c.id}
                          </p>
                          <p>{c.payload.notes}</p>
                          {c.payload.photo && (
                            <p>
                              Photo is retained in the device’s encrypted queue. Obtain a recovery export
                              before discarding this conflict.
                            </p>
                          )}
                          {resolution ? (
                            <p>
                              Resolved: {resolution.decision} · {resolution.reason}
                            </p>
                          ) : (
                            <button
                              className="button secondary small"
                              onClick={() => setEditor({ type: 'resolve_conflict', id: c.id })}
                            >
                              Resolve conflict
                            </button>
                          )}
                        </article>
                      );
                    })}
                </div>
              )}
              <div className="quick-actions" role="group" aria-label="Reading attention filter">
                <button type="button" className={`button ${attentionOnly ? 'secondary' : 'primary'}`}
                  aria-pressed={!attentionOnly} onClick={() => {setAttentionOnly(false);setAttentionReason('all');}}>All readings ({meterScopedReadings.length})</button>
                <button type="button" className={`button ${attentionOnly ? 'primary' : 'secondary'}`}
                  aria-pressed={attentionOnly} onClick={() => {setAttentionOnly(true);setAttentionReason('all');}}>Needs attention ({meterAttentionReadings.length})</button>
              </div>
              {attentionOnly && <label className="history-meter-filter">
                Filter by attention reason
                <select aria-label="Meter attention reason filter" value={attentionReason}
                  onChange={(e)=>setAttentionReason(e.target.value as MeterAttentionReason)}>
                  {attentionReasons.map(reason=><option key={reason.value} value={reason.value}>
                    {reason.label} ({filterMeterReadingWorklist(monthReadings,reviews,historyMeterId,true,reason.value).length})
                  </option>)}
                </select>
              </label>}
              {attentionOnly && <p className="muted small">Attention categories may overlap. Exceptions and flags describe recorded captures; accepted reviews remain in the audit history.</p>}
              <label className="history-meter-filter">
                Filter readings by site
                <select aria-label="Meter review site filter" value={historySiteId}
                  onChange={(e)=>{setHistorySiteId(e.target.value);setHistoryMeterId('');}}>
                  <option value="">All sites with readings ({readingSites.length})</option>
                  {focusedSite && !readingSites.some(site=>site.siteId===focusedSite.id) &&
                    <option value={focusedSite.id}>{focusedSite.label} (no captured readings)</option>}
                  {readingSites.map(site=><option key={site.siteId} value={site.siteId}>
                    {site.label} ({site.count} readings)
                  </option>)}
                </select>
              </label>
              <label className="history-meter-filter">
                Filter readings by utility
                <select aria-label="Meter review utility filter" value={historyUtility}
                  onChange={(e)=>{setHistoryUtility(e.target.value as 'all'|MeterUtility);setHistoryMeterId('');}}>
                  <option value="all">All utilities ({siteReadings.length})</option>
                  {(['electric','water','gas'] as const).map(utility=><option key={utility} value={utility}>
                    {utility[0].toUpperCase()+utility.slice(1)} ({filterMeterReadingsByUtility(siteReadings,data.meters,utility).length})
                  </option>)}
                </select>
              </label>
              <label className="history-meter-filter">
                Meter history filter
                <select value={historyMeterId} onChange={(e) => {setHistoryMeterId(e.target.value);setHistoryUtility('all');}}>
                  <option value="">All meters at this property</option>
                  {data.meters
                    .filter((m) => m.property_id === selectedProperty)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.serial_number}
                      </option>
                    ))}
                </select>
              </label>
              {focusedSite && <p className="muted small">Site focus: {focusedSite.label}. This shows captured readings only; missing capture tasks must be completed in the tablet reader.</p>}
              <label className="history-meter-filter">
                Capture month (property local time)
                <input aria-label="Meter capture month filter" type="month" value={captureMonth}
                  min="2000-01" max="2100-12" onChange={(e)=>setCaptureMonth(e.target.value)} />
              </label>
              <p className="muted small">Capture month uses the property time zone, not your device clock. It filters collected readings only, not billing due dates or reading approvals. Leave blank for all months.</p>
              <div className="action-group">
                <label className="history-meter-filter">
                  Reading order
                  <select aria-label="Meter reading sort order" value={readingOrder}
                    onChange={(e)=>setReadingOrder(e.target.value as MeterReadingOrder)}>
                    <option value="newest">Newest captured first</option>
                    <option value="oldest">Oldest captured first</option>
                    <option value="site">Site number (natural order)</option>
                  </select>
                </label>
                <button type="button" className="button secondary small" onClick={()=>{
                  setHistorySiteId('');
                  setHistoryUtility('all');
                  setHistoryMeterId('');
                  setAttentionOnly(false);
                  setAttentionReason('all');
                  setReadingOrder('newest');
                  setCaptureMonth('');
                }}>Clear review filters</button>
              </div>
              <p className="muted small" role="status">Showing {orderedReadings.length} of {meterScopedReadings.length} readings for the selected site, utility, meter, capture month, attention and sort filters.</p>
              {!visibleReadings.length ? (
                <Empty title={attentionOnly ? 'No readings matching this attention filter' : 'No readings collected'}>
                  {attentionOnly ? 'Try another month, site, meter or attention reason, or select All readings.' : 'Try another capture month, site or meter, or collect readings using the tablet reader.'}
                </Empty>
              ) : (
                <div className="table-wrap" role="region" aria-label="Meter reading history" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Meter / site</th>
                        <th>Captured</th>
                        <th>Original → validated</th>
                        <th>Exceptions / review</th>
                        <th>Effective occupant</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedReadings.map((r) => {
                          const m = data.meters.find((m) => m.id === r.meter_id);
                          const a = assignments.find((a) => a.id === r.assignment_id);
                          const review = latestReview(r.id, reviews);
                          const occupant = data.occupancy.find((o) => o.reading_id === r.id);
                          const person = snapshot.customers.find((c) => c.id === occupant?.customer_id);
                          const photo = data.photos.find((p) => p.reading_id === r.id);
                          return (
                            <tr key={r.id}>
                              <td>
                                <strong>{m?.label}</strong>
                                <small>
                                  {a?.site_label} · {m?.utility}
                                </small>
                              </td>
                              <td>
                                {new Date(r.captured_at).toLocaleString()}
                                <small>{r.kind}</small>
                              </td>
                              <td className="mono">
                                {r.value ?? 'No value'}
                                <small>
                                  →{' '}
                                  {review?.decision === 'accepted'
                                    ? (review.corrected_value ?? r.value)
                                    : 'Unverified'}
                                </small>
                              </td>
                              <td>
                                <span className="status-badge">{review?.decision ?? 'Needs review'}</span>
                                <small>{r.exceptions.join(', ') || 'No automatic flags'}</small>
                                <details>
                                  <summary>Capture & correction history</summary>
                                  <p>{r.notes || 'No capture notes.'}</p>
                                  {reviews
                                    .filter((v) => v.reading_id === r.id)
                                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                                    .map((v) => (
                                      <p key={v.id}>
                                        {new Date(v.created_at).toLocaleString()} · {v.decision}{' '}
                                        {v.corrected_value && `→ ${v.corrected_value}`} · {v.reason}
                                      </p>
                                    ))}
                                </details>
                              </td>
                              <td>
                                {occupant
                                  ? person
                                    ? customerName(person)
                                    : 'Vacant at capture'
                                  : 'Supervisor access required'}
                                <small>{occupant?.captured_on}</small>
                              </td>
                              <td>
                                <div className="action-group">
                                  {manage && (
                                    <button
                                      className="button secondary small"
                                      onClick={() => setEditor({ type: 'review', id: r.id })}
                                    >
                                      {review ? 'Review again' : 'Review'}
                                    </button>
                                  )}
                                  {photo &&
                                    (photo.status === 'uploaded' ? (
                                      <button
                                        className="button secondary small"
                                        onClick={() => viewPhoto(photo.id)}
                                      >
                                        View photo
                                      </button>
                                    ) : (
                                      <span>Photo pending sync</span>
                                    ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </fieldset>
      )}
      {renderEditor()}
      {photoUrl && (
        <Modal title="Meter photograph" onClose={() => setPhotoUrl('')}>
          <p className="muted">Private photo access expires after 60 seconds.</p>
          {/* Private evidence must bypass image optimization/caching. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="meter-evidence"
            src={photoUrl}
            alt="Photograph attached to the selected meter reading"
            referrerPolicy="no-referrer"
          />
        </Modal>
      )}
    </div>
  );
}
