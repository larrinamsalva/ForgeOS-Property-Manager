'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Receipt, RefreshCw, Plus, Download } from 'lucide-react';
import { stateLabel } from '@/lib/collections-domain';
import type { Snapshot } from '@/lib/domain';
import { addDays, calendarMonth, canEditProperty, customerName, dateAtProperty, csv } from '@/lib/domain';
import {
  cents,
  dollarsToCents,
  ledgerBalance,
  type BillingSnapshot,
  type Invoice,
} from '@/lib/billing-domain';
import { Modal } from './modal';
import { RecordForm, type Field } from './record-form';
import { UtilityRateForm } from './utility-rate-form';
import { Empty } from './workspace-parts';
type Editor = { type: string; id?: string; requestId: string };
const reason: Field = { name: 'reason', label: 'Reason', type: 'textarea', required: true };
export function BillingWorkspace({
  snapshot,
  propertyId,
  navigationPending,
}: {
  snapshot: Snapshot;
  propertyId: string;
  navigationPending: boolean;
}) {
  const [data, setData] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('invoices');
  const [selectedProperty, setSelectedProperty] = useState(
    propertyId || snapshot.properties.find((p) => canEditProperty(snapshot, p.id, true))?.id || ''
  );
  const [customerId, setCustomerId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [downloading, setDownloading] = useState(false);
  const property = snapshot.properties.find((p) => p.id === selectedProperty);
  const today = dateAtProperty(property?.timezone ?? 'America/Los_Angeles');
  const active = !!property && !property.archived_at && property.operating_status === 'active';
  const manage = active && canEditProperty(snapshot, selectedProperty);
  const prepare = active && canEditProperty(snapshot, selectedProperty, true);
  const scope = { organization_id: snapshot.organizationId, property_id: selectedProperty };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/billing?organization=${snapshot.organizationId}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setData(result);
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
    setRefresh((value) => value + 1);
  };
  const open = (type: string, id?: string) => {
    setError('');
    setEditor({ type, id, requestId: crypto.randomUUID() });
  };
  const close = () => setEditor(null);
  async function save(command: string, values: Record<string, unknown>) {
    if (!editor) throw new Error('Open this action again.');
    const response = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload: { ...scope, request_id: editor.requestId, ...values } }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    close();
    setNotice(
      command === 'approve_invoice'
        ? 'Invoice approved for internal review. It has not been issued.'
        : 'Billing record saved. Earlier versions and ledger entries are retained.'
    );
    reload();
  }
  const invoices = (data?.invoices.filter((i) => i.property_id === selectedProperty) ?? []).sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.number.localeCompare(a.number)
  );
  const rates = data?.rates.filter((r) => r.property_id === selectedProperty) ?? [];
  const events = data?.events.filter((e) => e.property_id === selectedProperty) ?? [];
  const ledger = (
    data?.ledger.filter(
      (e) => e.property_id === selectedProperty && (!customerId || e.customer_id === customerId)
    ) ?? []
  ).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const policies = (data?.policies.filter((p) => p.property_id === selectedProperty) ?? []).sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  );
  const policy = policies[0];
  const stays = snapshot.stays.filter((s) => s.property_id === selectedProperty);
  const current = (invoice: Invoice) => data?.revisions.find((r) => r.id === invoice.current_revision_id);
  async function download(invoice: Invoice) {
    setDownloading(true);
    setError('');
    try {
      const response = await fetch(`/api/billing/${invoice.id}/pdf`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.number}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Statement download unavailable.');
    } finally {
      setDownloading(false);
    }
  }
  function exportLedger() {
    const rows = [
      ['Date', 'Invoice', 'Event', 'Amount cents (USD)', 'Reason', 'Reference'],
      ...ledger.map((e) => [
        e.created_at,
        invoices.find((i) => i.id === e.invoice_id)?.number || e.invoice_id,
        e.kind,
        e.amount_cents,
        e.reason,
        e.reference,
      ]),
    ];
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forgeos-charge-ledger.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderEditor() {
    if (!editor || !data) return null;
    if (editor.type === 'new_rate')
      return (
        <Modal title="Add utility rate version" onClose={close}>
          <UtilityRateForm today={today} rates={rates} onSave={(v) => save('new_rate', v)} onCancel={close} />
        </Modal>
      );
    let title = '',
      submit = 'Save',
      fields: Field[] = [],
      onSave = (v: Record<string, unknown>) => save(editor.type, v);
    const invoice = data.invoices.find((i) => i.id === editor.id);
    const rev = invoice ? current(invoice) : undefined;
    const account = data.accounts.find((a) => a.invoice_id === invoice?.id);
    if (editor.type === 'detail' && invoice && rev) {
      const calc = rev.calculation;
      const history = data.revisions
        .filter((r) => r.invoice_id === invoice.id)
        .sort((a, b) => b.revision - a.revision);
      const entries = data.ledger
        .filter((e) => e.invoice_id === invoice.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      return (
        <Modal title={`${invoice.number} · ${invoice.status}`} onClose={close}>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          <p>
            <strong>{calc.customer.name}</strong> · {calc.site.label} · {calc.starts_on} → {calc.ends_on}{' '}
            (exclusive)
          </p>
          <p>
            Planned due {calc.due_on} · Revision {rev.revision}
          </p>
          <p className="alert">
            {account?.issued_on
              ? `${stateLabel(account.state)} · Issued ${account.issued_on} · Due ${account.due_on}`
              : `${invoice.status === 'approved' ? 'Approved · Not issued.' : 'Internal review statement.'} Not a payment request.`}
          </p>
          <div className="table-wrap" role="region" aria-label="Invoice items" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Usage / quantity</th>
                  <th>Subtotal</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {calc.lines.map((line, i) => (
                  <tr key={i}>
                    <th scope="row">{line.description}</th>
                    <td>
                      {line.quantity} {line.unit}
                    </td>
                    <td>{cents(line.subtotal_cents)}</td>
                    <td>{cents(line.tax_cents)}</td>
                    <td>{cents(line.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="statement-total">Statement total {cents(calc.total_cents)}</p>
          {invoice.status !== 'draft' && (
            <p>
              {account?.issued_on ? 'Current outstanding balance' : 'Approved / unissued internal balance'}{' '}
              <strong>{cents(account?.outstanding_cents ?? ledgerBalance(entries, invoice.id))}</strong>
            </p>
          )}
          <div className="action-group billing-actions">
            <Link
              className="button secondary"
              href={`/collections?organization=${snapshot.organizationId}&property=${selectedProperty}`}
            >
              Payments & collections
            </Link>
            <button className="button secondary" disabled={downloading} onClick={() => download(invoice)}>
              <Download size={16} />
              {downloading ? 'Preparing PDF…' : 'Download PDF'}
            </button>
            <Link
              className="button secondary"
              href={`/invoices/${invoice.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Printable statement
            </Link>
            {prepare && invoice.status === 'draft' && (
              <button className="button secondary" onClick={() => open('refresh_draft', invoice.id)}>
                Refresh draft
              </button>
            )}
            {manage && invoice.status === 'draft' && (
              <button className="button primary" onClick={() => open('approve_invoice', invoice.id)}>
                Approve invoice
              </button>
            )}
            {manage && invoice.status === 'approved' && (
              <button className="button secondary" onClick={() => open('credit', invoice.id)}>
                Record credit
              </button>
            )}
            {manage && invoice.status !== 'voided' && (
              <button className="button danger" onClick={() => open('void_invoice', invoice.id)}>
                Void invoice
              </button>
            )}
          </div>
          <h3>Meter-to-invoice evidence</h3>
          {calc.lines.flatMap((line, i) =>
            (line.source.segments ?? []).map((segment, j) => (
              <div className="billing-evidence" key={`${i}:${j}`}>
                <strong>
                  {segment.meter.label} · {segment.meter.serial_number}
                </strong>
                <p>
                  {segment.from_reading.effective_value} → {segment.to_reading.effective_value}{' '}
                  {segment.meter.unit}
                </p>
                <p>
                  {segment.delta} × {segment.multiplier} × {segment.conversion_factor} = {segment.quantity}{' '}
                  {segment.unit}
                </p>
                <small>
                  Rate {line.source.rate?.label} · {line.source.rate?.starts_on} · {line.source.rate?.id}
                </small>
                <small>
                  Readings {segment.from_reading.id} / {segment.to_reading.id}
                </small>
                {segment.register_event && (
                  <p>
                    {segment.register_event.kind}: {segment.register_event.reason}
                  </p>
                )}
              </div>
            ))
          )}
          {!calc.reading_ids.length && <p>No metered usage in this statement. {calc.utilities_reason}</p>}
          <h3>Revision history</h3>
          {history.map((r) => (
            <details className="billing-evidence" key={r.id}>
              <summary>
                Revision {r.revision} · {cents(r.total_cents)} · {r.reason}
              </summary>
              <p>{r.created_at}</p>
              <pre className="source-json">{JSON.stringify(r.calculation, null, 2)}</pre>
            </details>
          ))}
          <h3>Internal ledger events</h3>
          {!entries.length && <p>Drafts have no posted internal balance.</p>}
          {entries.map((entry) => (
            <div className="billing-evidence" key={entry.id}>
              <p>
                <strong>
                  {entry.kind.replaceAll('_', ' ')} · {cents(entry.amount_cents)}
                </strong>
                <br />
                {entry.reason} {entry.reference}
                <br />
                <small>
                  {entry.created_at} · {entry.created_by}
                </small>
              </p>
              {manage &&
                invoice.status === 'approved' &&
                entry.kind === 'credit' &&
                !entries.some((e) => e.reverses_id === entry.id) && (
                  <button className="button secondary small" onClick={() => open('reverse_credit', entry.id)}>
                    Reverse this credit
                  </button>
                )}
            </div>
          ))}
        </Modal>
      );
    }
    if (editor.type === 'configure_policy') {
      title = 'Configure property billing';
      submit = 'Save billing policy';
      fields = [
        {
          name: 'proration',
          label: 'Rent and monthly fee proration',
          type: 'select',
          default: 'actual_calendar_days',
          options: [{ value: 'actual_calendar_days', label: 'Actual days in each calendar month' }],
          help: 'Nightly rent uses nights; weekly rent uses days / 7. Monthly charges split at month and lease boundaries.',
        },
        {
          name: 'due_days',
          label: 'Default planned due days after period end',
          type: 'number',
          default: String(policy?.due_days ?? 15),
          min: '0',
          max: '90',
          required: true,
        },
        {
          name: 'rent_tax',
          label: 'Authorized rent tax (%)',
          default: policy
            ? `${Math.trunc(policy.rent_tax_bps / 100)}.${String(policy.rent_tax_bps % 100).padStart(2, '0')}`
            : '0',
          required: true,
          help: 'Zero explicitly means no rent tax. Nonzero tax requires a label and authorization reference.',
        },
        { name: 'tax_label', label: 'Tax label', default: policy?.tax_label ?? '' },
        {
          name: 'authorization_reference',
          label: 'Tax authorization reference',
          default: policy?.authorization_reference ?? '',
        },
        reason,
      ];
      onSave = (v) =>
        save('configure_policy', {
          proration: v.proration,
          due_days: Number(v.due_days),
          rent_tax_bps: Number(dollarsToCents(String(v.rent_tax))),
          tax_label: v.tax_label,
          authorization_reference: v.authorization_reference,
          reason: v.reason,
        });
    }
    if (editor.type === 'create_draft') {
      title = 'Calculate draft invoice';
      submit = 'Calculate draft';
      const defaultStay = stays[0];
      const start =
        defaultStay && defaultStay.starts_on > calendarMonth(today, 0)
          ? defaultStay.starts_on
          : calendarMonth(today, 0);
      const end =
        defaultStay?.ends_on && defaultStay.ends_on < calendarMonth(today, 1)
          ? defaultStay.ends_on
          : calendarMonth(today, 1);
      fields = [
        {
          name: 'stay_id',
          label: 'Customer stay',
          type: 'select',
          required: true,
          default: defaultStay?.id ?? '',
          options: stays.map((s) => ({
            value: s.id,
            label: `${customerName(snapshot.customers.find((c) => c.id === s.customer_id))} · ${snapshot.sites.find((site) => site.id === s.site_id)?.label} · ${s.starts_on}${s.ends_on ? ` → ${s.ends_on}` : ''}`,
          })),
        },
        { name: 'starts_on', label: 'Billing starts on', type: 'date', required: true, default: start },
        { name: 'ends_on', label: 'Billing ends on (exclusive)', type: 'date', required: true, default: end },
        {
          name: 'due_on',
          label: 'Planned due date',
          type: 'date',
          required: true,
          default: addDays(end, policy?.due_days ?? 15),
        },
        {
          name: 'rent_mode',
          label: 'Rent calculation',
          type: 'select',
          default: 'recorded',
          options: [
            { value: 'recorded', label: 'Recorded stay and effective lease terms' },
            { value: 'manual', label: 'Custom authorized rent' },
            { value: 'none', label: 'No rent in this invoice' },
          ],
        },
        { name: 'manual_rent', label: 'Custom rent amount ($)', default: '0.00' },
        { name: 'rent_reason', label: 'Custom rent or omitted rent reason', type: 'textarea' },
        {
          name: 'include_utilities',
          label: 'Include metered utilities',
          type: 'checkbox',
          default: true,
          help: 'Every separately billed meter needs approved readings on the boundary dates. Rates and explicit unit conversions must cover the period.',
        },
        {
          name: 'utilities_reason',
          label: 'Utility inclusion or exclusion reason',
          type: 'textarea',
          help: 'Required when omitting utilities. A later utilities-only invoice can omit rent to avoid billing it twice.',
        },
        { name: 'accept_estimates', label: 'Acknowledge accepted estimated readings', type: 'checkbox' },
      ];
      for (const kind of ['fee', 'discount'])
        fields.push(
          {
            name: `${kind}_amount`,
            label: `${kind === 'fee' ? 'Authorized fee' : 'Agreed discount'} ($)`,
            default: '0.00',
          },
          { name: `${kind}_description`, label: `${kind} description` },
          { name: `${kind}_reason`, label: `${kind} authorization reason`, type: 'textarea' },
          { name: `${kind}_tax`, label: `${kind} tax (%)`, default: '0' },
          { name: `${kind}_tax_label`, label: `${kind} tax label` },
          { name: `${kind}_tax_reference`, label: `${kind} tax authorization` }
        );
      onSave = (v) => {
        const adjustments = ['fee', 'discount'].flatMap((kind) => {
          const amount = dollarsToCents(String(v[`${kind}_amount`]));
          return BigInt(amount) > 0n
            ? [
                {
                  kind,
                  description: v[`${kind}_description`],
                  amount_cents: amount,
                  reason: v[`${kind}_reason`],
                  tax_bps: Number(dollarsToCents(String(v[`${kind}_tax`]))),
                  tax_label: v[`${kind}_tax_label`],
                  authorization_reference: v[`${kind}_tax_reference`],
                },
              ]
            : [];
        });
        return save('create_draft', {
          stay_id: v.stay_id,
          starts_on: v.starts_on,
          ends_on: v.ends_on,
          due_on: v.due_on,
          rent_mode: v.rent_mode,
          manual_rent_cents: v.rent_mode === 'manual' ? dollarsToCents(String(v.manual_rent)) : null,
          rent_reason: v.rent_reason,
          include_utilities: v.include_utilities,
          utilities_reason: v.utilities_reason,
          accept_estimates: v.accept_estimates,
          adjustments,
        });
      };
    }
    if (
      ['approve_invoice', 'refresh_draft', 'void_invoice', 'credit'].includes(editor.type) &&
      invoice &&
      rev
    ) {
      const names: Record<string, string> = {
        approve_invoice: 'Approve invoice',
        refresh_draft: 'Refresh draft',
        void_invoice: 'Void invoice',
        credit: 'Record credit',
      };
      title = `${names[editor.type]} · ${invoice.number}`;
      submit = names[editor.type];
      fields = [reason];
      if (editor.type === 'credit')
        fields.unshift(
          { name: 'amount', label: 'Credit amount ($)', required: true },
          { name: 'reference', label: 'Credit reference' }
        );
      onSave = (v) =>
        save(editor.type, {
          invoice_id: invoice.id,
          revision_id: rev.id,
          reason: v.reason,
          ...(editor.type === 'credit'
            ? { amount_cents: dollarsToCents(String(v.amount)), reference: v.reference }
            : {}),
        });
    }
    if (editor.type === 'reverse_credit') {
      const credit = data.ledger.find((e) => e.id === editor.id);
      const bill = data.invoices.find((i) => i.id === credit?.invoice_id);
      if (!credit || !bill) return null;
      title = `Reverse credit · ${cents(-BigInt(credit.amount_cents))}`;
      submit = 'Record reversing entry';
      fields = [reason];
      onSave = (v) =>
        save('reverse_credit', {
          invoice_id: bill.id,
          revision_id: bill.current_revision_id,
          credit_id: credit.id,
          reason: v.reason,
        });
    }
    if (editor.type === 'register_event') {
      title = 'Document register reset or rollover';
      submit = 'Save register event';
      fields = [
        {
          name: 'reading_id',
          label: 'Accepted exception reading',
          type: 'select',
          required: true,
          options: data.sources
            .filter(
              (s) =>
                s.property_id === selectedProperty &&
                !events.some((e) => e.reading_id === s.id && e.status === 'active')
            )
            .map((s) => ({
              value: s.id,
              label: `${s.meter_label} · ${s.site_label} · ${s.flag} · ${s.value} · ${s.captured_at}`,
            })),
        },
        {
          name: 'before_value',
          label: 'Register just before reset',
          help: 'Required for a reset. Enter the documented register, not an estimated interval total.',
        },
        { name: 'after_value', label: 'Register just after reset' },
        {
          name: 'rollover_count',
          label: 'Verified rollover count',
          type: 'number',
          default: '1',
          min: '1',
          max: '100',
        },
        reason,
      ];
      onSave = (v) => {
        const source = data.sources.find((s) => s.id === v.reading_id);
        return save('register_event', {
          reading_id: v.reading_id,
          review_id: source?.review_id,
          before_value: source?.flag === 'reset' ? v.before_value : null,
          after_value: source?.flag === 'reset' ? v.after_value : null,
          rollover_count: source?.flag === 'rollover' ? Number(v.rollover_count) : null,
          reason: v.reason,
        });
      };
    }
    if (editor.type === 'void_rate') {
      title = 'Void unused rate schedule';
      submit = 'Void rate';
      fields = [reason];
      onSave = (v) => save('void_rate', { rate_id: editor.id, reason: v.reason });
    }
    if (editor.type === 'void_event') {
      title = 'Void unused register event';
      submit = 'Void event';
      fields = [reason];
      onSave = (v) => save('void_event', { event_id: editor.id, reason: v.reason });
    }
    if (!title) return null;
    return (
      <Modal title={title} onClose={close}>
        {editor.type === 'approve_invoice' && (
          <p>
            Approval verifies the saved calculation against its current sources and posts an internal,
            unissued ledger entry.
          </p>
        )}
        {editor.type === 'void_invoice' && (
          <p>
            Voiding preserves the statement and reverses its remaining internal balance. Its rent and meter
            intervals can then be recalculated.
          </p>
        )}
        <RecordForm fields={fields} submit={submit} onCancel={close} onSave={onSave} />
      </Modal>
    );
  }
  return (
    <div className="billing-workspace">
      <div className="reader-banner">
        <span className="property-icon">
          <Receipt size={28} />
        </span>
        <div>
          <span className="eyebrow">Utilities & billing</span>
          <h2>Every charge has a source.</h2>
          <p>
            Calculate, review and approve statements. Approval records an internal balance; customer issuance
            and payments are managed in Payments & collections.
          </p>
        </div>
      </div>
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {error && !editor && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="meter-controls">
        <label>
          Billing property
          <select
            value={selectedProperty}
            disabled={navigationPending || loading}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              setCustomerId('');
              close();
            }}
          >
            {snapshot.properties
              .filter((p) => (!propertyId || p.id === propertyId) && canEditProperty(snapshot, p.id, true))
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                  {p.archived_at ? ' · archived' : ''}
                </option>
              ))}
          </select>
        </label>
        <button className="button secondary" disabled={loading || navigationPending} onClick={reload}>
          <RefreshCw size={16} />
          Reload billing
        </button>
      </div>
      <div className="planning-tabs" role="group" aria-label="Billing sections">
        {[
          ['invoices', 'Invoices'],
          ['rates', 'Rates & policy'],
          ['ledger', 'Customer ledger'],
          ['events', 'Register events'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`button ${tab === id ? 'primary' : 'secondary'}`}
            aria-pressed={tab === id}
            disabled={navigationPending}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && <p role="status">Loading billing records…</p>}
      {!loading && data && (
        <fieldset className="meter-content" disabled={navigationPending}>
          {tab === 'invoices' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Itemized invoices</h2>
                  <p className="muted">
                    Draft → approved → explicitly issued in Collections. Service periods use exclusive end
                    dates.
                  </p>
                </div>
                {prepare && (
                  <button
                    className="button primary"
                    disabled={!policy || !stays.length}
                    onClick={() => open('create_draft')}
                  >
                    <Plus size={16} />
                    New draft invoice
                  </button>
                )}
              </div>
              {!policy && (
                <p className="alert">
                  A supervisor must configure the property’s billing policy in Rates & policy.
                </p>
              )}
              {!invoices.length ? (
                <Empty title="No invoices yet">
                  Create a draft from a recorded stay and authorized rates.
                </Empty>
              ) : (
                <div className="table-wrap" role="region" aria-label="Invoice records" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Customer / site</th>
                        <th>Period</th>
                        <th>Status</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const revision = current(invoice);
                        return (
                          <tr key={invoice.id}>
                            <th scope="row">
                              <button className="text-button" onClick={() => open('detail', invoice.id)}>
                                {invoice.number}
                              </button>
                              <small>Revision {revision?.revision}</small>
                            </th>
                            <td>
                              {revision?.calculation.customer.name}
                              <small>{revision?.calculation.site.label}</small>
                            </td>
                            <td>
                              {invoice.starts_on} → {invoice.ends_on}
                              <small>Planned due {invoice.due_on}</small>
                            </td>
                            <td>
                              <span className="billing-status">
                                {stateLabel(
                                  data.accounts.find((a) => a.invoice_id === invoice.id)?.state ??
                                    invoice.status
                                )}
                              </span>
                            </td>
                            <td>{revision ? cents(revision.total_cents) : 'Reload needed'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {tab === 'rates' && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Property billing policy</h2>
                    <p className="muted">USD · explicit tax authorization · actual calendar day proration.</p>
                  </div>
                  {manage && (
                    <button className="button primary" onClick={() => open('configure_policy')}>
                      {policy ? 'New policy version' : 'Configure billing'}
                    </button>
                  )}
                </div>
                {policy ? (
                  <>
                    <p>
                      <strong>Actual days in each calendar month</strong> · Planned due {policy.due_days} days
                      after period end
                    </p>
                    <p>
                      Rent tax {policy.rent_tax_bps} basis points {policy.tax_label} ·{' '}
                      {policy.authorization_reference || 'No tax authorization needed at zero tax'}
                    </p>
                    <p>{policy.reason}</p>
                    <details>
                      <summary>Policy history ({policies.length} versions)</summary>
                      {policies.map((p) => (
                        <p key={p.id}>
                          {p.created_at} · {p.rent_tax_bps} basis points · {p.reason}
                        </p>
                      ))}
                    </details>
                  </>
                ) : (
                  <p>No billing policy has been authorized.</p>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Utility rate schedules</h2>
                    <p className="muted">
                      Effective dates, conversions, tiers, base service, sewer and authorized taxes.
                    </p>
                  </div>
                  {manage && (
                    <button className="button primary" onClick={() => open('new_rate')}>
                      <Plus size={16} />
                      Add rate version
                    </button>
                  )}
                </div>
                <div className="meter-directory">
                  {rates
                    .sort(
                      (a, b) => a.utility.localeCompare(b.utility) || b.starts_on.localeCompare(a.starts_on)
                    )
                    .map((rate) => (
                      <article className="meter-card" key={rate.id}>
                        <span className={`utility-chip ${rate.utility}`}>{rate.utility}</span>
                        <h3>{rate.label}</h3>
                        <p>
                          {rate.starts_on} → {rate.ends_on || 'Open ended'} · {rate.status}
                        </p>
                        <p>
                          {rate.included_in_rent
                            ? 'Included in rent'
                            : `${rate.billed_unit} · ${cents(rate.monthly_base_cents)} monthly base`}
                        </p>
                        <ul>
                          {rate.tiers.map((tier, i) => (
                            <li key={i}>
                              Through {tier.up_to || 'unlimited'}: ${tier.unit_price} / {rate.billed_unit}
                            </li>
                          ))}
                        </ul>
                        <p>
                          {rate.conversions
                            .map((c) => `${c.unit} × ${c.factor} → ${rate.billed_unit}`)
                            .join('; ')}
                        </p>
                        {rate.utility === 'water' && (
                          <p>
                            Sewer ${rate.sewer_unit_price} / {rate.billed_unit} +{' '}
                            {cents(rate.sewer_base_cents)} monthly
                          </p>
                        )}
                        <p>
                          Tax {rate.tax_bps} basis points · {rate.tax_label}
                        </p>
                        <details>
                          <summary>Authorization record</summary>
                          <p>{rate.reason}</p>
                          <p>{rate.authorization_reference}</p>
                          <small className="mono">{rate.id}</small>
                        </details>
                        {manage && rate.status === 'active' && (
                          <button
                            className="button secondary small"
                            onClick={() => open('void_rate', rate.id)}
                          >
                            Void unused rate
                          </button>
                        )}
                      </article>
                    ))}
                </div>
                {!rates.length && (
                  <Empty title="No utility schedules">
                    Add the property’s authorized rates. A zero-price schedule explicitly records utilities
                    included in rent.
                  </Empty>
                )}
              </section>
            </>
          )}
          {tab === 'ledger' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Customer account ledger</h2>
                  <p className="muted">
                    Charges, credits and reversals. Payments, deposits and outstanding balances appear in
                    Payments & collections.
                  </p>
                </div>
                <button className="button secondary" disabled={!ledger.length} onClick={exportLedger}>
                  <Download size={16} />
                  Export ledger
                </button>
              </div>
              <label className="history-meter-filter">
                Ledger customer
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">All authorized customers at this property</option>
                  {snapshot.customers
                    .filter((c) => c.property_id === selectedProperty)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {customerName(c)}
                      </option>
                    ))}
                </select>
              </label>
              <p className="statement-total">Charges after credits {cents(ledgerBalance(ledger))}</p>
              {!ledger.length ? (
                <Empty title="No ledger events">
                  Approve an invoice to post its internal debit. Credits and reversing entries preserve the
                  account history.
                </Empty>
              ) : (
                <div className="table-wrap" role="region" aria-label="Customer ledger entries" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date / invoice</th>
                        <th>Customer</th>
                        <th>Event</th>
                        <th>Amount</th>
                        <th>Reason / reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            {entry.created_at.slice(0, 10)}
                            <small>
                              <button
                                className="text-button"
                                onClick={() => open('detail', entry.invoice_id)}
                              >
                                {invoices.find((i) => i.id === entry.invoice_id)?.number}
                              </button>
                            </small>
                          </td>
                          <td>{customerName(snapshot.customers.find((c) => c.id === entry.customer_id))}</td>
                          <td>{entry.kind.replaceAll('_', ' ')}</td>
                          <td>{cents(entry.amount_cents)}</td>
                          <td>
                            {entry.reason}
                            <small>{entry.reference}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {tab === 'events' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Register resets & rollovers</h2>
                  <p className="muted">
                    Document the numeric event against the latest accepted exception review before billing.
                  </p>
                </div>
                {manage && (
                  <button className="button primary" onClick={() => open('register_event')}>
                    Document register event
                  </button>
                )}
              </div>
              {events.map((event) => (
                <article className="billing-evidence" key={event.id}>
                  <h3>
                    {event.kind} · {event.status}
                  </h3>
                  <p>
                    {event.kind === 'reset'
                      ? `${event.before_value} before reset → ${event.after_value} after reset`
                      : `${event.rollover_count} verified rollovers`}
                  </p>
                  <p>{event.reason}</p>
                  <small className="mono">
                    Reading {event.reading_id} · Review {event.review_id}
                  </small>
                  {event.void_reason && <p>{event.void_reason}</p>}
                  {manage && event.status === 'active' && (
                    <button className="button secondary small" onClick={() => open('void_event', event.id)}>
                      Void unused event
                    </button>
                  )}
                </article>
              ))}
              {!events.length && (
                <Empty title="No register events">
                  Ordinary readings use the register difference. Resets require documented before/after
                  values; rollovers require a verified count.
                </Empty>
              )}
            </section>
          )}
          {renderEditor()}
        </fieldset>
      )}
    </div>
  );
}
