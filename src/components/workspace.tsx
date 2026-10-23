'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  Flame,
  LayoutDashboard,
  Building2,
  Caravan,
  Users,
  KeyRound,
  Map,
  ShieldCheck,
  ChevronRight,
  Plus,
  Search,
  Download,
  LogOut,
  ArrowUpRight,
  CalendarDays,
  FileText,
  Gauge,
  Receipt,
  Wrench,
  Package,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import type { Snapshot, Site, Customer, Property, PropertyMembership } from '@/lib/domain';
import {
  canManageOrganization,
  canEditProperty,
  isOwner,
  customerName,
  dateAtProperty,
  isCurrentStay,
  money,
  moneyInput,
  siteStatus,
  csv,
} from '@/lib/domain';
import { Modal } from './modal';
import { ThemeButton } from './theme-button';
import {
  RecordForm,
  propertyFields,
  siteFields,
  customerFields,
  stayFields,
  moveOutFields,
  type Field,
} from './record-form';
import { Badge, Empty, Overview, SiteMap, StayHistory } from './workspace-parts';
import { MeterWorkspace } from './meter-workspace';
import { SiteMeterFile } from './site-meter-file';
import { CustomerBillingFile } from './customer-billing-file';
const BillingWorkspace = dynamic(() =>
  import('./billing-workspace').then((module) => module.BillingWorkspace)
);
const CollectionsWorkspace = dynamic(() =>
  import('./collections-workspace').then((module) => module.CollectionsWorkspace)
);
const OperationsWorkspace = dynamic(() =>
  import('./operations-workspace').then((module) => module.OperationsWorkspace)
);
const PaperlessWorkspace = dynamic(() => import('./paperless-workspace').then((module) => module.PaperlessWorkspace));
import { pendingMeterCount } from '@/lib/offline-pending';
import { siteOverdueFlags } from '@/lib/site-overdue';
import type { CollectionsSnapshot } from '@/lib/collections-domain';
import { PlanningWorkspace, PlanningHistory } from './planning-workspace';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'map', label: 'Property map', icon: Map },
  { id: 'sites', label: 'Sites & units', icon: Caravan },
  { id: 'customers', label: 'Customers & tenants', icon: Users },
  { id: 'paperless', label: 'Paperless photos & files', icon: FileText },
  { id: 'occupancy', label: 'Occupancy & history', icon: KeyRound },
  { id: 'reservations', label: 'Reservations', icon: CalendarDays },
  { id: 'leases', label: 'Leases & renewals', icon: FileText },
  { id: 'meters', label: 'Meters & reader', icon: Gauge },
  { id: 'billing', label: 'Utilities & billing', icon: Receipt },
  { id: 'collections', label: 'Payments & collections', icon: Receipt },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'inventory', label: 'Inventory & purchasing', icon: Package },
  { id: 'operations', label: 'Team & daily operations', icon: CheckCircle2 },
  { id: 'reports', label: 'Reports & properties', icon: LayoutDashboard },
  { id: 'communications', label: 'Resident communications', icon: MessageSquare },
  { id: 'commercial', label: 'Portal & account', icon: ShieldCheck },
];
const ReportsWorkspace = dynamic(() => import('./reports-workspace').then((m) => m.ReportsWorkspace));
const OperationsMetrics = dynamic(() => import('./reports-workspace').then((m) => m.OperationsMetrics));
const CommercialWorkspace = dynamic(() =>
  import('./commercial-workspace').then((m) => m.CommercialWorkspace)
);
type Entity = 'property' | 'site' | 'customer';
type Editor =
  | { type: Entity; id?: string }
  | { type: 'stay'; property: string; site?: string }
  | { type: 'moveout'; id: string }
  | { type: 'plan' | 'transfer'; id: string }
  | { type: 'archive'; entity: Entity; id: string; restore?: boolean }
  | { type: 'detail'; entity: Entity; id: string }
  | { type: 'access' }
  | { type: 'revoke'; membership: PropertyMembership };
