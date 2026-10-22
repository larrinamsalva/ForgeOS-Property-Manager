'use client';
import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { Snapshot } from '@/lib/domain';
import { addDays, customerName, dateAtProperty } from '@/lib/domain';
import { cents } from '@/lib/billing-domain';
import {
  reportDefinitions,
  reportKinds,
  sumMetrics,
  occupancyPercent,
  milli,
  type ReportKind,
  type ReportFilters,
  type ReportResult,
  type ReportsSummary,
} from '@/lib/reports-domain';
import { Empty } from './workspace-parts';
const dates = (s: Snapshot) => {
  const today = dateAtProperty(s.properties[0]?.timezone ?? 'America/Los_Angeles');
  return { starts_on: today.slice(0, 7) + '-01', ends_on: addDays(today, 1) };
};
function query(org: string, filters: ReportFilters, kind: ReportKind, page = 0) {
  const q = new URLSearchParams({ organization: org, kind, page: String(page) });
  for (const [k, v] of Object.entries(filters)) if (v !== null) q.set(k, v);
  return q;
}
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, cache: 'no-store' }),
    data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'Reports are unavailable.');
  return data;
}
export function OperationsMetrics({
  snapshot,
  propertyId = '',
}: {
  snapshot: Snapshot;
  propertyId?: string;
}) {
  const [data, setData] = useState<ReportsSummary | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController(),
      q = new URLSearchParams({ organization: snapshot.organizationId, ...dates(snapshot), summary: '1' });
    read<ReportsSummary>('/api/reports?' + q, c.signal)
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [snapshot]);
  if (error)
    return (
      <p className="alert" role="status">
        {error}
      </p>
    );
  if (!data)
    return (
      <p className="muted" role="status">
        Loading current operations measures…
      </p>
    );
  const rows = data.properties.filter((p) => !propertyId || p.property_id === propertyId);
  return (
    <section className="commercial-metrics" aria-label="Current operations measures">
      {(
        [
          ['Pending work', 'pending_work'],
          ['Open due checklists', 'open_checklists'],
          ['Uncaptured due meter stops', 'outstanding_readings'],
          ['Invoice drafts', 'invoice_drafts'],
          ['Past-due customer accounts', 'past_due_accounts'],
          ['Low-stock items', 'low_stock'],
        ] as const
      ).map(([label, key]) => (
        <div className="metric-card" key={key}>
          <span className="muted small">{label}</span>
          <strong>{sumMetrics(rows, key)}</strong>
        </div>
      ))}
    </section>
  );
}
export function ReportsWorkspace({ snapshot, propertyId }: { snapshot: Snapshot; propertyId: string }) {
  const [kind, setKind] = useState<ReportKind>('property_comparison'),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState<ReportFilters>({
    ...dates(snapshot),
    property_id: propertyId || null,
    site_id: null,
    customer_id: null,
    employee_id: null,
    status: '',
    category: '',
  });
  const [applied, setApplied] = useState(filters),
    [data, setData] = useState<ReportResult | null>(null),
    [summary, setSummary] = useState<ReportsSummary | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const c = new AbortController(),
      q = query(snapshot.organizationId, applied, kind, page);
    Promise.all([
      read<ReportResult>('/api/reports?' + q, c.signal),
      read<ReportsSummary>('/api/reports?' + q + '&summary=1', c.signal),
    ])
      .then(([r, s]) => {
        setData(r);
        setSummary(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [snapshot.organizationId, applied, kind, page, refresh]);
  function update(key: keyof ReportFilters, value: string) {
    setFilters({
      ...filters,
      [key]: value || (['status', 'category', 'starts_on', 'ends_on'].includes(key) ? '' : null),
      ...(key === 'property_id' ? { site_id: null, customer_id: null, employee_id: null } : {}),
    });
  }
  function apply() {
    setLoading(true);
    setData(null);
    setError('');
    setPage(0);
    setApplied({ ...filters });
  }
  async function download() {
    setDownloading(true);
    setError('');
    try {
      const r = await fetch('/api/reports?' + query(snapshot.organizationId, applied, kind) + '&format=csv');
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement('a');
      a.href = url;
      a.download = 'ForgeOS-' + kind + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export unavailable.');
    } finally {
      setDownloading(false);
    }
  }
  const definition = reportDefinitions[kind],
    properties =
      summary?.properties.filter((p) => !applied.property_id || p.property_id === applied.property_id) ?? [],
    pct = occupancyPercent(sumMetrics(properties, 'occupied'), sumMetrics(properties, 'sites'));
  const siteKinds = [
      'occupancy',
      'reservations',
      'tenant_history',
      'rent_roll',
      'monthly_billing',
      'utility_usage',
      'meter_exceptions',
      'aging',
      'maintenance',
    ],
    customerKinds = [
      'occupancy',
      'reservations',
      'tenant_history',
      'rent_roll',
      'monthly_billing',
      'utility_usage',
      'aging',
      'payment_history',
      'maintenance',
    ];
  return (
    <div className="commercial-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Owner reporting</span>
            <h2>Property performance</h2>
            <p className="muted">Current property dates and selected-range activity from saved records.</p>
          </div>
          <button
            className="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError('');
              setRefresh((v) => v + 1);
            }}
          >
            <RefreshCw size={16} />
            Refresh reports
          </button>
        </div>
        <form
          className="report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="field">
            <label htmlFor="report-kind">Report</label>
            <select
              id="report-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ReportKind);
                setPage(0);
                setLoading(true);
                setData(null);
                setError('');
                const next = {
                  ...filters,
                  site_id: null,
                  customer_id: null,
                  employee_id: null,
                  status: '',
                  category: '',
                };
                setFilters(next);
                setApplied(next);
              }}
            >
              {reportKinds.map((k) => (
                <option key={k} value={k}>
                  {reportDefinitions[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-from">From (inclusive)</label>
            <input
              id="report-from"
              type="date"
              required
              value={filters.starts_on}
              onChange={(e) => update('starts_on', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="report-to">To (exclusive)</label>
            <input
              id="report-to"
              type="date"
              required
              value={filters.ends_on}
              onChange={(e) => update('ends_on', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="report-property">Report property</label>
            <select
              id="report-property"
              value={filters.property_id ?? ''}
              onChange={(e) => update('property_id', e.target.value)}
            >
              <option value="">All authorized properties</option>
              {snapshot.properties.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {siteKinds.includes(kind) && (
            <div className="field">
              <label htmlFor="report-site">Site / unit filter</label>
              <select
                id="report-site"
                value={filters.site_id ?? ''}
                onChange={(e) => update('site_id', e.target.value)}
              >
                <option value="">All sites</option>
                {snapshot.sites
                  .filter((s) => !filters.property_id || s.property_id === filters.property_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {customerKinds.includes(kind) && (
            <div className="field">
              <label htmlFor="report-customer">Customer filter</label>
              <select
                id="report-customer"
                value={filters.customer_id ?? ''}
                onChange={(e) => update('customer_id', e.target.value)}
              >
                <option value="">All customers</option>
                {snapshot.customers
                  .filter((c) => !filters.property_id || c.property_id === filters.property_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {customerName(c)}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {['employee_completion', 'maintenance'].includes(kind) && (
            <div className="field">
              <label htmlFor="report-employee">Employee filter</label>
              <select
                id="report-employee"
                value={filters.employee_id ?? ''}
                onChange={(e) => update('employee_id', e.target.value)}
              >
                <option value="">All employees</option>
                {summary?.employees
                  .filter((e) => !filters.property_id || e.property_id === filters.property_id)
                  .map((e) => (
                    <option key={e.property_id + e.user_id} value={e.user_id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {![
            'daily_operations',
            'rent_roll',
            'utility_usage',
            'payment_history',
            'revenue_trends',
            'property_comparison',
          ].includes(kind) && (
            <div className="field">
              <label htmlFor="report-status">Exact status filter</label>
              <input
                id="report-status"
                value={filters.status}
                onChange={(e) => update('status', e.target.value)}
                placeholder="Leave blank for every status"
              />
            </div>
          )}
          {['maintenance', 'inventory', 'meter_exceptions'].includes(kind) && (
            <div className="field">
              <label htmlFor="report-category">Category contains</label>
              <input
                id="report-category"
                value={filters.category}
                onChange={(e) => update('category', e.target.value)}
              />
            </div>
          )}
          <button className="button primary" type="submit" disabled={loading}>
            Apply report filters
          </button>
        </form>
        <p className="muted small">
          {definition.description} Date windows are 1–366 days; dashboard cash and new customers use that
          range.
        </p>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading report…</p>
      ) : (
        data &&
        summary && (
          <>
            <section className="commercial-metrics" aria-label="Property summary">
              {[
                [
                  'Occupied / sites',
                  sumMetrics(properties, 'occupied') + ' / ' + sumMetrics(properties, 'sites'),
                ],
                ['Occupancy', pct === null ? '—' : pct + '%'],
                ['Available sites', sumMetrics(properties, 'available')],
                ['New customers in range', sumMetrics(properties, 'new_customers')],
                ['Net payment cash', cents(sumMetrics(properties, 'payment_cash_cents'))],
                ['Net deposit cash', cents(sumMetrics(properties, 'deposit_cash_cents'))],
              ].map(([label, value]) => (
                <div className="metric-card" key={label}>
                  <span className="muted small">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{definition.label}</h2>
                  <p className="muted small">
                    {data.total} matching rows · Generated {new Date(data.generated_at).toLocaleString()}
                  </p>
                </div>
                <button className="button" disabled={downloading} onClick={download}>
                  <Download size={16} />
                  {downloading ? 'Preparing…' : 'Export report CSV'}
                </button>
              </div>
              {data.rows.length ? (
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Report results table">
                  <table>
                    <caption className="sr-only">{definition.label}</caption>
                    <thead>
                      <tr>
                        {definition.columns.map((c) => (
                          <th scope="col" key={c.label}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.id}>
                          {r.values.map((v, i) => (
                            <td key={i}>
                              {v === null
                                ? '—'
                                : definition.columns[i]?.kind === 'money'
                                  ? cents(String(v))
                                  : definition.columns[i]?.kind === 'milli'
                                    ? milli(String(v))
                                    : definition.columns[i]?.kind === 'percent'
                                      ? v + '%'
                                      : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No matching report rows">
                  Adjust the filters or record activity to populate the report.
                </Empty>
              )}
              <div className="pagination">
                <button
                  className="button"
                  disabled={page === 0}
                  onClick={() => {
                    setLoading(true);
                    setPage((v) => v - 1);
                  }}
                >
                  Previous report page
                </button>
                <span>Page {page + 1} · 50 rows per page</span>
                <button
                  className="button"
                  disabled={BigInt((page + 1) * 50) >= BigInt(data.total)}
                  onClick={() => {
                    setLoading(true);
                    setPage((v) => v + 1);
                  }}
                >
                  Next report page
                </button>
              </div>
            </section>
            <section className="panel">
              <h2>Current property comparison</h2>
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Current property comparison table"
              >
                <table>
                  <thead>
                    <tr>
                      {[
                        'Property',
                        'Business date',
                        'Occupied / sites',
                        'Available',
                        'Pending work',
                        'Invoice drafts',
                        'Past-due accounts',
                        'Low stock',
                      ].map((h) => (
                        <th scope="col" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p) => (
                      <tr key={p.property_id}>
                        <td>
                          {p.name}
                          {p.archived ? ' (archived)' : ''}
                        </td>
                        <td>{p.as_of}</td>
                        <td>
                          {p.occupied} / {p.sites}
                        </td>
                        <td>{p.available}</td>
                        <td>{p.pending_work}</td>
                        <td>{p.invoice_drafts}</td>
                        <td>{p.past_due_accounts}</td>
                        <td>{p.low_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
