'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Download, Plus, RefreshCw } from 'lucide-react';
import type { Snapshot } from '@/lib/domain';
import { canEditProperty, customerName, dateAtProperty, isOwner, isCurrentStay } from '@/lib/domain';
import {
  messageCategories,
  renderMessage,
  type CommercialSnapshot,
  type Communication,
  type MessageTemplate,
  type PortalMembership,
} from '@/lib/commercial-domain';
import { subscriptionReadiness } from '@/lib/subscription-domain';
import { Modal } from './modal';
import { RecordForm, type Field } from './record-form';
import { Empty } from './workspace-parts';
const reason: Field = {
  name: 'reason',
  label: 'Reason / supporting record',
  type: 'textarea',
  required: true,
};
const language: Field = {
  name: 'language',
  label: 'Message language',
  type: 'select',
  options: [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
  ],
  default: 'en',
};
const category: Field = {
  name: 'category',
  label: 'Message category',
  type: 'select',
  options: messageCategories.map((v) => ({ value: v, label: v })),
  default: 'general',
};
type Editor = { kind: string; id?: string; requestId: string };
export async function commercialMutation(command: string, payload: Record<string, unknown>) {
  const r = await fetch('/api/commercial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload }),
    }),
    data = await r.json();
  if (!r.ok) throw new Error(data.error ?? 'The record could not be saved.');
  return data;
}
export function CommercialWorkspace({
  snapshot,
  propertyId,
  section,
}: {
  snapshot: Snapshot;
  propertyId: string;
  section: 'communications' | 'commercial';
}) {
  const properties = snapshot.properties.filter((p) => canEditProperty(snapshot, p.id, true));
  const [property, setProperty] = useState(
      properties.some((p) => p.id === propertyId) ? propertyId : (properties[0]?.id ?? '')
    ),
    [data, setData] = useState<CommercialSnapshot | null>(null),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null);
  const p = snapshot.properties.find((p) => p.id === property),
    owner = isOwner(snapshot),
    manager = canEditProperty(snapshot, property),
    active = !!p && !p.archived_at && p.operating_status === 'active',
    customers = snapshot.customers.filter((c) => c.property_id === property),
    today = dateAtProperty(p?.timezone ?? 'America/Los_Angeles');
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/commercial?organization=' + snapshot.organizationId, { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [snapshot.organizationId, refresh]);
  function open(kind: string, id?: string) {
    setEditor({ kind, id, requestId: crypto.randomUUID() });
  }
  const close = () => setEditor(null);
  function saved() {
    close();
    setNotice('Saved. The retained history has been refreshed.');
    setError('');
    setLoading(true);
    setRefresh((v) => v + 1);
  }
  async function save(command: string, values: Record<string, unknown>) {
    await commercialMutation(command, {
      organization_id: snapshot.organizationId,
      property_id: property,
      request_id: editor?.requestId ?? crypto.randomUUID(),
      ...values,
    });
    saved();
  }
  async function exportAccount(values: Record<string, unknown>) {
    const r = await fetch('/api/commercial/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: snapshot.organizationId, reason: values.reason }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement('a');
    a.href = url;
    a.download = 'ForgeOS-account-' + snapshot.organizationId + '.json';
    a.click();
    URL.revokeObjectURL(url);
    saved();
  }
  function editorContent() {
    if (!editor || !data) return null;
    const t = data.templates.find((t) => t.id === editor.id),
      m = data.memberships.find((m) => m.id === editor.id),
      msg = data.messages.find((m) => m.id === editor.id),
      contact = data.contacts.find((c) => c.id === editor.id);
    if (editor.kind === 'prepare')
      return (
        <Modal title="Prepare resident message" onClose={close}>
          <MessageComposer
            snapshot={snapshot}
            propertyId={property}
            templates={data.templates.filter((t) => t.property_id === property && !t.archived)}
            onCancel={close}
            onSave={(v) => save('prepare_message', v)}
          />
        </Modal>
      );
    if (editor.kind === 'template')
      return (
        <Modal title={t ? 'Edit message template' : 'Add message template'} onClose={close}>
          <p className="muted">
            Plain text. Placeholders: {'{{customer_name}}'}, {'{{property_name}}'}, {'{{site_label}}'},{' '}
            {'{{today}}'}.
          </p>
          <RecordForm
            fields={[
              { name: 'name', label: 'Template name', required: true },
              language,
              category,
              { name: 'title', label: 'Message title', required: true },
              { name: 'body', label: 'Message body', type: 'textarea', required: true },
              { name: 'archived', label: 'Archive template', type: 'checkbox' },
              reason,
            ]}
            initial={t ? { ...t } : {}}
            onCancel={close}
            onSave={(v) => save('save_template', { ...v, id: t?.id ?? null, version: t?.version ?? null })}
          />
        </Modal>
      );
    if (editor.kind === 'access')
      return (
        <Modal title={m ? 'Edit resident access' : 'Link resident account'} onClose={close}>
          <p className="muted">
            Verify the person and customer through your established process. Use the ID shown in their
            signed-in resident portal. Every linked person can see this customer account’s entire retained
            history and shares its communication preferences.
          </p>
          <RecordForm
            fields={[
              {
                name: 'customer_id',
                label: 'Resident customer account',
                type: 'select',
                required: true,
                options: customers
                  .filter((c) => m || !c.archived_at)
                  .map((c) => ({ value: c.id, label: customerName(c) })),
              },
              { name: 'user_id', label: 'Registered resident account ID', required: true },
              { name: 'starts_on', label: 'Access starts', type: 'date', required: true, default: today },
              { name: 'expires_on', label: 'Access expires (inclusive)', type: 'date' },
              { name: 'active', label: 'Access active', type: 'checkbox', default: true },
              reason,
            ]}
            initial={m ? { ...m, expires_on: m.expires_on ?? '' } : {}}
            locked={m ? ['customer_id', 'user_id'] : []}
            onCancel={close}
            onSave={(v) =>
              save('set_portal_access', {
                ...v,
                id: m?.id ?? null,
                version: m?.version ?? null,
                expires_on: v.expires_on || null,
              })
            }
          />
        </Modal>
      );
    if (editor.kind === 'preferences') {
      const c = customers.find((c) => c.id === editor.id),
        pref = data.preferences.find((x) => x.customer_id === editor.id);
      return (
        <Modal title={'Communication preferences · ' + customerName(c)} onClose={close}>
          <p className="muted">
            Record customer consent and its source. Email/SMS delivery is disabled. Preferences apply to
            everyone linked to this customer account.
          </p>
          <RecordForm
            fields={[
              language,
              { name: 'in_app', label: 'Receive in-app announcements', type: 'checkbox', default: true },
              { name: 'email_opt_in', label: 'Email consent recorded', type: 'checkbox' },
              { name: 'sms_opt_in', label: 'SMS consent recorded', type: 'checkbox' },
              reason,
            ]}
            initial={pref ? { ...pref } : {}}
            onCancel={close}
            onSave={(v) =>
              save('set_preferences', { ...v, customer_id: editor.id, version: pref?.version ?? null })
            }
          />
        </Modal>
      );
    }
    if (editor.kind === 'export')
      return (
        <Modal title="Export organization account" onClose={close}>
          <p className="muted">
            Downloads retained public business records, including private staff notes and access links. Keep
            the file private. Storage bytes and authentication recovery require the separate recovery runbook.
          </p>
          <RecordForm
            fields={[reason]}
            submit="Download account JSON"
            onCancel={close}
            onSave={exportAccount}
          />
        </Modal>
      );
    if (contact && ['approve', 'decline'].includes(editor.kind))
      return (
        <Modal
          title={editor.kind === 'approve' ? 'Approve contact proposal' : 'Decline contact proposal'}
          onClose={close}
        >
          <pre className="record-json">{JSON.stringify(contact.proposed, null, 2)}</pre>
          <p className="muted">
            The decision reason below is shown to the resident. Keep private analysis in authorized staff
            notes.
          </p>
          <RecordForm
            fields={[{ ...reason, label: 'Decision shown to resident' }]}
            submit={editor.kind === 'approve' ? 'Approve proposal' : 'Decline proposal'}
            onCancel={close}
            onSave={(v) =>
              save('decide_contact', {
                ...v,
                id: contact.id,
                version: contact.version,
                status: editor.kind === 'approve' ? 'approved' : 'declined',
              })
            }
          />
        </Modal>
      );
    if (msg && ['publish', 'cancel', 'note'].includes(editor.kind))
      return (
        <Modal
          title={
            editor.kind === 'publish'
              ? 'Publish resident message'
              : editor.kind === 'cancel'
                ? 'Cancel prepared message'
                : 'Add private staff note'
          }
          onClose={close}
        >
          <p>{msg.title}</p>
          {editor.kind === 'publish' && (
            <p className="muted">
              Make prepared copies available in each recipient’s portal. Consent and language are checked
              again. Publication does not establish email/SMS delivery or legally sufficient notice.
            </p>
          )}
          <RecordForm
            fields={[reason]}
            onCancel={close}
            submit={
              editor.kind === 'publish'
                ? 'Publish in portal'
                : editor.kind === 'cancel'
                  ? 'Cancel message'
                  : 'Save staff note'
            }
            onSave={(v) =>
              save(
                editor.kind === 'publish'
                  ? 'publish_message'
                  : editor.kind === 'cancel'
                    ? 'cancel_message'
                    : 'add_message_note',
                { ...v, id: msg.id, ...(editor.kind === 'note' ? {} : { version: msg.version }) }
              )
            }
          />
        </Modal>
      );
    return null;
  }
  if (!properties.length && (!owner || section === 'communications'))
    return (
      <section className="panel">
        <Empty title="Property office access required">
          A manager or office role is required for communications and contact decisions.
        </Empty>
      </section>
    );
  return (
    <div className="commercial-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              {section === 'communications' ? 'Resident communications' : 'Account administration'}
            </span>
            <h2>
              {section === 'communications'
                ? 'Messages with a retained history'
                : 'Portal access & commercial readiness'}
            </h2>
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
            Reload records
          </button>
        </div>
        <div className="field">
          <label htmlFor="commercial-property">Working property</label>
          <select
            id="commercial-property"
            value={property}
            disabled={!!editor}
            onChange={(e) => setProperty(e.target.value)}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived_at ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          {section === 'communications'
            ? 'In-app publication only. Scheduled messages require an explicit Publish action once due. Email, SMS and automatic dispatch are disabled.'
            : 'Resident access is separate from staff roles. The owner links registered accounts; office staff review contact proposals.'}
        </p>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading commercial records…</p>
      ) : (
        data && (
          <>
            {section === 'communications' ? (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Message templates</h2>
                    {manager && active && (
                      <button className="button" onClick={() => open('template')}>
                        <Plus size={16} />
                        Add template
                      </button>
                    )}
                  </div>
                  {data.templates.some((t) => t.property_id === property) ? (
                    <div className="commercial-cards">
                      {data.templates
                        .filter((t) => t.property_id === property)
                        .map((t) => (
                          <article className="commercial-card" key={t.id}>
                            <span className="eyebrow">
                              {t.language} · {t.category}
                              {t.archived ? ' · archived' : ''}
                            </span>
                            <h3>{t.name}</h3>
                            <p>{t.title}</p>
                            <p className="preserve-lines">{t.body}</p>
                            {manager && active && (
                              <button className="text-button" onClick={() => open('template', t.id)}>
                                Edit template
                              </button>
                            )}
                          </article>
                        ))}
                    </div>
                  ) : (
                    <p className="muted">
                      No templates saved. Prepare a custom message or add an English or Spanish template.
                    </p>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Message history</h2>
                    {active && (
                      <button className="button primary" onClick={() => open('prepare')}>
                        <Plus size={16} />
                        Prepare message
                      </button>
                    )}
                  </div>
                  {data.messages.filter((m) => m.property_id === property).length ? (
                    data.messages
                      .filter((m) => m.property_id === property)
                      .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((m) => (
                        <MessageHistory key={m.id} message={m} data={data} active={active} onAction={open} />
                      ))
                  ) : (
                    <Empty title="No resident messages">
                      Choose recipients and prepare a message to start its history.
                    </Empty>
                  )}
                </section>
                <section className="panel">
                  <h2>Customer communication preferences</h2>
                  <div
                    className="table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Customer preferences table"
                  >
                    <table>
                      <thead>
                        <tr>
                          {['Customer', 'Language', 'In-app', 'Consent records', 'Action'].map((h) => (
                            <th scope="col" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map((c) => {
                          const pref = data.preferences.find((p) => p.customer_id === c.id);
                          return (
                            <tr key={c.id}>
                              <td>{customerName(c)}</td>
                              <td>{pref?.language ?? 'en'}</td>
                              <td>{(pref?.in_app ?? true) ? 'Enabled' : 'Opted out'}</td>
                              <td>
                                Email {pref?.email_opt_in ? 'yes' : 'no'} · SMS{' '}
                                {pref?.sms_opt_in ? 'yes' : 'no'} · Delivery disabled
                              </td>
                              <td>
                                {active && (
                                  <button className="text-button" onClick={() => open('preferences', c.id)}>
                                    Edit preferences
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Resident account access</h2>
                    {owner && (
                      <button className="button primary" disabled={!property} onClick={() => open('access')}>
                        <Plus size={16} />
                        Link resident account
                      </button>
                    )}
                  </div>
                  <p className="muted">
                    Residents register at <Link href="/portal">Resident portal</Link>. Verify their registered
                    ID through your established process. Revocation takes effect on the next data request.
                  </p>
                  {owner ? (
                    <AccessTable
                      memberships={data.memberships.filter((m) => m.property_id === property)}
                      snapshot={snapshot}
                      edit={(id) => open('access', id)}
                    />
                  ) : (
                    <p className="muted">Only the organization owner manages resident links.</p>
                  )}
                </section>
                <section className="panel">
                  <h2>Contact change proposals</h2>
                  <p className="muted">
                    Approval updates only submitted contact fields. A proposal is stale if the customer
                    changes before approval.
                  </p>
                  {data.contacts
                    .filter((c) => c.property_id === property)
                    .map((c) => (
                      <article className="commercial-card" key={c.id}>
                        <h3>
                          {customerName(customers.find((x) => x.id === c.customer_id))} · {c.status}
                        </h3>
                        <dl className="detail-grid">
                          {Object.entries(c.proposed).map(([k, v]) => (
                            <div key={k}>
                              <dt>{k.replaceAll('_', ' ')}</dt>
                              <dd>{v || '(clear field)'}</dd>
                            </div>
                          ))}
                        </dl>
                        {c.decision_reason && <p>Decision: {c.decision_reason}</p>}
                        {active && c.status === 'pending' && (
                          <div className="row-actions">
                            <button className="button" onClick={() => open('approve', c.id)}>
                              Approve contact change
                            </button>
                            <button className="button" onClick={() => open('decline', c.id)}>
                              Decline contact change
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  {!data.contacts.some((c) => c.property_id === property) && (
                    <p className="muted">No contact proposals.</p>
                  )}
                </section>
                {owner && (
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Secure account export</h2>
                      <button className="button" onClick={() => open('export')}>
                        <Download size={16} />
                        Export account JSON
                      </button>
                    </div>
                    <p className="muted">
                      One consistent business-data snapshot, a canonical SHA-256 checksum and a private
                      Storage manifest. Storage bytes and authentication recovery are separate. Limits: 20 MB,
                      20,000 rows per table, 100,000 total rows and three exports per hour.
                    </p>
                    <div
                      className="table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label="Account export history table"
                    >
                      <table>
                        <thead>
                          <tr>
                            {['Created', 'State', 'Bytes', 'Retained SHA-256', 'Reason'].map((h) => (
                              <th scope="col" key={h}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.exports
                            .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
                            .map((e) => (
                              <tr key={e.id}>
                                <td>{new Date(e.created_at).toLocaleString()}</td>
                                <td>
                                  {e.status}
                                  {e.failure_code ? ' · ' + e.failure_code : ''}
                                </td>
                                <td>{e.byte_size ?? '—'}</td>
                                <td className="checksum">{e.sha256 ?? '—'}</td>
                                <td>{e.reason}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                <section className="panel">
                  <span className="eyebrow">Commercial activation</span>
                  <h2>Subscription billing is disabled</h2>
                  <p className="muted">{subscriptionReadiness.description}</p>
                  <div className="detail-grid">
                    <div>
                      <strong>ForgeOS subscriptions</strong>
                      <p>No plans or charges activated.</p>
                    </div>
                    <div>
                      <strong>Resident online payments</strong>
                      <p>Disabled. Continue your established payment process.</p>
                    </div>
                    <div>
                      <strong>Launch review</strong>
                      <p>
                        Hosted recovery, access, accessibility, performance and dependency reviews require
                        owner sign-off.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )
      )}
      {editorContent()}
    </div>
  );
}
function AccessTable({
  memberships,
  snapshot,
  edit,
}: {
  memberships: PortalMembership[];
  snapshot: Snapshot;
  edit: (id: string) => void;
}) {
  if (!memberships.length) return <p className="muted">No resident accounts linked at this property.</p>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Resident access table">
      <table>
        <thead>
          <tr>
            {['Customer', 'Registered account ID', 'Access', 'Dates', 'Action'].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {memberships.map((m) => (
            <tr key={m.id}>
              <td>{customerName(snapshot.customers.find((c) => c.id === m.customer_id))}</td>
              <td className="checksum">{m.user_id}</td>
              <td>{m.active ? 'Active flag' : 'Revoked'}</td>
              <td>
                {m.starts_on} → {m.expires_on ?? 'No expiry'}
              </td>
              <td>
                <button className="text-button" onClick={() => edit(m.id)}>
                  Edit resident access
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function MessageHistory({
  message: m,
  data,
  active,
  onAction,
}: {
  message: Communication;
  data: CommercialSnapshot;
  active: boolean;
  onAction: (kind: string, id: string) => void;
}) {
  const recipients = data.recipients.filter((r) => r.communication_id === m.id);
  return (
    <article className="commercial-card">
      <span className="eyebrow">
        {m.status} · {m.language} · {m.category}
      </span>
      <h3>{m.title}</h3>
      <p className="small muted">
        Prepared {new Date(m.created_at).toLocaleString()}
        {m.scheduled_for ? ' · Target ' + new Date(m.scheduled_for).toLocaleString() : ''}
        {m.published_at ? ' · Published ' + new Date(m.published_at).toLocaleString() : ''}
      </p>
      <p className="preserve-lines">{m.body}</p>
      <p>
        {recipients.filter((r) => r.status === 'published').length} available in portal ·{' '}
        {recipients.filter((r) => r.status === 'skipped').length} skipped ·{' '}
        {recipients.filter((r) => r.read_at).length} read acknowledgments
      </p>
      <div className="row-actions">
        {active && ['draft', 'scheduled'].includes(m.status) && (
          <>
            <button className="button primary" onClick={() => onAction('publish', m.id)}>
              Publish message
            </button>
            <button className="button" onClick={() => onAction('cancel', m.id)}>
              Cancel message
            </button>
          </>
        )}
        {active && (
          <button className="text-button" onClick={() => onAction('note', m.id)}>
            Add staff note
          </button>
        )}
      </div>
      <details>
        <summary>Recipient copies and private staff notes</summary>
        {recipients.map((r) => (
          <div className="recipient-copy" key={r.id}>
            <strong>
              {r.customer_name} · {r.status}
            </strong>
            <p>{r.title}</p>
            <p className="preserve-lines">{r.body}</p>
            <p className="muted small">
              {r.decision_reason || 'Waiting for publication'}
              {r.read_at ? ' · First read ' + new Date(r.read_at).toLocaleString() : ''}
            </p>
          </div>
        ))}
        {data.notes
          .filter((n) => n.communication_id === m.id)
          .map((n) => (
            <p className="muted preserve-lines" key={n.id}>
              Staff only · {n.body}
            </p>
          ))}
      </details>
    </article>
  );
}
function MessageComposer({
  snapshot,
  propertyId,
  templates,
  onSave,
  onCancel,
}: {
  snapshot: Snapshot;
  propertyId: string;
  templates: MessageTemplate[];
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [templateId, setTemplate] = useState(''),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [lang, setLanguage] = useState('en'),
    [category, setCategory] = useState('general'),
    [selected, setSelected] = useState<string[]>([]),
    [scheduled, setScheduled] = useState(''),
    [why, setWhy] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const property = snapshot.properties.find((p) => p.id === propertyId)!,
    customers = snapshot.customers.filter((c) => c.property_id === propertyId && !c.archived_at);
  const previews: { id: string; name: string; title: string; body: string }[] = [];
  let previewError = '';
  if (title && body)
    try {
      for (const c of customers.filter((c) => selected.includes(c.id)).slice(0, 3)) {
        const stay = snapshot.stays.find(
            (s) => s.customer_id === c.id && isCurrentStay(s, dateAtProperty(property.timezone))
          ),
          context = {
            customer_name: c.first_name + ' ' + c.last_name,
            property_name: property.name,
            site_label: snapshot.sites.find((s) => s.id === stay?.site_id)?.label ?? '',
            today: dateAtProperty(property.timezone),
          };
        previews.push({
          id: c.id,
          name: context.customer_name,
          title: renderMessage(title, context),
          body: renderMessage(body, context),
        });
      }
    } catch (e) {
      previewError = e instanceof Error ? e.message : 'Check placeholders.';
    }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      if (previewError) throw new Error(previewError);
      await onSave({
        template_id: templateId || null,
        template_version: templates.find((t) => t.id === templateId)?.version ?? null,
        title,
        body,
        language: lang,
        category,
        customer_ids: selected,
        scheduled_for: scheduled ? new Date(scheduled).toISOString() : null,
        reason: why,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message could not be prepared.');
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending} className="form-fields">
        <div className="field">
          <label htmlFor="message-template">Start from template</label>
          <select
            id="message-template"
            value={templateId}
            onChange={(e) => {
              setTemplate(e.target.value);
              const t = templates.find((t) => t.id === e.target.value);
              if (t) {
                setTitle(t.title);
                setBody(t.body);
                setLanguage(t.language);
                setCategory(t.category);
              }
            }}
          >
            <option value="">Custom message</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.language}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="message-language">Message language</label>
            <select id="message-language" value={lang} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="message-category">Message category</label>
            <select id="message-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {messageCategories.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="message-title">Message title</label>
          <input
            id="message-title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="message-body">Message body</label>
          <textarea
            id="message-body"
            required
            maxLength={4000}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <p className="muted small">
          Placeholders: {'{{customer_name}}'}, {'{{property_name}}'}, {'{{site_label}}'}, {'{{today}}'}. Text
          and recipients are frozen when prepared.
        </p>
        <fieldset className="audience-picker">
          <legend>Choose recipients ({selected.length} / 250)</legend>
          {customers.map((c) => (
            <label className="checkbox-label" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))
                }
              />
              {customerName(c)}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="message-schedule">Scheduled publication target</label>
          <input
            id="message-schedule"
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
          <small>Optional, in your browser’s time zone. A staff member must publish once due.</small>
        </div>
        <div className="field">
          <label htmlFor="message-reason">Reason / supporting record</label>
          <textarea
            id="message-reason"
            required
            minLength={3}
            maxLength={2000}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </div>
        {previewError && <p className="alert">{previewError}</p>}
        {previews.length > 0 && (
          <section className="message-preview">
            <h3>Preview · first three selected recipients</h3>
            {previews.map((p) => (
              <article key={p.id}>
                <strong>
                  {p.name}: {p.title}
                </strong>
                <p className="preserve-lines">{p.body}</p>
              </article>
            ))}
          </section>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!selected.length || selected.length > 250 || !!previewError}
          >
            {pending ? 'Preparing…' : 'Save prepared message'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
