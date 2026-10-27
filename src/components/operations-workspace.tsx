'use client';
import { useEffect, useRef, useState } from 'react';
import { Wrench, RefreshCw, Download } from 'lucide-react';
import { addDays, canEditProperty, csv, dateAtProperty, type Snapshot } from '@/lib/domain';
import { operationAlerts, opsLabel, type OperationsSnapshot } from '@/lib/operations-domain';
import { filterWorkOrdersBySite, focusedSiteWorkOrder, maintenanceFormSiteDefault } from '@/lib/site-maintenance-focus';
import { OperationsEditor } from './operations/editor';
import {
  WorkPanel,
  StockPanel,
  PurchasingPanel,
  SuppliersPanel,
  EquipmentPanel,
  DailyPanel,
  PlansPanel,
  TeamPanel,
  NotificationsPanel,
} from './operations/panels';
import { Empty } from './workspace-parts';
import type { OpsEditor, OpsUI } from './operations/types';
const tabs: Record<string, [string, string][]> = {
  maintenance: [
    ['work', 'Work orders'],
    ['mine', 'My Service'],
    ['plans', 'Preventive calendar'],
    ['equipment', 'Equipment'],
    ['notifications', 'My notifications'],
  ],
  inventory: [
    ['stock', 'Stock & supplies'],
    ['purchasing', 'Purchasing'],
    ['suppliers', 'Suppliers'],
    ['equipment', 'Equipment'],
  ],
  operations: [
    ['daily', 'Daily checklists'],
    ['plans', 'Recurring calendar'],
    ['team', 'Staff & history'],
    ['notifications', 'My notifications'],
  ],
};
export function OperationsWorkspace({
  snapshot,
  propertyId,
  section,
  navigationPending,
  initialSiteId,
  initialWorkId,
  initialCreate,
}: {
  snapshot: Snapshot;
  propertyId: string;
  section: string;
  navigationPending: boolean;
  initialSiteId?: string;
  initialWorkId?: string;
  initialCreate?: boolean;
}) {
  const allowed = (id: string) =>
    canEditProperty(snapshot, id, true) ||
    snapshot.propertyMemberships.some(
      (m) => m.property_id === id && m.user_id === snapshot.userId && m.role === 'maintenance'
    );
  const [selected, setSelected] = useState(
    propertyId || snapshot.properties.find((p) => allowed(p.id))?.id || ''
  );
  const property = snapshot.properties.find((p) => p.id === selected),
    today = dateAtProperty(property?.timezone ?? 'America/Los_Angeles');
  const [tab, setTab] = useState(tabs[section][0][0]),
    [data, setData] = useState<OperationsSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<OpsEditor | null>(null),
    [search, setSearch] = useState(''),
    [siteFilter, setSiteFilter] = useState(initialSiteId ?? ''),
    [status, setStatus] = useState('all'),
    [starts, setStarts] = useState(addDays(today, -7)),
    [ends, setEnds] = useState(addDays(today, 30));
  const openedLinkedRepair = useRef(false);
  const workSites = snapshot.sites.filter(site => site.property_id === selected);
  const focusedSite = section === 'maintenance' && workSites.some(site => site.id === siteFilter) ? siteFilter : '';
  const active = !!property && !property.archived_at && property.operating_status === 'active',
    office = canEditProperty(snapshot, selected, true),
    manage = canEditProperty(snapshot, selected);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/operations?organization=${snapshot.organizationId}&starts=${starts}&ends=${ends}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setData(v);
        setError('');
        // Route work IDs never authorize access: open only a matching work
        // record from the authorized operations response and validated site.
        // Once handled, a refresh must not unexpectedly reopen a closed modal.
        if (!openedLinkedRepair.current && initialCreate && !initialWorkId && initialSiteId &&
            section === 'maintenance' && selected === propertyId &&
            siteFilter === initialSiteId && allowed(selected)) {
          openedLinkedRepair.current = true;
          const site = maintenanceFormSiteDefault(snapshot.sites, selected, initialSiteId);
          const property = snapshot.properties.find(p=>p.id===selected);
          if (site && property && !property.archived_at && property.operating_status==='active') {
            setTab('work');
            setEditor({
              type:canEditProperty(snapshot,selected,true)?'new_work':'maintenance_self_task',
              value:site,
              requestId:crypto.randomUUID(),
            });
          } else {
            setNotice('This site is unavailable for a new maintenance request. Choose an active site in the worklist.');
          }
        }
        if (!openedLinkedRepair.current && initialWorkId && initialSiteId &&
            section === 'maintenance' && selected === propertyId &&
            siteFilter === initialSiteId && allowed(selected)) {
          openedLinkedRepair.current = true;
          const work = focusedSiteWorkOrder(
            (v as OperationsSnapshot).work, initialWorkId, selected, initialSiteId,
          );
          if (work) {
            setTab('work');
            setEditor({ type:'work_detail', id:work.id, requestId:crypto.randomUUID() });
          } else {
            setNotice('This repair is not available at the selected site. Review the site worklist instead.');
          }
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [snapshot.organizationId, starts, ends, refresh]);
  const reload = () => {
      setLoading(true);
      setRefresh((n) => n + 1);
    },
    close = () => setEditor(null);
  const open: OpsUI['open'] = (type, id, relatedId, value) => {
    setError('');
    setEditor({ type, id, relatedId, value, requestId: crypto.randomUUID() });
  };
  async function command(action: string, values: Record<string, unknown>, requestId = editor?.requestId) {
    if (!requestId) throw new Error('Open this action again.');
    const r = await fetch('/api/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: action,
        payload: {
          organization_id: snapshot.organizationId,
          property_id: selected,
          request_id: requestId,
          ...values,
        },
      }),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v as { id: string };
  }
  const finish = () => {
    close();
    setNotice('Operations record saved. Earlier history is retained.');
    reload();
  };
  async function save(action: string, values: Record<string, unknown>) {
    const result = await command(action, values);
    finish();
    return result;
  }
  const ui: OpsUI | null = data
    ? { data, snapshot, propertyId: selected, today, office, manage, active, open }
    : null;
  const alerts = data ? operationAlerts(data, selected, today) : [];
  function exportHistory() {
    if (!data) return;
    const rows =
      section === 'inventory'
        ? [
            [
              'Date',
              'Item',
              'Event',
              'Quantity milliunits',
              'Recorded cost cents (USD)',
              'Reference',
              'Reason',
            ],
            ...data.movements
              .filter((m) => m.property_id === selected)
              .map((m) => [
                m.effective_on,
                data.items.find((i) => i.id === m.item_id)?.sku ?? m.item_id,
                m.kind,
                m.delta_milli,
                m.total_cost_cents,
                m.reference,
                m.reason,
              ]),
          ]
        : [
            ['Work order', 'Title', 'Status', 'Assigned user', 'Requested', 'Due', 'Completed', 'Closed'],
            ...filterWorkOrdersBySite(data.work.filter((w) => w.property_id === selected), focusedSite)
              .map((w) => [
                w.number,
                w.title,
                w.status,
                w.assigned_to ?? '',
                w.requested_on,
                w.due_on ?? '',
                w.completed_on ?? '',
                w.closed_on ?? '',
              ]),
          ];
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = section === 'inventory' ? 'forgeos-stock-history.csv' : 'forgeos-work-orders.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="billing-workspace ops-workspace">
      <div className="reader-banner">
        <span className="property-icon">
          <Wrench size={28} />
        </span>
        <div>
          <span className="eyebrow">Property operations</span>
          <h2>Keep the property moving.</h2>
          <p>
            Manage repairs, materials, equipment and recurring checks with assigned responsibility and
            retained history.
          </p>
        </div>
      </div>
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="meter-controls">
        <label>
          Operations property
          <select
            value={selected}
            disabled={loading || navigationPending}
            onChange={(e) => {
              setSelected(e.target.value);
              setSearch('');
              setSiteFilter('');
              setStatus('all');
              close();
            }}
          >
            {snapshot.properties
              .filter((p) => (!propertyId || p.id === propertyId) && allowed(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? ' · archived' : ''}
                </option>
              ))}
          </select>
        </label>
        <label>
          Search operations
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Work, stock code, or equipment"
          />
        </label>
        {section === 'maintenance' && <label>
          Maintenance site
          <select aria-label="Maintenance site filter" value={focusedSite}
            onChange={(e)=>{setSiteFilter(e.target.value);setStatus('all');}}>
            <option value="">All sites at this property</option>
            {workSites.map(site=><option key={site.id} value={site.id}>
              {site.label}{site.archived_at ? ' · archived' : ''}
            </option>)}
          </select>
        </label>}
        {section === 'maintenance' && focusedSite && <button type="button" className="button secondary"
          onClick={()=>setSiteFilter('')}>Show all site repairs</button>}
        {tab === 'work' && (
          <label>
            Work status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                'all',
                'new',
                'assigned',
                'scheduled',
                'in_progress',
                'waiting_parts',
                'completed',
                'closed',
                'cancelled',
              ].map((s) => (
                <option key={s} value={s}>
                  {opsLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="button secondary" disabled={loading || navigationPending} onClick={reload}>
          <RefreshCw size={16} />
          Reload operations
        </button>
        {office && (
          <button className="button secondary" disabled={loading || !data} onClick={exportHistory}>
            <Download size={16} />
            Export {section === 'inventory' ? 'stock history' : focusedSite ? 'site work orders' : 'work orders'}
          </button>
        )}
      </div>
      {!selected ? (
        <Empty title="No operations access">
          An owner can grant a maintenance, office or manager property role in Team & access.
        </Empty>
      ) : loading ? (
        <p role="status">Loading operations…</p>
      ) : !ui ? (
        <Empty title="Operations unavailable">
          Reload when the database connection and migrations are available.
        </Empty>
      ) : section === 'inventory' && !office ? (
        <Empty title="Inventory and purchasing require office access">
          Use Maintenance for your assigned jobs, material usage and equipment checkouts.
        </Empty>
      ) : (
        <>
          {!active && (
            <p className="alert">
              This property is inactive or archived. Restore and activate it before recording changes.
            </p>
          )}
          {section === 'maintenance' && focusedSite && <p className="muted small">
            Showing maintenance work orders for {workSites.find(site=>site.id===focusedSite)?.label ?? 'this site'}.
            Work-order counts and CSV export use this site; operational alerts above the worklist and other workspaces may cover the whole property.
          </p>}
          <section className="panel ops-alerts">
            <div className="panel-heading">
              <div>
                <h2>Operational alerts</h2>
                <p>
                  {alerts.length} items need attention as of {today} at the property.
                </p>
              </div>
            </div>
            {alerts.slice(0, 10).map((a) => (
              <p key={a.key}>
                <button className="text-button" onClick={() => open(a.type, a.id)}>
                  {a.text}
                </button>
              </p>
            ))}
            {alerts.length > 10 && (
              <p>
                Showing the first 10. Open the corresponding work, stock, equipment or checklist lists for all
                items.
              </p>
            )}
            {!alerts.length && <p>No current overdue or low-stock alerts in your authorized records.</p>}
          </section>
          <div className="planning-tabs" role="group" aria-label="Operations sections">
            {tabs[section]
              .filter(([id]) => office || !['plans'].includes(id))
              .map(([id, label]) => (
                <button
                  key={id}
                  className={`button ${id === tab ? 'primary' : 'secondary'}`}
                  aria-pressed={id === tab}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === 'notifications'
                    ? ` (${data?.notifications.filter((n) => n.property_id === selected && !n.read_at).length ?? 0})`
                    : ''}
                </button>
              ))}
          </div>
          {tab === 'work' && <WorkPanel ui={ui} search={search} status={status} onStatusChange={setStatus} siteId={focusedSite} />}{' '}
          {tab === 'mine' && <WorkPanel ui={ui} search={search} status="all" mineOnly siteId={focusedSite} />}{' '}
          {tab === 'stock' && <StockPanel ui={ui} search={search} />}{' '}
          {tab === 'purchasing' && <PurchasingPanel ui={ui} />}{' '}
          {tab === 'suppliers' && <SuppliersPanel ui={ui} />}{' '}
          {tab === 'equipment' && <EquipmentPanel ui={ui} search={search} />}{' '}
          {tab === 'daily' && <DailyPanel ui={ui} />}{' '}
          {tab === 'plans' && office && (
            <PlansPanel
              ui={ui}
              starts={starts}
              ends={ends}
              setRange={(start, end) => {
                if (start && end) {
                  setLoading(true);
                  setStarts(start);
                  setEnds(end);
                }
              }}
            />
          )}{' '}
          {tab === 'team' && <TeamPanel ui={ui} />}{' '}
          {tab === 'notifications' && (
            <NotificationsPanel
              ui={ui}
              read={async (id) => {
                await command(
                  'read_notification',
                  { id, reason: 'Read internal operations notification' },
                  crypto.randomUUID()
                );
                reload();
              }}
            />
          )}
        </>
      )}
      {ui && editor && (
        <OperationsEditor
          key={editor.requestId}
          ui={ui}
          editor={editor}
          close={close}
          save={save}
          command={command}
          finish={finish}
        />
      )}
    </div>
  );
}