async function mutate(payload: unknown) {
  const response = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Could not save the record.');
  return result;
}
export function Workspace({
  snapshot,
  section,
  propertyId,
  billingFocus,
}: {
  snapshot: Snapshot;
  section: string;
  propertyId: string;
  billingFocus?: { siteId: string; stayId: string; month?: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [financialRead, setFinancialRead] = useState<{
    key: string; data?: CollectionsSnapshot; error?: boolean;
  } | null>(null);
  const [sectionFilter, setSectionFilter] = useState('');
  const org = snapshot.organizations.find((o) => o.id === snapshot.organizationId);
  const manageOrg = canManageOrganization(snapshot);
  const operatingAccess =
    manageOrg ||
    snapshot.propertyMemberships.some(
      (m) => m.user_id === snapshot.userId && ['manager', 'office'].includes(m.role)
    );
  const financialKey = snapshot.organizationId + ':' + section;
  // Read only. The existing collections endpoint enforces session membership and
  // database RLS. Never fetch financial records for maintenance/meter-only roles.
  useEffect(() => {
    if (!snapshot.organizationId || !operatingAccess || !['overview', 'map'].includes(section)) return;
    const controller = new AbortController();
    fetch('/api/collections?organization=' + encodeURIComponent(snapshot.organizationId), {
      cache: 'no-store', signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Financial data unavailable');
        return response.json() as Promise<CollectionsSnapshot>;
      })
      .then((records) => {
        if (!controller.signal.aborted) {
          setFinancialRead({ key: financialKey, data: records });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFinancialRead({ key: financialKey, error: true });
      });
    return () => controller.abort();
  }, [snapshot.organizationId, operatingAccess, section, financialKey]);
  const financialVisibility = !operatingAccess ? 'restricted'
    : financialRead?.key !== financialKey ? 'loading'
    : financialRead.error ? 'unavailable' : 'ready';
  const arrears = financialVisibility === 'ready' && financialRead?.data
    ? siteOverdueFlags(financialRead.data.summary.accounts, financialRead.data.invoices, snapshot.stays, snapshot.properties)
    : {};

  const properties = snapshot.properties.filter((p) => !propertyId || p.id === propertyId);
  const ids = new Set(properties.map((p) => p.id));
  const sites = snapshot.sites.filter((s) => ids.has(s.property_id));
  const customers = snapshot.customers.filter((c) => ids.has(c.property_id));
  const stays = snapshot.stays.filter((s) => ids.has(s.property_id));
  const editableProperties = properties.filter(
    (p) => !p.archived_at && p.operating_status === 'active' && canEditProperty(snapshot, p.id)
  );
  const customerProperties = properties.filter(
    (p) => !p.archived_at && p.operating_status === 'active' && canEditProperty(snapshot, p.id, true)
  );
  const chosenProperty = snapshot.properties.find((p) => p.id === propertyId);
  const title = navigation.find((n) => n.id === section)?.label ?? 'Team & access';
  const href = (target: string, property = propertyId) =>
    `/${target === 'overview' ? '' : target}?${new URLSearchParams({ organization: snapshot.organizationId, ...(property ? { property } : {}) })}`;
  const close = () => setEditor(null);
  const stamp = (site: Site) =>
    siteStatus(
      site,
      snapshot.stays,
      dateAtProperty(
        snapshot.properties.find((p) => p.id === site.property_id)?.timezone ?? 'America/Los_Angeles'
      ),
      snapshot.reservations
    );
  const match = (value: string) => value.toLowerCase().includes(search.toLowerCase().trim());
  const visibleSites = sites
    .filter(
      (s) =>
        (showArchived ||
          (!s.archived_at && !snapshot.properties.find((p) => p.id === s.property_id)?.archived_at)) &&
        match(`${s.label} ${s.section} ${s.kind}`) &&
        (status === 'all' || stamp(s) === status) &&
        (!sectionFilter || s.section === sectionFilter)
    )
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const visibleCustomers = customers.filter(
    (c) =>
      (showArchived ||
        (!c.archived_at && !snapshot.properties.find((p) => p.id === c.property_id)?.archived_at)) &&
      match(`${customerName(c)} ${c.email} ${c.phone}`)
  );
  async function save(entity: string, action: string, values?: unknown, id?: string) {
    const result = await mutate({
      entity,
      action,
      organization_id: snapshot.organizationId,
      ...(id ? { id } : {}),
      ...(values !== undefined ? { values } : {}),
    });
    setNotice(
      action === 'moveout'
        ? 'Stay completed. The site is now in preparation.'
        : 'Your changes have been saved.'
    );
    close();
    startTransition(() => router.refresh());
    return result;
  }
  async function signout() {
    try {
      const pending = await pendingMeterCount(snapshot.userId);
      if (
        pending &&
        !window.confirm(
          `${pending} meter entries or photos are still unsynced on this device. Export a recovery copy in the Tablet Reader first. Sign out and keep the encrypted queue?`
        )
      )
        return;
    } catch {
      if (!window.confirm('Local meter storage could not be checked. Sign out and keep any saved queue?'))
        return;
    }
    const response = await fetch('/api/auth/signout', { method: 'POST' });
    if (response.ok) {
      router.replace('/login');
      router.refresh();
    } else setNotice('Could not sign out. Please try again.');
  }
  function exportSites() {
    const rows = [
      [
        'Property',
        'Site / unit',
        'Type',
        'Section',
        'Status',
        'Monthly rent (USD)',
        'Nightly rent (USD)',
        'Amenities',
      ],
      ...visibleSites.map((s) => [
        snapshot.properties.find((p) => p.id === s.property_id)?.name ?? '',
        s.label,
        s.kind,
        s.section,
        stamp(s),
        moneyInput(s.monthly_rate_cents),
        moneyInput(s.nightly_rate_cents),
        s.amenities.join(', '),
      ]),
    ];
    const blob = new Blob(['\uFEFF' + csv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ForgeOS-sites.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  function tools(placeholder: string) {
    return (
      <div className="list-tools">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={placeholder}
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Include archived
        </label>
      </div>
    );
  }
  function actions(entity: Entity, record: Site | Customer | Property, canEdit: boolean) {
    return canEdit ? (
      <div className="row-actions">
        {!record.archived_at && (
          <button className="text-button" onClick={() => setEditor({ type: entity, id: record.id })}>
            Edit
          </button>
        )}
        <button
          className="text-button muted"
          onClick={() => setEditor({ type: 'archive', entity, id: record.id, restore: !!record.archived_at })}
        >
          {record.archived_at ? 'Restore' : 'Archive'}
        </button>
      </div>
    ) : (
      <span className="muted small">View only</span>
    );
  }
  function editorContent() {
    if (!editor) return null;
    if (editor.type === 'property') {
      const record = snapshot.properties.find((p) => p.id === editor.id);
      return (
        <Modal title={record ? 'Edit property' : 'Add property'} onClose={close}>
          <RecordForm
            fields={propertyFields}
            initial={record ? { ...record } : {}}
            onCancel={close}
            onSave={(v) => save('property', record ? 'update' : 'create', v, record?.id).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'site') {
      const record = snapshot.sites.find((p) => p.id === editor.id);
      const prop = record?.property_id ?? editableProperties[0]?.id ?? '';
      const count = snapshot.sites.filter((s) => s.property_id === prop).length;
      const initial = record
        ? {
            ...record,
            monthly_rate: moneyInput(record.monthly_rate_cents),
            weekly_rate: moneyInput(record.weekly_rate_cents),
            nightly_rate: moneyInput(record.nightly_rate_cents),
            deposit: moneyInput(record.deposit_cents),
            amenities: record.amenities.join(', '),
          }
        : { property_id: prop, map_x: count % 8, map_y: Math.floor(count / 8) };
      return (
        <Modal title={record ? `Edit ${record.label}` : 'Add site or unit'} onClose={close}>
          <RecordForm
            fields={siteFields(
              record ? snapshot.properties.filter((p) => p.id === record.property_id) : editableProperties
            )}
            initial={initial}
            locked={record ? ['property_id'] : []}
            onCancel={close}
            onSave={(v) => save('site', record ? 'update' : 'create', v, record?.id).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'customer') {
      const record = snapshot.customers.find((c) => c.id === editor.id);
      return (
        <Modal title={record ? 'Edit customer' : 'Add customer'} onClose={close}>
          <RecordForm
            fields={customerFields(
              record ? snapshot.properties.filter((p) => p.id === record.property_id) : customerProperties
            )}
            initial={record ? { ...record } : { property_id: customerProperties[0]?.id ?? '' }}
            locked={record ? ['property_id'] : []}
            onCancel={close}
            onSave={(v) => save('customer', record ? 'update' : 'create', v, record?.id).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'stay') {
      const site = snapshot.sites.find((s) => s.id === editor.site);
      return (
        <Modal title="Assign a customer to a site" onClose={close}>
          <p className="muted">
            Choose an existing customer at this property and record the move-in handover. Use Reservations to
            plan future arrivals.
          </p>
          <RecordForm
            fields={stayFields(snapshot, editor.property)}
            initial={{
              property_id: editor.property,
              ...(site ? { site_id: site.id, agreed_rate: moneyInput(site.monthly_rate_cents) } : {}),
            }}
            locked={['property_id']}
            submit="Confirm move-in"
            onCancel={close}
            onSave={(v) => save('stay', 'create', v).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'moveout') {
      const stay = snapshot.stays.find((s) => s.id === editor.id)!;
      const property = snapshot.properties.find((p) => p.id === stay.property_id);
      return (
        <Modal title="Complete this stay" onClose={close}>
          <p>
            Complete the stay for{' '}
            <strong>{customerName(snapshot.customers.find((c) => c.id === stay.customer_id))}</strong>. Its
            history will be retained and the site will be marked in preparation.
          </p>
          <RecordForm
            fields={moveOutFields(stay, property?.timezone ?? 'America/Los_Angeles')}
            submit="Confirm move-out"
            onCancel={close}
            onSave={(v) => save('stay', 'moveout', v, stay.id).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'plan' || editor.type === 'transfer') {
      const stay = snapshot.stays.find((s) => s.id === editor.id)!;
      const property = snapshot.properties.find((p) => p.id === stay.property_id)!;
      const currentSite = snapshot.sites.find((s) => s.id === stay.site_id)!;
      const today = dateAtProperty(property.timezone);
      const fields: Field[] =
        editor.type === 'plan'
          ? [
              {
                name: 'planned_ends_on',
                label: 'Planned departure',
                type: 'date',
                min: today,
                default: stay.planned_ends_on ?? '',
                help: 'Leaving this empty makes the stay open-ended and blocks later bookings.',
              },
              { name: 'reason', label: 'Reason for departure change', type: 'textarea', required: true },
            ]
          : [
              {
                name: 'destination',
                label: 'Destination site / unit',
                type: 'select',
                required: true,
                options: snapshot.sites
                  .filter(
                    (s) =>
                      s.property_id === stay.property_id &&
                      s.id !== stay.site_id &&
                      s.kind === currentSite.kind &&
                      !s.archived_at &&
                      s.physical_status === 'ready' &&
                      !snapshot.stays.some((o) => o.site_id === s.id && !o.ends_on)
                  )
                  .map((s) => ({ value: s.id, label: s.label })),
              },
              {
                name: 'transfer_on',
                label: 'Transfer date',
                type: 'date',
                required: true,
                min: stay.starts_on,
                max: today,
                default: today,
              },
              {
                name: 'agreed_rate',
                label: 'New agreed rate ($)',
                required: true,
                default: moneyInput(stay.agreed_rate_cents),
                help: `Rate per ${stay.billing_period}.`,
              },
              {
                name: 'reason',
                label: 'Transfer reason and condition notes',
                type: 'textarea',
                required: true,
              },
            ];
      return (
        <Modal
          title={editor.type === 'plan' ? 'Update departure plan' : 'Transfer to another site'}
          onClose={close}
        >
          <p>
            {customerName(snapshot.customers.find((c) => c.id === stay.customer_id))} · {currentSite.label}
          </p>
          <p className="muted">
            {editor.type === 'plan'
              ? 'Confirmed bookings and other stays are checked before extending this stay.'
              : 'The earlier stay will close and remain in history. The new stay starts on the transfer date after availability is checked.'}
          </p>
          <RecordForm
            fields={fields}
            submit={editor.type === 'plan' ? 'Save departure plan' : 'Confirm transfer'}
            onCancel={close}
            onSave={(v) => save('stay', editor.type, v, stay.id).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'archive') {
      return (
        <Modal title={`${editor.restore ? 'Restore' : 'Archive'} ${editor.entity}?`} onClose={close}>
          <p>
            {editor.restore
              ? 'Restore this record to the active directory.'
              : 'This record will leave the active directory. Customer details, completed stays, and audit history will remain available. Active stays must be completed first.'}
          </p>
          <RecordForm
            fields={[]}
            submit={editor.restore ? 'Restore record' : 'Archive record'}
            onCancel={close}
            onSave={() =>
              save(editor.entity, editor.restore ? 'restore' : 'archive', undefined, editor.id).then(() => {})
            }
          />
        </Modal>
      );
    }
    if (editor.type === 'access') {
      const fields: Field[] = [
        {
          name: 'property_id',
          label: 'Property',
          type: 'select',
          required: true,
          options: properties.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: 'user_id',
          label: 'Registered staff user ID',
          required: true,
          help: 'The staff member can copy this from their Team & access screen after creating an account.',
        },
        {
          name: 'role',
          label: 'Property role',
          type: 'select',
          required: true,
          options: [
            { value: 'manager', label: 'Property manager' },
            { value: 'office', label: 'Office staff' },
            { value: 'maintenance', label: 'Maintenance staff' },
            { value: 'meter_technician', label: 'Meter technician' },
          ],
          default: 'manager',
        },
      ];
      return (
        <Modal title="Grant property access" onClose={close}>
          <p className="muted">
            Only an owner can grant access. Maintenance and meter roles have no access to customer or
            financial records in this foundation release.
          </p>
          <RecordForm
            fields={fields}
            initial={{ property_id: chosenProperty?.id ?? properties[0]?.id ?? '' }}
            onCancel={close}
            submit="Grant access"
            onSave={(v) => save('access', 'grant', v).then(() => {})}
          />
        </Modal>
      );
    }
    if (editor.type === 'revoke') {
      const m = editor.membership;
      return (
        <Modal title="Revoke property access?" onClose={close}>
          <p>
            This removes this person’s property role. Organization owners and administrators retain their
            organization-wide access.
          </p>
          <RecordForm
            fields={[]}
            submit="Revoke access"
            onCancel={close}
            onSave={() =>
              save('access', 'revoke', { property_id: m.property_id, user_id: m.user_id, role: m.role }).then(
                () => {}
              )
            }
          />
        </Modal>
      );
    }
    if (editor.type !== 'detail') return null;
    const record =
      editor.entity === 'site'
        ? snapshot.sites.find((s) => s.id === editor.id)
        : editor.entity === 'customer'
          ? snapshot.customers.find((c) => c.id === editor.id)
          : snapshot.properties.find((p) => p.id === editor.id);
    if (!record) return null;
    const history = snapshot.stays.filter((s) =>
      editor.entity === 'site'
        ? s.site_id === record.id
        : editor.entity === 'customer'
          ? s.customer_id === record.id
          : s.property_id === record.id
    );
    const detailTitle =
      editor.entity === 'site'
        ? `Site / unit ${(record as Site).label}`
        : editor.entity === 'customer'
          ? customerName(record as Customer)
          : (record as Property).name;
    return (
      <Modal title={detailTitle} onClose={close}>
        <div className="detail-summary">
          {editor.entity === 'site' ? (
            <>
              <Badge status={stamp(record as Site)} />
              <p>
                <strong>{money((record as Site).monthly_rate_cents)}</strong> / month ·{' '}
                {(record as Site).kind}
              </p>
              <p>{(record as Site).amenities.join(' · ') || 'No amenities listed'}</p>
              <p className="muted">{(record as Site).notes || 'No internal notes.'}</p>
              {stamp(record as Site) === 'available' &&
                canEditProperty(snapshot, (record as Site).property_id, true) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      setEditor({ type: 'stay', property: (record as Site).property_id, site: record.id })
                    }
                  >
                    Assign customer
                  </button>
                )}
            </>
          ) : editor.entity === 'customer' ? (
            <>
              <p>
                {(record as Customer).email || 'No email'} · {(record as Customer).phone || 'No phone'}
              </p>
              <p>{(record as Customer).mailing_address || 'No mailing address'}</p>
              <p>
                Emergency contact: {(record as Customer).emergency_contact || 'Not provided'}{' '}
                {(record as Customer).emergency_phone}
              </p>
              <p className="muted">{(record as Customer).notes || 'No internal notes.'}</p>
            </>
          ) : (
            <p>
              {[(record as Property).address, (record as Property).city, (record as Property).state]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
        </div>
        {editor.entity === 'customer' && canEditProperty(snapshot, (record as Customer).property_id, true) && (
          <CustomerBillingFile organizationId={snapshot.organizationId}
            propertyId={(record as Customer).property_id} customerId={record.id}
            residentName={customerName(record as Customer)}
            propertyName={snapshot.properties.find(p => p.id === (record as Customer).property_id)?.name ?? 'Property office'} />
        )}
        <h3>Occupancy history</h3>
        <StayHistory stays={history} snapshot={snapshot} />
        {(editor.entity === 'site' || editor.entity === 'customer') &&
          canEditProperty(snapshot, (record as Site | Customer).property_id) && (
            <SiteMeterFile
              organizationId={snapshot.organizationId}
              propertyId={(record as Site | Customer).property_id}
              {...(editor.entity === 'site' ? { siteId: record.id } : { customerId: record.id })}
              customers={snapshot.customers.filter((c) => c.property_id === (record as Site | Customer).property_id)}
              {...(editor.entity === 'site' ? {
                site: record as Site,
                currentStayId: history.find(stay => isCurrentStay(stay, dateAtProperty(
                  snapshot.properties.find(p => p.id === (record as Site).property_id)?.timezone ?? 'America/Los_Angeles'
                )))?.id,
              } : {})}
            />
          )}
        {(editor.entity === 'site' || editor.entity === 'customer') && (
          <PlanningHistory
            snapshot={snapshot}
            {...(editor.entity === 'customer' ? { customerId: record.id } : { siteId: record.id })}
          />
        )}
        <p className="future-caption">
          Use Maintenance for repair requests linked to a property, site or customer. General document
          attachments are planned.
        </p>
      </Modal>
    );
  }
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Link href={href('overview')} className="brand">
          <span className="brand-mark">
            <Flame size={24} />
          </span>
          <span>
            Forge<span className="brand-os">OS</span>
            <small>PROPERTY MANAGER</small>
          </span>
        </Link>
        <div className="sidebar-workspace">
          <span className="workspace-avatar">{org?.name.slice(0, 1) ?? 'F'}</span>
          <div>
            <strong>{org?.name ?? 'Your workspace'}</strong>
            <small>Property operations</small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <span className="nav-label">Workspace</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Link
              href={href(id)}
              key={id}
              aria-current={section === id ? 'page' : undefined}
              className={`nav-link ${section === id ? 'active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {section === id && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="nav-link" href="/portal">
            <Users size={19} />
            Resident portal
          </Link>
          <Link
            className={`nav-link ${section === 'access' ? 'active' : ''}`}
            href={href('access')}
            aria-current={section === 'access' ? 'page' : undefined}
          >
            <ShieldCheck size={19} />
            Team & access
          </Link>
          <div className="release-badge">
            <span className="status-dot" />
            <div>
              Commercial readiness<small>Milestone 7 of 7</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            {snapshot.organizations.length > 1 && (
              <select
                aria-label="Organization"
                value={snapshot.organizationId}
                onChange={(e) => startTransition(() => router.push(`/?organization=${e.target.value}`))}
              >
                {snapshot.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <ThemeButton />
            <span className="topbar-divider" />
            <button type="button" className="icon-button" aria-label="Sign out" onClick={signout}>
              <LogOut size={18} />
            </button>
            <span className="user-avatar" title={snapshot.email}>
              {snapshot.email.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main" className="workspace-main" aria-busy={isPending}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{chosenProperty?.name ?? org?.name ?? 'Welcome to ForgeOS'}</span>
              <h1>{section === 'overview' ? 'Operations overview' : title}</h1>
              <p>
                {section === 'overview'
                  ? 'Your properties, people, and the details that matter.'
                  : section === 'sites'
                    ? 'Every space, with a clear status and a complete record.'
                    : section === 'customers'
                      ? 'A lasting record for every customer and tenant.'
                    : section === 'paperless'
                      ? 'Capture photos and scan paperwork directly into authorized customer and space files.'
                      : section === 'occupancy'
                        ? 'Track who is here. Preserve every stay.'
                        : section === 'map'
                          ? 'A practical view of your property, site by site.'
                          : section === 'reservations'
                            ? 'Know what is booked. Keep every arrival organized.'
                            : section === 'leases'
                              ? 'Clear agreement terms and a lasting renewal history.'
                              : section === 'access'
                                ? 'Clear roles. The right access for every person.'
                                : 'One place for all of your locations.'}
              </p>
            </div>
            <fieldset className="page-actions" disabled={isPending}>
              {section === 'properties' && manageOrg && (
                <button className="button primary" onClick={() => setEditor({ type: 'property' })}>
                  <Plus size={17} />
                  Add property
                </button>
              )}
              {section === 'sites' && (
                <>
                  <button className="button secondary" onClick={exportSites} disabled={!visibleSites.length}>
                    <Download size={16} />
                    Export CSV
                  </button>
                  {!!editableProperties.length && (
                    <button className="button primary" onClick={() => setEditor({ type: 'site' })}>
                      <Plus size={17} />
                      Add site / unit
                    </button>
                  )}
                </>
              )}
              {section === 'customers' && !!customerProperties.length && (
                <button className="button primary" onClick={() => setEditor({ type: 'customer' })}>
                  <Plus size={17} />
                  Add customer
                </button>
              )}
              {section === 'occupancy' && customerProperties.length === 1 && (
                <button
                  className="button primary"
                  onClick={() => setEditor({ type: 'stay', property: customerProperties[0].id })}
                >
                  <Plus size={17} />
                  Assign customer
                </button>
              )}
              {section === 'access' && isOwner(snapshot) && properties.length > 0 && (
                <button className="button primary" onClick={() => setEditor({ type: 'access' })}>
                  <Plus size={17} />
                  Grant property access
                </button>
              )}
            </fieldset>
          </div>
          {snapshot.organizationId && (
            <div className="scope-bar">
              <div>
                <span className="scope-icon">
                  <Building2 size={18} />
                </span>
                <label htmlFor="property-select">Property view</label>
                <select
                  id="property-select"
                  value={propertyId}
                  onChange={(e) => startTransition(() => router.push(href(section, e.target.value)))}
                >
                  <option value="">All authorized properties</option>
                  {snapshot.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.archived_at ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <span className="scope-tag">
                <ShieldCheck size={14} />
                Private workspace
              </span>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <CheckCircle2 size={18} />
              {notice}
              <button className="text-button" onClick={() => setNotice('')}>
                Dismiss
              </button>
            </div>
          )}
          {!snapshot.organizationId ? (
            <section className="panel onboarding-panel">
              <div className="empty-icon">
                <Building2 size={28} />
              </div>
              <span className="eyebrow">Make it your own</span>
              <h2>Create your organization</h2>
              <p>
                Start with your business name. You’ll be its owner and can add properties and grant staff
                access.
              </p>
              <RecordForm
                fields={[{ name: 'name', label: 'Organization name', required: true }]}
                submit="Create organization"
                onSave={async (values) => {
                  const result = await mutate({ entity: 'organization', action: 'create', values });
                  router.push(`/?organization=${result.data}`);
                  router.refresh();
                }}
              />
            </section>
          ) : !operatingAccess &&
            !['properties', 'access', 'meters', 'maintenance', 'inventory', 'operations'].includes(
              section
            ) ? (
            <section className="panel">
              <Empty title="Your role has limited access">
                Your assigned properties appear in the property directory. Operational, customer, and
                financial records require a manager or office role.
              </Empty>
            </section>
          ) : section === 'reports' ? (
            <ReportsWorkspace snapshot={snapshot} propertyId={propertyId} />
          ) : section === 'commercial' || section === 'communications' ? (
            <CommercialWorkspace snapshot={snapshot} propertyId={propertyId} section={section} />
          ) : section === 'overview' ? (
            <>
              <OperationsMetrics snapshot={snapshot} propertyId={propertyId} />
              <Overview
                snapshot={snapshot}
                properties={properties}
                sites={sites}
                href={href}
                addProperty={manageOrg ? () => setEditor({ type: 'property' }) : undefined}
                viewSite={(id) => setEditor({ type: 'detail', entity: 'site', id })}
                overdueSites={arrears}
                financialStatus={financialVisibility}
              />
            </>
          ) : section === 'paperless' ? (
            <PaperlessWorkspace snapshot={snapshot} propertyId={propertyId} />
          ) : section === 'meters' ? (
            <MeterWorkspace snapshot={snapshot} propertyId={propertyId} navigationPending={isPending} />
          ) : ['maintenance', 'inventory', 'operations'].includes(section) ? (
            <OperationsWorkspace
              snapshot={snapshot}
              propertyId={propertyId}
              section={section}
              navigationPending={isPending}
            />
          ) : section === 'collections' ? (
            <CollectionsWorkspace snapshot={snapshot} propertyId={propertyId} navigationPending={isPending} />
          ) : section === 'billing' ? (
            <BillingWorkspace snapshot={snapshot} propertyId={propertyId} navigationPending={isPending} focus={billingFocus} />
          ) : section === 'reservations' || section === 'leases' ? (
            <PlanningWorkspace
              snapshot={snapshot}
              propertyId={propertyId}
              section={section}
              navigationPending={isPending}
            />
          ) : section === 'properties' ? (
            <section className="panel">
              {tools('Search properties')}
              <div className="property-cards">
                {properties
                  .filter((p) => (showArchived || !p.archived_at) && match(`${p.name} ${p.city} ${p.state}`))
                  .map((property) => (
                    <article className="property-card" key={property.id}>
                      <div className="property-card-top">
                        <span className="property-icon">
                          <Building2 size={27} />
                        </span>
                        <Badge status={property.archived_at ? 'archived' : property.operating_status} />
                      </div>
                      <h2>
                        <button
                          className="title-button"
                          onClick={() => setEditor({ type: 'detail', entity: 'property', id: property.id })}
                        >
                          {property.name}
                        </button>
                      </h2>
                      <p>
                        {[property.city, property.state].filter(Boolean).join(', ') || 'Location not added'}
                      </p>
                      <div className="property-card-stats">
                        <span>
                          <strong>
                            {sites.filter((s) => s.property_id === property.id && !s.archived_at).length}
                          </strong>{' '}
                          sites / units
                        </span>
                        <span>{property.category.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="card-footer">
                        <Link className="text-button" href={href('sites', property.id)}>
                          Open property <ArrowUpRight size={15} />
                        </Link>
                        {actions('property', property, canEditProperty(snapshot, property.id))}
                      </div>
                    </article>
                  ))}
              </div>
              {!properties.filter((p) => showArchived || !p.archived_at).length && (
                <Empty title="Your first property belongs here">
                  Add a location to begin managing sites and customers.
                </Empty>
              )}
            </section>
          ) : section === 'sites' ? (
            <section className="panel">
              {tools('Search site number, type, or section')}
              <div className="filter-row">
                <label>
                  Status
                  <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="all">All statuses</option>
                    {[
                      'available',
                      'reserved',
                      'occupied',
                      'out_of_service',
                      'blocked',
                      'in_preparation',
                      'archived',
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Section
                  <select
                    aria-label="Section"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                  >
                    <option value="">All sections</option>
                    {[...new Set(sites.map((s) => s.section).filter(Boolean))].sort().map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <span>{visibleSites.length} records</span>
              </div>
              {visibleSites.length ? (
                <div className="table-wrap" role="region" aria-label="Site directory records" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Site / unit</th>
                        <th>Property</th>
                        <th>Type & section</th>
                        <th>Status</th>
                        <th>Monthly rate</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSites.map((site) => (
                        <tr key={site.id}>
                          <td>
                            <button
                              className="title-button"
                              onClick={() => setEditor({ type: 'detail', entity: 'site', id: site.id })}
                            >
                              {site.label}
                            </button>
                            <small>
                              {site.kind === 'apartment'
                                ? `${site.bedrooms ?? '—'} bed · ${site.bathrooms ?? '—'} bath`
                                : `${site.max_rv_length_ft ?? '—'} ft max · ${site.amperage ?? '—'} amp`}
                            </small>
                          </td>
                          <td>{snapshot.properties.find((p) => p.id === site.property_id)?.name}</td>
                          <td className="capitalize">
                            {site.kind}
                            <small>{site.section || 'No section'}</small>
                          </td>
                          <td>
                            <Badge status={stamp(site)} />
                          </td>
                          <td>
                            <strong>{money(site.monthly_rate_cents)}</strong>
                          </td>
                          <td>{actions('site', site, canEditProperty(snapshot, site.property_id))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={sites.length ? 'No sites match these filters' : 'Add your first site or unit'}>
                  Your directory supports RV sites, apartments, cabins, and more.
                </Empty>
              )}
            </section>
          ) : section === 'customers' ? (
            <section className="panel">
              {tools('Search customer name, email, or phone')}
              {visibleCustomers.length ? (
                <div className="table-wrap" role="region" aria-label="Customer records" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Contact</th>
                        <th>Property</th>
                        <th>Current site</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCustomers.map((customer) => {
                        const stay = stays.find(
                          (s) =>
                            s.customer_id === customer.id &&
                            isCurrentStay(
                              s,
                              dateAtProperty(
                                snapshot.properties.find((p) => p.id === s.property_id)?.timezone ??
                                  'America/Los_Angeles'
                              )
                            )
                        );
                        return (
                          <tr key={customer.id}>
                            <td>
                              <button
                                className="title-button"
                                onClick={() =>
                                  setEditor({ type: 'detail', entity: 'customer', id: customer.id })
                                }
                              >
                                {customerName(customer)}
                              </button>
                              <small>{customer.preferred_name}</small>
                            </td>
                            <td>
                              {customer.email || 'No email'}
                              <small>{customer.phone || 'No phone'}</small>
                            </td>
                            <td>{snapshot.properties.find((p) => p.id === customer.property_id)?.name}</td>
                            <td>{stay ? snapshot.sites.find((s) => s.id === stay.site_id)?.label : '—'}</td>
                            <td>
                              <Badge
                                status={customer.archived_at ? 'archived' : stay ? 'active' : 'customer'}
                              />
                            </td>
                            <td>
                              {actions(
                                'customer',
                                customer,
                                canEditProperty(snapshot, customer.property_id, true)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No customers found">
                  Add a customer to keep their contact information and stay history together.
                </Empty>
              )}
            </section>
          ) : section === 'occupancy' ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Current and completed stays</span>
                  <h2>Occupancy register</h2>
                </div>
                <span className="count-pill">{stays.length} records</span>
              </div>
              {customerProperties.length > 1 && (
                <div className="assign-property">
                  {customerProperties.map((p) => (
                    <button
                      key={p.id}
                      className="button secondary"
                      onClick={() => setEditor({ type: 'stay', property: p.id })}
                    >
                      <Plus size={15} />
                      Move in · {p.name}
                    </button>
                  ))}
                </div>
              )}
              <StayHistory
                stays={stays}
                snapshot={snapshot}
                onMoveout={(id) => {
                  const stay = snapshot.stays.find((s) => s.id === id);
                  if (stay && canEditProperty(snapshot, stay.property_id, true))
                    setEditor({ type: 'moveout', id });
                }}
                onPlan={(id) => setEditor({ type: 'plan', id })}
                onTransfer={(id) => setEditor({ type: 'transfer', id })}
              />
            </section>
          ) : section === 'map' ? (
            <>
              {properties
                .filter((p) => !p.archived_at)
                .map((p) => (
                  <section className="panel" key={p.id}>
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">Property layout</span>
                        <h2>{p.name}</h2>
                      </div>
                      <Link className="text-button" href={href('sites', p.id)}>
                        Site directory <ArrowUpRight size={16} />
                      </Link>
                    </div>
                    <div className="panel-content">
                      <SiteMap
                        sites={sites.filter((s) => s.property_id === p.id && !s.archived_at)}
                        snapshot={snapshot}
                        onSelect={(id) => setEditor({ type: 'detail', entity: 'site', id })}
                        overdueSites={arrears}
                        financialStatus={financialVisibility}
                      />
                    </div>
                  </section>
                ))}
              {!properties.length && (
                <section className="panel">
                  <Empty title="Add a property to start your layout" />
                </section>
              )}
            </>
          ) : (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Your account</span>
                    <h2>Identity & permissions</h2>
                  </div>
                  <ShieldCheck size={23} />
                </div>
                <div className="panel-content">
                  <p>{snapshot.email}</p>
                  <p>
                    Your user ID: <code className="user-id">{snapshot.userId}</code>
                  </p>
                  <p className="muted">
                    Share this ID with your organization’s owner to receive a property role. Creating an
                    account never grants access to another organization.
                  </p>
                  <div className="role-grid">
                    <article>
                      <h3>Owners & administrators</h3>
                      <p>Organization-wide property operations. Owners grant or revoke property access.</p>
                    </article>
                    <article>
                      <h3>Property managers</h3>
                      <p>Manage sites, customers, and occupancy at assigned properties.</p>
                    </article>
                    <article>
                      <h3>Office staff</h3>
                      <p>Manage customers and stays at assigned properties. Site rates remain protected.</p>
                    </article>
                    <article>
                      <h3>Maintenance & meter staff</h3>
                      <p>
                        Assigned property directory only. Their field workflows arrive in later milestones.
                      </p>
                    </article>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Property assignments</h2>
                </div>
                {snapshot.propertyMemberships.length ? (
                  <div className="table-wrap" role="region" aria-label="Property access records" tabIndex={0}>
                    <table>
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th>Property</th>
                          <th>Role</th>
                          {isOwner(snapshot) && <th>Access</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.propertyMemberships
                          .filter((m) => !propertyId || m.property_id === propertyId)
                          .map((m) => (
                            <tr key={`${m.user_id}:${m.property_id}`}>
                              <td>
                                <code>{m.user_id}</code>
                              </td>
                              <td>{snapshot.properties.find((p) => p.id === m.property_id)?.name}</td>
                              <td className="capitalize">{m.role.replaceAll('_', ' ')}</td>
                              {isOwner(snapshot) && (
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => setEditor({ type: 'revoke', membership: m })}
                                  >
                                    Revoke
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="No property-specific assignments">
                    Owners and administrators already have organization-wide access.
                  </Empty>
                )}
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span>ForgeOS Property Manager</span>
            <span>One System. Every Site. Total Control.</span>
          </footer>
        </main>
      </div>
      {editorContent()}
    </div>
  );
}
