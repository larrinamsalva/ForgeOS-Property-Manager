'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, RefreshCw } from 'lucide-react';
import { cents } from '@/lib/billing-domain';
import type { PortalAccount, PortalSnapshot, PortalInvoiceDocument } from '@/lib/commercial-domain';
import { Modal } from './modal';
import { RecordForm, type Field } from './record-form';
import { ThemeButton } from './theme-button';
import { PortalInvoiceContent } from './portal-document';
const reason: Field = {
  name: 'reason',
  label: 'Reason / supporting record',
  type: 'textarea',
  required: true,
};
type Editor = { kind: 'maintenance' | 'contact' | 'preferences' | 'cancel'; id?: string; requestId: string };
export function ResidentPortal({
  userId,
  accounts,
  initialError,
}: {
  userId: string;
  accounts: PortalAccount[];
  initialError: string;
}) {
  const router = useRouter();
  const [membership, setMembership] = useState(accounts[0]?.id ?? ''),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<PortalSnapshot | null>(null),
    [error, setError] = useState(initialError),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null),
    [invoice, setInvoice] = useState<PortalInvoiceDocument | null>(null);
  useEffect(() => {
    if (!membership) return;
    const c = new AbortController();
    fetch('/api/portal?' + new URLSearchParams({ membership, page: String(page) }), {
      signal: c.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error ?? 'Unable to load this account.');
        setData(d);
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [membership, page, refresh]);
  function reload() {
    setLoading(true);
    setRefresh((v) => v + 1);
  }
  function open(kind: Editor['kind'], id?: string) {
    setEditor({ kind, id, requestId: crypto.randomUUID() });
  }
  async function command(name: string, values: Record<string, unknown>, requestId: string) {
    const r = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: name,
          payload: { ...values, membership_id: membership, request_id: requestId },
        }),
      }),
      d = await r.json();
    if (!r.ok) throw Error(d.error ?? 'Unable to save.');
    setEditor(null);
    setNotice('Your request has been recorded.');
    reload();
  }
  async function viewInvoice(id: string) {
    try {
      const r = await fetch('/api/portal/invoices/' + id, { cache: 'no-store' }),
        d = await r.json();
      if (!r.ok) throw Error(d.error ?? 'Statement unavailable.');
      setInvoice(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Statement unavailable.');
    }
  }
  async function signout() {
    const r = await fetch('/api/auth/signout', { method: 'POST' });
    if (r.ok) {
      router.replace('/login?portal=1');
      router.refresh();
    } else setError('Unable to sign out. Try again.');
  }
  const table = (label: string, head: string[], rows: ReactNode[][]) => (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={head.length}>No records on this history page.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  const contactFields: Field[] = [
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone' },
    { name: 'mailing_address', label: 'Mailing address', type: 'textarea' },
    { name: 'emergency_contact', label: 'Emergency contact' },
    { name: 'emergency_phone', label: 'Emergency phone' },
    reason,
  ];
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <Link href="/portal" className="brand">
          <Flame aria-hidden="true" />
          <span>
            Forge<span className="portal-os">OS</span>
          </span>
          <small>Resident portal</small>
        </Link>
        <div className="row-actions">
          <ThemeButton />
          <Link className="button secondary" href="/">
            Staff workspace
          </Link>
          <button className="button secondary" onClick={signout}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main-content" className="commercial-stack">
        <div className="commercial-heading">
          <div>
            <span className="eyebrow">Your property account</span>
            <h1>Welcome home</h1>
          </div>
          <button
            className="button secondary"
            onClick={() => (accounts.length ? reload() : router.refresh())}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Reload account
          </button>
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="alert" role="status">
            {notice}
          </p>
        )}
        {!accounts.length ? (
          <section className="panel commercial-panel">
            <h2>Ask the office to link your account</h2>
            <p>
              Registering does not automatically grant property access. Give this account ID to your property
              owner through your usual verified contact method.
            </p>
            <label htmlFor="resident-account-id">Your registered account ID</label>
            <input id="resident-account-id" readOnly value={userId} />
            <p className="muted">
              The owner must match your identity to the correct customer. Reload after they confirm your
              access.
            </p>
          </section>
        ) : (
          <>
            <div className="field">
              <label htmlFor="portal-account">Property account</label>
              <select
                id="portal-account"
                value={membership}
                onChange={(e) => {
                  setData(null);
                  setMembership(e.target.value);
                  setPage(0);
                  setLoading(true);
                  setEditor(null);
                  setInvoice(null);
                }}
              >
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.property_name} · {a.customer_name}
                  </option>
                ))}
              </select>
            </div>
            {!data ? (
              <p role="status">{error ? 'No account records available.' : 'Loading your account…'}</p>
            ) : (
              <>
                {data.read_only && (
                  <p className="alert">
                    This property or customer account is archived or inactive. History remains available;
                    contact the office for changes.
                  </p>
                )}
                <section className="panel commercial-panel">
                  <div className="commercial-heading">
                    <div>
                      <h2>{data.property.name}</h2>
                      <p>
                        {data.customer.name} · As of {data.as_of} ({data.property.timezone})
                      </p>
                    </div>
                    <div>
                      <span className="muted">Issued invoice balance</span>
                      <p className="statement-total">{cents(data.outstanding_cents)}</p>
                    </div>
                  </div>
                  <p>
                    {[
                      data.property.address,
                      data.property.city,
                      data.property.state,
                      data.property.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p>
                    Office: {data.property.phone || 'Phone not recorded'} ·{' '}
                    {data.property.email || 'Email not recorded'}
                  </p>
                  <p className="muted">
                    Online payments are disabled. Use the payment arrangements confirmed by your office.
                  </p>
                  <h3>Current stays & rent</h3>
                  {data.current_stays.length ? (
                    data.current_stays.map((s) => (
                      <p key={s.id}>
                        <strong>{s.site_label}</strong> · From {s.starts_on} · Planned departure{' '}
                        {s.planned_ends_on ?? 'Open-ended'} · {cents(s.rate_cents)} / {s.billing_period}
                      </p>
                    ))
                  ) : (
                    <p>No current actual stay recorded.</p>
                  )}
                </section>
                <section className="panel commercial-panel">
                  <h2>Issued invoices & utility statements</h2>
                  {table(
                    'Issued invoices',
                    ['Invoice', 'Period', 'Due', 'Current outstanding', 'Documents'],
                    data.invoices.map((i) => [
                      i.number,
                      `${i.starts_on} to ${i.ends_on}`,
                      i.due_on,
                      cents(i.account.outstanding_cents),
                      <div className="row-actions" key={i.id}>
                        <button className="text-button" onClick={() => viewInvoice(i.id)}>
                          View {i.number}
                        </button>
                        <a className="text-button" href={`/api/portal/invoices/${i.id}?format=pdf`}>
                          PDF
                        </a>
                        <a className="text-button" href={`/portal/invoices/${i.id}`}>
                          Printable statement
                        </a>
                      </div>,
                    ])
                  )}
                </section>
                <section className="panel commercial-panel">
                  <h2>Receipts</h2>
                  {table(
                    'Your receipts',
                    ['Receipt', 'Kind', 'Date', 'Amount', 'Documents'],
                    data.receipts.map((r) => [
                      r.number,
                      r.kind.replaceAll('_', ' '),
                      r.effective_on,
                      cents(r.amount_cents),
                      <div className="row-actions" key={r.id}>
                        <a className="text-button" href={`/api/portal/receipts/${r.id}`}>
                          Receipt PDF
                        </a>
                        <Link className="text-button" href={`/portal/receipts/${r.id}`}>
                          Printable receipt
                        </Link>
                      </div>,
                    ])
                  )}
                </section>
                <section className="panel commercial-panel">
                  <h2>Leases & reservations</h2>
                  <p className="muted">
                    Recorded terms and document references. Contact the office for signed documents.
                  </p>
                  {table(
                    'Your lease terms',
                    ['Site', 'Period', 'Rent', 'Deposit required', 'Document reference', 'Status'],
                    data.leases.map((l) => [
                      l.site_label,
                      `${l.starts_on} to ${l.ends_on}`,
                      `${cents(l.agreed_rate_cents)} / ${l.billing_period}`,
                      cents(l.deposit_required_cents),
                      l.document_reference || 'Not recorded',
                      l.status,
                    ])
                  )}
                  {table(
                    'Your reservations',
                    ['Confirmation', 'Site', 'Dates', 'Rate', 'Status'],
                    data.reservations.map((r) => [
                      r.confirmation_code,
                      r.site_label,
                      `${r.starts_on} to ${r.ends_on}`,
                      `${cents(r.agreed_rate_cents)} / ${r.billing_period}`,
                      r.status,
                    ])
                  )}
                </section>
                <section className="panel commercial-panel">
                  <div className="commercial-heading">
                    <h2>Maintenance requests</h2>
                    <button
                      className="button primary"
                      disabled={data.read_only || !data.current_stays.length}
                      onClick={() => open('maintenance')}
                    >
                      Request maintenance
                    </button>
                  </div>
                  <p className="muted">
                    For urgent safety concerns, contact your office directly. This form is reviewed during
                    office operations.
                  </p>
                  {data.requests.length ? (
                    data.requests.map((r) => (
                      <article className="commercial-card" key={r.id}>
                        <h3>
                          {r.number} · {r.title}
                        </h3>
                        <p className="preserve-lines">{r.description}</p>
                        <p>
                          {r.site_label || 'Common area'} · {r.category} · {r.priority} ·{' '}
                          {r.status.replaceAll('_', ' ')} · Requested {r.requested_on}
                          {r.completed_on ? ` · Completed ${r.completed_on}` : ''}
                          {r.closed_on ? ` · Closed ${r.closed_on}` : ''}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p>No maintenance requests on this history page.</p>
                  )}
                </section>
                <section className="panel commercial-panel">
                  <h2>Messages from your property</h2>
                  {data.messages.length ? (
                    data.messages.map((m) => (
                      <article className="commercial-card" key={m.id} lang={m.language}>
                        <h3>{m.title}</h3>
                        <p className="preserve-lines">{m.body}</p>
                        <p className="muted small">
                          {m.published_at} · {m.category} · {m.language === 'es' ? 'Español' : 'English'}
                        </p>
                        {m.read_at ? (
                          <p className="small">Read {m.read_at}</p>
                        ) : (
                          <button
                            disabled={data.read_only}
                            className="button secondary"
                            onClick={() =>
                              command(
                                'read_message',
                                { id: m.id, reason: 'Resident marked message read' },
                                crypto.randomUUID()
                              ).catch((e) => setError(e.message))
                            }
                          >
                            Mark read
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <p>No published messages on this history page.</p>
                  )}
                </section>
                <section className="panel commercial-panel">
                  <div className="commercial-heading">
                    <h2>Contact information</h2>
                    <button
                      className="button secondary"
                      disabled={data.read_only || data.contacts.some((c) => c.status === 'pending')}
                      onClick={() => open('contact')}
                    >
                      Propose contact update
                    </button>
                  </div>
                  <p>
                    {data.customer.email || 'Email not recorded'} ·{' '}
                    {data.customer.phone || 'Phone not recorded'}
                  </p>
                  <p className="preserve-lines">{data.customer.mailing_address}</p>
                  <p>
                    Emergency contact: {data.customer.emergency_contact || 'Not recorded'} ·{' '}
                    {data.customer.emergency_phone}
                  </p>
                  <p className="muted">
                    The office reviews proposed changes before updating your customer record.
                  </p>
                  {data.contacts.map((c) => (
                    <article className="commercial-card" key={c.id}>
                      <h3>Contact proposal · {c.status}</h3>
                      {Object.entries(c.proposed).map(([k, v]) => (
                        <p key={k}>
                          {k.replaceAll('_', ' ')}: {v || '(clear)'}
                        </p>
                      ))}
                      <p>{c.decision_reason}</p>
                      {c.status === 'pending' && (
                        <button
                          className="text-button"
                          disabled={data.read_only}
                          onClick={() => open('cancel', c.id)}
                        >
                          Cancel proposal
                        </button>
                      )}
                    </article>
                  ))}
                </section>
                <section className="panel commercial-panel">
                  <div className="commercial-heading">
                    <h2>Communication preferences</h2>
                    <button
                      className="button secondary"
                      disabled={data.read_only}
                      onClick={() => open('preferences')}
                    >
                      Edit preferences
                    </button>
                  </div>
                  <p>
                    {data.preferences.language === 'es' ? 'Español' : 'English'} · In-app{' '}
                    {data.preferences.in_app ? 'enabled' : 'disabled'}
                  </p>
                  <p className="muted">
                    Email and SMS choices are consent records only. External delivery is disabled. Existing
                    published messages remain available.
                  </p>
                </section>
                <nav className="pagination" aria-label="Account history pages">
                  <button
                    className="button secondary"
                    disabled={page === 0 || loading}
                    onClick={() => {
                      setPage((v) => v - 1);
                      setLoading(true);
                    }}
                  >
                    Previous history
                  </button>
                  <span>History page {page + 1} · Up to 50 records per section</span>
                  <button
                    className="button secondary"
                    disabled={loading || !Object.values(data.has_more).some(Boolean)}
                    onClick={() => {
                      setPage((v) => v + 1);
                      setLoading(true);
                    }}
                  >
                    Older history
                  </button>
                </nav>
              </>
            )}
          </>
        )}
      </main>
      {invoice && (
        <Modal title={`Invoice ${invoice.invoice.number}`} onClose={() => setInvoice(null)}>
          <div className="row-actions">
            <a className="button secondary" href={`/api/portal/invoices/${invoice.invoice.id}?format=pdf`}>
              Download PDF
            </a>
            <a className="button secondary" href={`/portal/invoices/${invoice.invoice.id}`}>
              Printable statement
            </a>
          </div>
          <PortalInvoiceContent document={invoice} />
        </Modal>
      )}
      {editor && data && (
        <Modal
          title={
            editor.kind === 'maintenance'
              ? 'Request maintenance'
              : editor.kind === 'contact'
                ? 'Propose contact update'
                : editor.kind === 'cancel'
                  ? 'Cancel contact proposal'
                  : 'Communication preferences'
          }
          onClose={() => setEditor(null)}
        >
          {editor.kind === 'maintenance' ? (
            <RecordForm
              fields={[
                {
                  name: 'stay_id',
                  label: 'Current stay',
                  type: 'select',
                  required: true,
                  options: data.current_stays.map((s) => ({ value: s.id, label: s.site_label })),
                },
                {
                  name: 'location',
                  label: 'Request location',
                  type: 'select',
                  required: true,
                  default: 'site',
                  options: [
                    { value: 'site', label: 'My site / unit' },
                    { value: 'common', label: 'Common area' },
                  ],
                },
                { name: 'title', label: 'Request title', required: true },
                { name: 'description', label: 'Describe the issue', type: 'textarea', required: true },
                { name: 'category', label: 'Category', default: 'general' },
                {
                  name: 'priority',
                  label: 'Priority',
                  type: 'select',
                  required: true,
                  default: 'normal',
                  options: ['low', 'normal', 'high'].map((v) => ({ value: v, label: v })),
                },
                reason,
              ]}
              initial={{ stay_id: data.current_stays[0]?.id ?? '' }}
              submit="Submit maintenance request"
              onCancel={() => setEditor(null)}
              onSave={(v) => command('new_maintenance', v, editor.requestId)}
            />
          ) : editor.kind === 'contact' ? (
            <RecordForm
              fields={contactFields}
              initial={{ ...data.customer }}
              submit="Submit proposal"
              onCancel={() => setEditor(null)}
              onSave={(v) => {
                const { reason, ...proposed } = v;
                return command('request_contact', { reason, proposed }, editor.requestId);
              }}
            />
          ) : editor.kind === 'cancel' ? (
            <RecordForm
              fields={[reason]}
              submit="Confirm cancellation"
              onCancel={() => setEditor(null)}
              onSave={(v) =>
                command(
                  'cancel_contact',
                  { ...v, id: editor.id, version: data.contacts.find((c) => c.id === editor.id)!.version },
                  editor.requestId
                )
              }
            />
          ) : (
            <RecordForm
              fields={[
                {
                  name: 'language',
                  label: 'Preferred language',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'en', label: 'English' },
                    { value: 'es', label: 'Español' },
                  ],
                },
                { name: 'in_app', label: 'Receive in-app messages', type: 'checkbox' },
                { name: 'email_opt_in', label: 'Email consent (delivery disabled)', type: 'checkbox' },
                { name: 'sms_opt_in', label: 'SMS consent (delivery disabled)', type: 'checkbox' },
                reason,
              ]}
              initial={{ ...data.preferences }}
              onCancel={() => setEditor(null)}
              onSave={(v) =>
                command('set_preferences', { ...v, version: data.preferences.version }, editor.requestId)
              }
            />
          )}
        </Modal>
      )}
    </div>
  );
}
