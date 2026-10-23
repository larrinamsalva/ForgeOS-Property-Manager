'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Receipt, RefreshCw, Plus, Download } from 'lucide-react';
import {
  type Snapshot,
  addDays,
  canEditProperty,
  canManageOrganization,
  customerName,
  dateAtProperty,
  csv,
} from '@/lib/domain';
import { cents } from '@/lib/billing-domain';
import {
  agingTotals,
  collectionDollars,
  openFollowups,
  paymentMethods,
  stateLabel,
  type CollectionsSnapshot,
  type CashSource,
} from '@/lib/collections-domain';
import { RecordForm, type Field } from './record-form';
import { Modal } from './modal';
import { Empty } from './workspace-parts';
import { ReconciliationForm } from './reconciliation-form';
import { StaffFollowupWorklist } from './staff-followup-worklist';
type Editor = { type: string; id?: string; requestId: string };
const reason: Field = {
  name: 'reason',
  label: 'Reason / supporting record',
  type: 'textarea',
  required: true,
};
const reference: Field = {
  name: 'reference',
  label: 'Transaction reference',
  help: 'Required for noncash receipts and payouts. Use an external confirmation or check reference. Never enter card or bank account numbers.',
};
const amount: Field = {
  name: 'amount',
  label: 'Amount ($)',
  required: true,
  help: 'USD, up to two decimal places.',
};
const method: Field = {
  name: 'method',
  label: 'Payment method',
  type: 'select',
  required: true,
  options: paymentMethods,
  default: 'cash',
};
export function CollectionsWorkspace({
  snapshot,
  propertyId,
  navigationPending,
}: {
  snapshot: Snapshot;
  propertyId: string;
  navigationPending: boolean;
}) {
  const [data, setData] = useState<CollectionsSnapshot | null>(null);
  const [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [tab, setTab] = useState('accounts');
  const [selectedProperty, setSelectedProperty] = useState(
    propertyId || snapshot.properties.find((p) => canEditProperty(snapshot, p.id, true))?.id || ''
  );
  const [customerId, setCustomerId] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null);
  const [downloading, setDownloading] = useState(false);
  const property = snapshot.properties.find((p) => p.id === selectedProperty);
  const today = dateAtProperty(property?.timezone ?? 'America/Los_Angeles');
  const active = !!property && !property.archived_at && property.operating_status === 'active';
  const manage = active && canEditProperty(snapshot, selectedProperty);
  const prepare = active && canEditProperty(snapshot, selectedProperty, true);
  const owner = canManageOrganization(snapshot);
  const scope = { organization_id: snapshot.organizationId, property_id: selectedProperty };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/collections?organization=${snapshot.organizationId}`, {
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
    setRefresh((n) => n + 1);
  };
  const close = () => setEditor(null);
  const open = (type: string, id?: string) => {
    setError('');
    setEditor({ type, id, requestId: crypto.randomUUID() });
  };
  async function command(action: string, values: Record<string, unknown>, requestId = editor?.requestId) {
    if (!requestId) throw new Error('Open this action again.');
    const response = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: action, payload: { ...scope, request_id: requestId, ...values } }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  async function save(action: string, values: Record<string, unknown>) {
    const result = await command(action, values);
    close();
    setNotice(
      action === 'prepare_fee'
        ? 'Late fee draft prepared. Review and approve it in Utilities & billing, then issue it explicitly.'
        : action === 'issue_invoice'
          ? 'Invoice marked issued. No message or payment request was sent.'
          : 'Record saved. Original transactions and receipts are retained.'
    );
    reload();
    return result;
  }
  const inProperty = <T extends { property_id: string }>(rows: T[] | undefined) =>
    rows?.filter((row) => row.property_id === selectedProperty) ?? [];
  const forCustomer = <T extends { customer_id: string }>(rows: T[]) =>
    rows.filter((row) => !customerId || row.customer_id === customerId);
  const customers = snapshot.customers.filter((c) => c.property_id === selectedProperty);
  const name = (id: string) => customerName(snapshot.customers.find((c) => c.id === id));
  const accounts = forCustomer(inProperty(data?.summary.accounts));
  const payments = forCustomer(inProperty(data?.payments));
  const deposits = forCustomer(inProperty(data?.deposits));
  const notes = forCustomer(inProperty(data?.notes));
  const receipts = forCustomer(inProperty(data?.receipts)).sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.number.localeCompare(a.number)
  );
  const policy = inProperty(data?.policies).sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  )[0];
  const totals = agingTotals(accounts);
  const followups = openFollowups(notes, today);
  const customerField: Field = {
    name: 'customer_id',
    label: 'Customer',
    type: 'select',
    required: true,
    default: customerId,
    options: customers.map((c) => ({
      value: c.id,
      label: `${customerName(c)}${c.archived_at ? ' · archived' : ''}`,
    })),
  };
  const effectiveField: Field = {
    name: 'effective_on',
    label: 'Transaction date',
    type: 'date',
    required: true,
    max: today,
    default: today,
    min: '2000-01-01',
  };
  const invoiceOptions = (customer?: string) =>
    inProperty(data?.summary.accounts)
      .filter(
        (a) =>
          a.issued_on &&
          a.state !== 'voided' &&
          BigInt(a.outstanding_cents) > 0n &&
          (!customer || a.customer_id === customer)
      )
      .map((a) => ({
        value: a.invoice_id,
        label: `${a.number} · ${name(a.customer_id)} · ${cents(a.outstanding_cents)} outstanding`,
      }));
  async function download(id: string, number: string) {
    setDownloading(true);
    setError('');
    try {
      const response = await fetch(`/api/collections/receipts/${id}/pdf`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement('a');
      a.href = url;
      a.download = `${number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receipt unavailable.');
    } finally {
      setDownloading(false);
    }
  }
  function exportRows(kind: 'aging' | 'cash') {
    const rows =
      kind === 'aging'
        ? [
            [
              'Invoice',
              'Customer',
              'State',
              'Issued',
              'Due',
              'Grace through',
              'Days past due',
              'Aging',
              'Outstanding cents (USD)',
            ],
            ...accounts.map((a) => [
              a.number,
              name(a.customer_id),
              a.state,
              a.issued_on ?? '',
              a.due_on ?? '',
              a.grace_ends_on ?? '',
              String(a.days_past_due),
              a.aging_bucket ?? '',
              a.outstanding_cents,
            ]),
          ]
        : [
            ['Source', 'Date', 'Customer', 'Method', 'Amount cents (USD)', 'Reference'],
            ...inProperty(data?.summary.cash).map((c) => [
              c.source_key,
              c.effective_on,
              name(c.customer_id),
              c.method,
              c.amount_cents,
              c.reference,
            ]),
          ];
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `forgeos-${kind}-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderEditor() {
    if (!editor || !data) return null;
    const payment = data.payments.find((p) => p.id === editor.id),
      deposit = data.deposits.find((d) => d.id === editor.id);
    const invoice = data.invoices.find((i) => i.id === editor.id),
      account = data.summary.accounts.find((a) => a.invoice_id === editor.id);
    const fee = data.fees.find((f) => f.id === editor.id),
      note = data.notes.find((n) => n.id === editor.id);
    let title = '',
      submit = 'Save record',
      description = '',
      fields: Field[] = [];
    let onSave: (values: Record<string, unknown>) => Promise<unknown> = (v) => save(editor.type, v);
    if (editor.type === 'reconcile')
      return (
        <Modal title="Review reconciliation" onClose={close}>
          <ReconciliationForm
            today={today}
            owner={owner}
            sources={inProperty(data.summary.cash)}
            customerName={name}
            preview={(v) => command('preview_reconciliation', v)}
            onSave={(v) => save('close_reconciliation', v).then(() => undefined)}
            onCancel={close}
          />
        </Modal>
      );
    if (editor.type === 'reconciliation_detail') {
      const batch = data.reconciliations.find((r) => r.id === editor.id);
      if (!batch) return null;
      const voided = data.reconciliationVoids.find((v) => v.reconciliation_id === batch.id);
      return (
        <Modal title="Reconciliation record" onClose={close}>
          <p>
            {batch.starts_on} → {batch.ends_on} (exclusive) · {stateLabel(batch.method)} ·{' '}
            {voided ? 'Voided' : 'Reviewed'}
          </p>
          <p>Statement: {batch.statement_reference}</p>
          <p>
            Opening {cents(batch.opening_cents)} · Matched movement {cents(batch.net_cents)} · Closing{' '}
            {cents(batch.closing_cents)}
          </p>
          <p className={BigInt(batch.variance_cents) !== 0n ? 'alert error' : 'alert'}>
            Variance {cents(batch.variance_cents)}
            {BigInt(batch.variance_cents) !== 0n ? ' · Unresolved discrepancy' : ''}
          </p>
          <p>{batch.variance_reason || batch.reason}</p>
          {voided && <p>Void reason: {voided.reason}</p>}
          <CashTable sources={batch.snapshot.sources} name={name} />
        </Modal>
      );
    }
    if (editor.type === 'history') {
      if (!account) return null;
      return (
        <Modal title={`${account.number} · Account history`} onClose={close}>
          <p>
            {name(account.customer_id)} · {stateLabel(account.state)}
          </p>
          <p>
            Outstanding {cents(account.outstanding_cents)} as of {account.as_of}
          </p>
          <p>
            Issue {account.issued_on || 'Not issued'} · Due {account.due_on || 'Not issued'} · Grace through{' '}
            {account.grace_ends_on || 'Not issued'}
          </p>
          <p>
            Approved charges after credits {cents(account.adjusted_cents)} · Allocated{' '}
            {cents(account.allocated_cents)}
          </p>
          <HistoryTable
            entries={account.history.map((e) => ({
              id: e.id,
              date: e.effective_on,
              kind: `${e.source}: ${stateLabel(e.kind)}`,
              amount: e.amount_cents,
              reason: e.reason,
              reference: e.reference,
            }))}
          />
          <Link className="button secondary" href={`/invoices/${account.invoice_id}`}>
            Printable invoice & full ledger
          </Link>
        </Modal>
      );
    }
    if (editor.type === 'record_payment') {
      title = 'Record manual payment';
      submit = 'Record payment';
      description =
        'Record funds already received through your existing process. This creates a receipt and unapplied customer funds.';
      fields = [
        customerField,
        amount,
        {
          name: 'received_on',
          label: 'Received date',
          type: 'date',
          default: today,
          max: today,
          min: '2000-01-01',
          required: true,
        },
        method,
        reference,
        {
          name: 'corrects_payment_id',
          label: 'Corrects voided payment (optional)',
          type: 'select',
          options: inProperty(data.payments)
            .filter((p) => data.summary.payments.find((s) => s.id === p.id)?.voided)
            .map((p) => ({
              value: p.id,
              label: `${name(p.customer_id)} · ${cents(p.amount_cents)} · ${p.received_on} · ${p.id}`,
            })),
        },
        reason,
      ];
      onSave = (v) =>
        save('record_payment', {
          ...v,
          amount_cents: collectionDollars(String(v.amount)),
          amount: undefined,
          corrects_payment_id: v.corrects_payment_id || null,
        });
    }
    if (editor.type === 'issue_invoice' && invoice) {
      title = `Issue ${invoice.number}`;
      submit = 'Mark invoice issued';
      description =
        'Record explicit manual issuance and the actual due date. No email, reminder or processor request is sent. The due date and grace period are saved permanently for this invoice.';
      fields = [
        {
          name: 'issued_on',
          label: 'Issue date',
          type: 'date',
          default: today,
          max: today,
          min: '2000-01-01',
          required: true,
        },
        {
          name: 'due_on',
          label: 'Actual due date',
          type: 'date',
          default: addDays(today, 15),
          required: true,
        },
        reason,
      ];
      onSave = (v) =>
        save('issue_invoice', { ...v, invoice_id: invoice.id, revision_id: invoice.current_revision_id });
    }
    if (
      (editor.type === 'allocate_payment' ||
        editor.type === 'refund_payment' ||
        editor.type === 'void_payment') &&
      payment
    ) {
      title =
        editor.type === 'allocate_payment'
          ? 'Allocate payment'
          : editor.type === 'refund_payment'
            ? 'Record payment refund'
            : 'Void payment';
      submit = title;
      description = `${name(payment.customer_id)} · Original payment ${cents(payment.amount_cents)} · ${payment.received_on}. ${editor.type === 'void_payment' ? 'All allocations and refunds must first be reversed. This records a correction, with a new receipt.' : editor.type === 'refund_payment' ? 'Record a payout already completed through your existing process. Choose its actual method.' : 'Apply available funds to an issued invoice for this customer.'}`;
      fields = [
        ...(editor.type === 'allocate_payment'
          ? [
              {
                name: 'invoice_id',
                label: 'Invoice',
                type: 'select' as const,
                required: true,
                options: invoiceOptions(payment.customer_id),
              },
            ]
          : []),
        ...(editor.type !== 'void_payment' ? [amount] : []),
        effectiveField,
        ...(editor.type === 'refund_payment' ? [method] : []),
        reference,
        reason,
      ];
      onSave = (v) =>
        save(editor.type, {
          ...v,
          payment_id: payment.id,
          ...(editor.type !== 'void_payment'
            ? { amount: undefined, amount_cents: collectionDollars(String(v.amount)) }
            : {}),
        });
    }
    if (editor.type === 'reverse_payment_event' || editor.type === 'reverse_deposit') {
      title = editor.type === 'reverse_deposit' ? 'Reverse deposit event' : 'Reverse payment event';
      submit = 'Record reversal';
      description =
        'The original event remains in history. This creates one exact inverse entry dated today or later than the original event.';
      fields = [effectiveField, reference, reason];
      onSave = (v) => save(editor.type, { ...v, event_id: editor.id });
    }
    if (editor.type === 'new_deposit') {
      title = 'Open deposit account';
      submit = 'Open deposit account';
      description =
        'A separate liability account. Record each deposit received after opening it. Existing stay and reservation reference notes are not imported as money.';
      fields = [
        customerField,
        {
          name: 'kind',
          label: 'Deposit type',
          type: 'select',
          options: [
            { value: 'security', label: 'Security' },
            { value: 'reservation', label: 'Reservation' },
          ],
          default: 'security',
          required: true,
        },
        { name: 'label', label: 'Account label', default: 'Security deposit', required: true },
        {
          name: 'stay_id',
          label: 'Related stay (optional)',
          type: 'select',
          options: inProperty(snapshot.stays).map((s) => ({
            value: s.id,
            label: `${name(s.customer_id)} · ${snapshot.sites.find((site) => site.id === s.site_id)?.label} · ${s.starts_on}`,
          })),
        },
        {
          name: 'reservation_id',
          label: 'Related reservation (optional)',
          type: 'select',
          options: inProperty(snapshot.reservations).map((r) => ({
            value: r.id,
            label: `${name(r.customer_id)} · ${r.starts_on}`,
          })),
        },
        reference,
        reason,
      ];
      onSave = (v) =>
        save('new_deposit', { ...v, stay_id: v.stay_id || null, reservation_id: v.reservation_id || null });
    }
    if (editor.type.startsWith('deposit_') && deposit) {
      const kind = editor.type.slice(8),
        cash = kind === 'received' || kind === 'returned';
      title = `Record deposit ${stateLabel(kind).toLowerCase()}`;
      submit = 'Record deposit event';
      description = `${deposit.label} · ${name(deposit.customer_id)}. ${cash ? 'Record funds already received or returned outside ForgeOS.' : 'Apply held liability to a reviewed, issued invoice. Deductions require owner authorization and a fee-only invoice.'}`;
      fields = [
        amount,
        effectiveField,
        ...(cash
          ? [method]
          : [
              {
                name: 'invoice_id',
                label: 'Invoice',
                type: 'select' as const,
                required: true,
                options: invoiceOptions(deposit.customer_id),
              },
            ]),
        reference,
        reason,
      ];
      onSave = (v) =>
        save('record_deposit', {
          ...v,
          deposit_id: deposit.id,
          kind,
          amount: undefined,
          amount_cents: collectionDollars(String(v.amount)),
          method: cash ? v.method : null,
          invoice_id: cash ? null : v.invoice_id,
        });
    }
    if (editor.type === 'prepare_fee' && invoice) {
      title = `Prepare late fee for ${invoice.number}`;
      submit = 'Prepare fee draft';
      description = `Manual assessment using the current authorized owner policy: flat ${cents(policy?.fee_flat_cents ?? '0')} plus ${policy?.fee_bps ?? 0} basis points of outstanding charges, capped at ${cents(policy?.fee_cap_cents ?? '0')} before configured tax. Review and approve the separate draft in Billing. No automated fee is scheduled.`;
      fields = [reason];
      onSave = (v) => save('prepare_fee', { ...v, invoice_id: invoice.id });
    }
    if (editor.type === 'waive_fee' && fee) {
      title = 'Record late fee waiver';
      submit = 'Record waiver';
      description =
        'Posts a credit against the approved fee invoice. Its original charge and waiver remain in the ledger.';
      fields = [amount, reason];
      onSave = (v) =>
        save('waive_fee', {
          amount_cents: collectionDollars(String(v.amount)),
          reason: v.reason,
          assessment_id: fee.id,
        });
    }
    if (editor.type === 'note' || editor.type === 'arrangement' || editor.type === 'resolve') {
      const arrangement = editor.type === 'arrangement',
        resolve = editor.type === 'resolve';
      title = arrangement ? 'Record payment arrangement' : resolve ? 'Resolve follow-up' : 'Add account note';
      submit = title;
      description =
        'Internal staff record and manual follow-up queue. No reminder, notice or legal action is sent or scheduled.';
      fields = [
        ...(!arrangement && !resolve ? [customerField] : []),
        { name: 'body', label: 'Account note / arrangement details', type: 'textarea', required: true },
        ...(!resolve
          ? [{ name: 'follow_up_on', label: 'Manual follow-up date (optional)', type: 'date' as const }]
          : []),
        ...(arrangement
          ? [
              {
                name: 'promised_on',
                label: 'Promised date',
                type: 'date' as const,
                min: today,
                max: addDays(today, 366),
                default: addDays(today, 7),
                required: true,
              },
              { ...amount, label: 'Promised amount ($)' },
            ]
          : []),
      ];
      onSave = (v) =>
        save('account_note', {
          customer_id: arrangement ? invoice?.customer_id : resolve ? note?.customer_id : v.customer_id,
          invoice_id: arrangement ? invoice?.id : resolve ? note?.invoice_id : null,
          kind: arrangement ? 'arrangement' : resolve ? 'resolution' : 'note',
          body: v.body,
          follow_up_on: v.follow_up_on || null,
          promised_on: arrangement ? v.promised_on : null,
          promised_amount_cents: arrangement ? collectionDollars(String(v.amount)) : null,
          resolves_id: resolve ? note?.id : null,
        });
    }
    if (editor.type === 'void_reconciliation') {
      title = 'Void reconciliation';
      submit = 'Void reconciliation';
      description =
        'Retains the reviewed batch and its statement snapshot, and releases its selected movements for review again. Later adjacent periods must be voided first.';
      fields = [reason];
      onSave = (v) => save('void_reconciliation', { ...v, reconciliation_id: editor.id });
    }
    if (editor.type === 'configure_collections') {
      title = 'Owner collections policy';
      submit = 'Save collections policy';
      description =
        'Record the owner’s reviewed contract and jurisdictional authorization. Every change creates a new version. Late fees remain manual; no automated notices or fees run.';
      fields = [
        {
          name: 'manual_issuance_enabled',
          label: 'Enable explicit manual invoice issuance',
          type: 'checkbox',
          default: policy?.manual_issuance_enabled ?? false,
        },
        {
          name: 'grace_days',
          label: 'Grace days',
          type: 'number',
          min: '0',
          max: '90',
          default: String(policy?.grace_days ?? 0),
          required: true,
        },
        {
          name: 'fees_enabled',
          label: 'Enable manually reviewed late fee drafts',
          type: 'checkbox',
          default: policy?.fees_enabled ?? false,
        },
        {
          name: 'fee_flat',
          label: 'Late fee flat amount ($)',
          default: decimal(policy?.fee_flat_cents),
          required: true,
        },
        {
          name: 'fee_bps',
          label: 'Late fee rate (basis points)',
          type: 'number',
          min: '0',
          max: '10000',
          default: String(policy?.fee_bps ?? 0),
          required: true,
          help: '100 basis points = 1% of current outstanding charges.',
        },
        {
          name: 'fee_cap',
          label: 'Late fee cap before tax ($)',
          default: decimal(policy?.fee_cap_cents),
          required: true,
        },
        {
          name: 'fee_tax_bps',
          label: 'Fee tax (basis points)',
          type: 'number',
          min: '0',
          max: '10000',
          default: String(policy?.fee_tax_bps ?? 0),
          required: true,
        },
        { name: 'fee_tax_label', label: 'Authorized fee tax label', default: policy?.fee_tax_label ?? '' },
        {
          name: 'deposit_deductions_enabled',
          label: 'Enable reviewed deposit deductions against fee invoices',
          type: 'checkbox',
          default: policy?.deposit_deductions_enabled ?? false,
        },
        {
          name: 'authorization_reference',
          label: 'Contract / jurisdiction review reference',
          required: true,
          default: policy?.authorization_reference ?? '',
        },
        reason,
      ];
      onSave = (v) =>
        save('configure_collections', {
          ...v,
          grace_days: Number(v.grace_days),
          fee_bps: Number(v.fee_bps),
          fee_tax_bps: Number(v.fee_tax_bps),
          fee_flat: undefined,
          fee_cap: undefined,
          fee_flat_cents: collectionDollars(String(v.fee_flat)),
          fee_cap_cents: collectionDollars(String(v.fee_cap)),
        });
    }
    if (!title) return null;
    return (
      <Modal title={title} onClose={close}>
        <p>{description}</p>
        <RecordForm
          fields={fields}
          submit={submit}
          onCancel={close}
          onSave={(v) => onSave(v).then(() => undefined)}
        />
      </Modal>
    );
  }
  const button = (label: string, action: () => void, disabled = false) => (
    <button className="button secondary" onClick={action} disabled={disabled || loading || navigationPending}>
      {label}
    </button>
  );
  return (
    <div className="billing-workspace collections-workspace">
      <div className="reader-banner">
        <span className="property-icon">
          <Receipt size={28} />
        </span>
        <div>
          <span className="eyebrow">Payments & collections</span>
          <h2>Follow every dollar.</h2>
          <p>
            Record received funds, apply them to issued invoices, and track held deposits separately. Online
            payment processing is disabled.
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
          Collections property
          <select
            value={selectedProperty}
            disabled={loading || navigationPending}
            onChange={(e) => {
              setSelectedProperty(e.target.value);
              setCustomerId('');
              close();
            }}
          >
            {snapshot.properties
              .filter((p) => (!propertyId || p.id === propertyId) && canEditProperty(snapshot, p.id, true))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? ' · archived' : ''}
                </option>
              ))}
          </select>
        </label>
        <label>
          Customer filter
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={loading}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerName(c)}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" onClick={reload} disabled={loading || navigationPending}>
          <RefreshCw size={16} />
          Reload collections
        </button>
      </div>
      <div className="planning-tabs" role="group" aria-label="Collections sections">
        {[
          ['accounts', 'Invoices & aging'],
          ['payments', 'Payments'],
          ['deposits', 'Deposits'],
          ['receipts', 'Receipts'],
          ['notes', 'Notes & follow-ups'],
          ['reconciliation', 'Reconciliation'],
          ['policy', 'Collections policy'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`button ${tab === id ? 'primary' : 'secondary'}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!selectedProperty ? (
        <Empty title="No financial property access">
          An owner or property manager can grant office access to payments and collections.
        </Empty>
      ) : loading ? (
        <p role="status">Loading collections…</p>
      ) : !data ? (
        <Empty title="Collections unavailable">
          Reload when the connection and migrations are available.
        </Empty>
      ) : (
        <>
          {!active && (
            <p className="alert">
              This property is inactive or archived. Restore and activate it before posting transactions.
            </p>
          )}
          {tab === 'accounts' && (
            <>
              <div className="collection-totals">
                {Object.entries(totals).map(([bucket, total]) => (
                  <div className="collection-total" key={bucket}>
                    <small>
                      {bucket === 'current'
                        ? 'Current'
                        : bucket === '90_plus'
                          ? 'Over 90 days'
                          : `${bucket.replace('_', '–')} days`}
                    </small>
                    <strong>{cents(total)}</strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Issued balances & aging</h2>
                    <p>
                      Aging uses actual due dates as of {today} at the property. Grace controls overdue status
                      and late fee eligibility. Unissued approvals are excluded from aging.
                    </p>
                  </div>
                  {button('Export aging', () => exportRows('aging'))}
                </div>
                {!accounts.length ? (
                  <Empty title="No invoices yet">
                    Prepare and approve charges in Utilities & billing, then explicitly issue them here.
                  </Empty>
                ) : (
                  <div
                    className="table-wrap"
                    role="region"
                    aria-label="Customer invoice balances"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice / customer</th>
                          <th>Status</th>
                          <th>Due / grace</th>
                          <th>Outstanding</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((a) => (
                          <tr key={a.invoice_id}>
                            <th scope="row">
                              {a.number}
                              <small>{name(a.customer_id)}</small>
                            </th>
                            <td>
                              <span className="badge" data-state={a.state}>
                                {stateLabel(a.state)}
                              </span>
                              {a.aging_bucket && <small>{a.days_past_due} days past due</small>}
                            </td>
                            <td>
                              {a.due_on || 'Not issued'}
                              <small>
                                {a.grace_ends_on
                                  ? `Grace through ${a.grace_ends_on}`
                                  : 'Owner configuration required to issue'}
                              </small>
                            </td>
                            <td>{a.state === 'draft' ? 'Draft' : cents(a.outstanding_cents)}</td>
                            <td>
                              <div className="action-group">
                                {button(`History ${a.number}`, () => open('history', a.invoice_id))}
                                {manage &&
                                  a.state === 'approved_unissued' &&
                                  button(
                                    `Issue ${a.number}`,
                                    () => open('issue_invoice', a.invoice_id),
                                    !policy?.manual_issuance_enabled
                                  )}
                                {manage &&
                                  a.state === 'overdue' &&
                                  policy?.fees_enabled &&
                                  !data.fees.some((f) => f.fee_invoice_id === a.invoice_id) &&
                                  !data.fees.some(
                                    (f) =>
                                      f.invoice_id === a.invoice_id &&
                                      data.invoices.find((i) => i.id === f.fee_invoice_id)?.status !==
                                        'voided'
                                  ) &&
                                  button(`Prepare late fee ${a.number}`, () =>
                                    open('prepare_fee', a.invoice_id)
                                  )}
                                {manage &&
                                  a.issued_on &&
                                  a.state !== 'voided' &&
                                  BigInt(a.outstanding_cents) > 0n &&
                                  button(`Arrange ${a.number}`, () => open('arrangement', a.invoice_id))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p>
                  <Link
                    href={`/billing?organization=${snapshot.organizationId}&property=${selectedProperty}`}
                  >
                    Prepare invoices and review fee drafts in Utilities & billing
                  </Link>
                </p>
                {inProperty(data.fees).length > 0 && (
                  <>
                    <h3>Late fee assessments</h3>
                    {inProperty(data.fees)
                      .filter(
                        (f) =>
                          !customerId ||
                          data.invoices.find((i) => i.id === f.invoice_id)?.customer_id === customerId
                      )
                      .map((f) => (
                        <div className="collection-history-row" key={f.id}>
                          <p>
                            {data.invoices.find((i) => i.id === f.fee_invoice_id)?.number} for{' '}
                            {data.invoices.find((i) => i.id === f.invoice_id)?.number} · Basis{' '}
                            {cents(f.basis_cents)} · Fee {cents(f.fee_cents)} before tax ·{' '}
                            {data.invoices.find((i) => i.id === f.fee_invoice_id)?.status}
                          </p>
                          <p>{f.reason}</p>
                          {data.waivers
                            .filter((w) => w.assessment_id === f.id)
                            .map((w) => (
                              <p key={w.id}>
                                Waiver recorded: {w.reason} · Ledger entry {w.credit_entry_id}
                              </p>
                            ))}
                          {manage &&
                            data.invoices.find((i) => i.id === f.fee_invoice_id)?.status === 'approved' &&
                            button('Record waiver', () => open('waive_fee', f.id))}
                        </div>
                      ))}
                  </>
                )}
              </section>
            </>
          )}
          {tab === 'payments' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Payments & unapplied funds</h2>
                  <p>
                    These are manual staff records. External settlement must be verified through your existing
                    process.
                  </p>
                </div>
                {prepare && (
                  <button className="button primary" onClick={() => open('record_payment')}>
                    <Plus size={16} />
                    Record payment
                  </button>
                )}
              </div>
              {!payments.length ? (
                <Empty title="No payment records">
                  Record a payment after funds have been received. Allocate it separately to one or more
                  issued invoices.
                </Empty>
              ) : (
                payments.map((p) => {
                  const balance = data.summary.payments.find((b) => b.id === p.id);
                  const originalReceipt = data.receipts.find(
                    (r) => r.source_kind === 'payment' && r.source_id === p.id
                  );
                  const events = data.paymentEvents
                    .filter((e) => e.payment_id === p.id)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
                  return (
                    <article className="collection-record" key={p.id}>
                      <div className="panel-heading">
                        <div>
                          <h3>
                            {name(p.customer_id)} · {cents(p.amount_cents)}{' '}
                            {balance?.voided ? '· Voided' : ''}
                          </h3>
                          <p>
                            {p.received_on} · {stateLabel(p.method)} ·{' '}
                            {p.reference || 'No external reference'}
                          </p>
                          <p>
                            Available {cents(balance?.available_cents ?? '0')} · Allocated{' '}
                            {cents(balance?.allocated_cents ?? '0')} · Refunded{' '}
                            {cents(balance?.refunded_cents ?? '0')}
                          </p>
                          <p>{p.notes}</p>
                          {originalReceipt && (
                            <Link className="text-button" href={`/receipts/${originalReceipt.id}`}>
                              Receipt {originalReceipt.number}
                            </Link>
                          )}
                          {p.corrects_payment_id && (
                            <small>Corrects voided payment {p.corrects_payment_id}</small>
                          )}
                        </div>
                        <div className="action-group">
                          {prepare &&
                            !balance?.voided &&
                            BigInt(balance?.available_cents ?? '0') > 0n &&
                            button('Allocate', () => open('allocate_payment', p.id))}
                          {manage &&
                            !balance?.voided &&
                            BigInt(balance?.available_cents ?? '0') > 0n &&
                            button('Record refund', () => open('refund_payment', p.id))}
                          {manage &&
                            !balance?.voided &&
                            button(
                              'Void payment',
                              () => open('void_payment', p.id),
                              balance?.available_cents !== p.amount_cents
                            )}
                        </div>
                      </div>
                      <HistoryTable
                        entries={events.map((e) => ({
                          id: e.id,
                          date: e.effective_on,
                          kind: stateLabel(e.kind),
                          amount: e.amount_cents,
                          reason: e.reason,
                          reference: `${e.reference}${e.invoice_id ? ` · ${data.invoices.find((i) => i.id === e.invoice_id)?.number}` : ''}`,
                          action:
                            manage &&
                            !balance?.voided &&
                            ['allocation', 'refund'].includes(e.kind) &&
                            !events.some((r) => r.reverses_id === e.id)
                              ? () => open('reverse_payment_event', e.id)
                              : undefined,
                        }))}
                      />
                    </article>
                  );
                })
              )}
            </section>
          )}
          {tab === 'deposits' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Deposits held</h2>
                  <p>Held funds are liabilities, separate from invoice income and unapplied payments.</p>
                </div>
                {prepare && button('Open deposit account', () => open('new_deposit'))}
              </div>
              {!deposits.length ? (
                <Empty title="No deposit accounts">
                  Open an account, then record funds received. Stay and reservation notes are references only.
                </Empty>
              ) : (
                deposits.map((d) => {
                  const held = data.summary.deposits.find((b) => b.id === d.id)?.held_cents ?? '0';
                  const events = data.depositEvents
                    .filter((e) => e.deposit_id === d.id)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
                  return (
                    <article className="collection-record" key={d.id}>
                      <div className="panel-heading">
                        <div>
                          <h3>
                            {d.label} · {name(d.customer_id)}
                          </h3>
                          <p>
                            {stateLabel(d.kind)} · Held {cents(held)} · {d.reference}
                          </p>
                          <p>{d.reason}</p>
                        </div>
                        <div className="action-group">
                          {prepare && button('Receive deposit', () => open('deposit_received', d.id))}
                          {manage && BigInt(held) > 0n && (
                            <>
                              {button('Return deposit', () => open('deposit_returned', d.id))}
                              {button('Apply deposit', () => open('deposit_applied', d.id))}
                              {policy?.deposit_deductions_enabled &&
                                button('Deduct deposit', () => open('deposit_deduction', d.id))}
                            </>
                          )}
                        </div>
                      </div>
                      <HistoryTable
                        entries={events.map((e) => ({
                          id: e.id,
                          date: e.effective_on,
                          kind: stateLabel(e.kind),
                          amount: e.amount_cents,
                          reason: e.reason,
                          reference: `${e.reference}${e.invoice_id ? ` · ${data.invoices.find((i) => i.id === e.invoice_id)?.number}` : ''}`,
                          action:
                            manage && e.kind !== 'reversal' && !events.some((r) => r.reverses_id === e.id)
                              ? () => open('reverse_deposit', e.id)
                              : undefined,
                        }))}
                      />
                    </article>
                  );
                })
              )}
            </section>
          )}
          {tab === 'receipts' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Immutable receipts</h2>
                  <p>
                    Saved property and customer details remain as recorded. Open the receipt for its current
                    reversal or payment history.
                  </p>
                </div>
              </div>
              {!receipts.length ? (
                <Empty title="No receipts yet">
                  Receipts are created for payments, refunds, voids, and every deposit movement.
                </Empty>
              ) : (
                <div className="table-wrap" role="region" aria-label="Receipts" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Customer</th>
                        <th>Event</th>
                        <th>Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => (
                        <tr key={r.id}>
                          <th scope="row">
                            {r.number}
                            <small>{r.snapshot.effective_on}</small>
                          </th>
                          <td>{r.snapshot.customer.name}</td>
                          <td>{stateLabel(r.snapshot.kind)}</td>
                          <td>{cents(r.snapshot.amount_cents)}</td>
                          <td>
                            <div className="action-group">
                              <Link className="button secondary" href={`/receipts/${r.id}`}>
                                Open {r.number}
                              </Link>
                              <button
                                className="button secondary"
                                disabled={downloading}
                                onClick={() => download(r.id, r.number)}
                              >
                                <Download size={16} />
                                PDF {r.number}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {tab === 'notes' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Account notes & manual follow-ups</h2>
                  <p>
                    {followups.length} unresolved items due as of {today}. Promises do not reduce outstanding
                    balances.
                  </p>
                </div>
                {prepare && button('Add account note', () => open('note'))}
              </div>
              <p className="alert">
                No reminder messages or legal notices are sent. Review and contact customers through your
                authorized process.
              </p>
              <StaffFollowupWorklist
                notes={notes}
                propertyId={selectedProperty}
                today={today}
                customerName={name}
                canResolve={note => note.kind === 'arrangement' ? !!manage : !!prepare}
                onResolve={id => open('resolve', id)}
              />
              {!notes.length ? (
                <Empty title="No account notes">
                  Record a note and optional follow-up date, or open an issued invoice to record a payment
                  arrangement.
                </Empty>
              ) : (
                notes
                  .slice()
                  .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
                  .map((n) => {
                    const resolution = notes.find((r) => r.resolves_id === n.id);
                    const due = followups.some((f) => f.id === n.id);
                    return (
                      <article className="collection-history-row" key={n.id}>
                        <h3>
                          {name(n.customer_id)} · {stateLabel(n.kind)}
                          {due ? ' · Follow-up due' : ''}
                          {resolution ? ' · Resolved' : ''}
                        </h3>
                        <p className="preserve-lines">{n.body}</p>
                        <small>
                          {n.created_at} · Recorded by {n.created_by}
                        </small>
                        {n.follow_up_on && <p>Manual follow-up: {n.follow_up_on}</p>}
                        {n.promised_on && (
                          <p>
                            Promise: {cents(n.promised_amount_cents ?? '0')} on {n.promised_on} ·{' '}
                            {data.invoices.find((i) => i.id === n.invoice_id)?.number}
                          </p>
                        )}
                        {n.kind !== 'resolution' &&
                          !resolution &&
                          ((n.kind === 'arrangement' && manage) || (n.kind === 'note' && prepare)) &&
                          button('Resolve follow-up', () => open('resolve', n.id))}
                      </article>
                    );
                  })
              )}
            </section>
          )}
          {tab === 'reconciliation' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Manual statement reconciliation</h2>
                  <p>
                    Match selected recorded cash movements to your statement or cash journal. Reconciliation
                    covers the whole property and ignores the customer filter.
                  </p>
                </div>
                <div className="action-group">
                  {button('Export unmatched cash', () => exportRows('cash'))}
                  {manage && button('Review reconciliation', () => open('reconcile'))}
                </div>
              </div>
              <p className="alert">
                {inProperty(data.summary.cash).length} unmatched movements. Allocations and deposit
                applications move no cash. A recorded variance remains an unresolved discrepancy.
              </p>
              {inProperty(data.reconciliations).map((r) => {
                const voided = data.reconciliationVoids.some((v) => v.reconciliation_id === r.id);
                return (
                  <article className="collection-history-row" key={r.id}>
                    <h3>
                      {r.starts_on} → {r.ends_on} (exclusive) · {stateLabel(r.method)} ·{' '}
                      {voided ? 'Voided' : 'Reviewed'}
                    </h3>
                    <p>
                      {r.statement_reference} · Matched {cents(r.net_cents)} · Variance{' '}
                      {cents(r.variance_cents)}
                      {BigInt(r.variance_cents) !== 0n ? ' · Unresolved discrepancy' : ''}
                    </p>
                    <div className="action-group">
                      {button('View reconciliation', () => open('reconciliation_detail', r.id))}
                      {owner &&
                        active &&
                        !voided &&
                        button('Void reconciliation', () => open('void_reconciliation', r.id))}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {tab === 'policy' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Collections policy</h2>
                  <p>Only organization owners and administrators can authorize these settings.</p>
                </div>
                {owner && active && button('Configure collections', () => open('configure_collections'))}
              </div>
              <p>
                Manual issuance {policy?.manual_issuance_enabled ? 'enabled' : 'disabled'} · Grace{' '}
                {policy?.grace_days ?? 0} days · Manual late fees{' '}
                {policy?.fees_enabled ? 'enabled' : 'disabled'} · Deposit deductions{' '}
                {policy?.deposit_deductions_enabled ? 'enabled' : 'disabled'}
              </p>
              {policy && (
                <>
                  <p>
                    Fee: {cents(policy.fee_flat_cents)} + {policy.fee_bps} basis points, capped at{' '}
                    {cents(policy.fee_cap_cents)} before {policy.fee_tax_bps} basis points of configured tax.
                  </p>
                  <p>Authorization: {policy.authorization_reference}</p>
                  <p>{policy.reason}</p>
                </>
              )}
              <p className="alert">
                Automated late fees, outbound notices and online payment processing are disabled. Tenant funds
                and ForgeOS subscription billing have no active processor connection.
              </p>
              <h3>Policy history</h3>
              {inProperty(data.policies)
                .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
                .map((p) => (
                  <div className="collection-history-row" key={p.id}>
                    <p>
                      {p.created_at} · Grace {p.grace_days} days · Issuance{' '}
                      {p.manual_issuance_enabled ? 'enabled' : 'disabled'} · Fees{' '}
                      {p.fees_enabled ? 'enabled' : 'disabled'} · Deductions{' '}
                      {p.deposit_deductions_enabled ? 'enabled' : 'disabled'}
                    </p>
                    <p>
                      {p.authorization_reference} · {p.reason}
                    </p>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
      {renderEditor()}
    </div>
  );
}
function decimal(value = '0') {
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
export function CashTable({ sources, name }: { sources: CashSource[]; name: (id: string) => string }) {
  return (
    <div className="table-wrap" role="region" aria-label="Matched cash movements" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Date / source</th>
            <th>Customer / method</th>
            <th>Cash movement</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.source_key}>
              <th scope="row">
                {s.effective_on}
                <small>{s.label}</small>
              </th>
              <td>
                {name(s.customer_id)}
                <small>{stateLabel(s.method)}</small>
              </td>
              <td>{cents(s.amount_cents)}</td>
              <td>
                {s.reference || 'None'}
                <small className="record-id">{s.source_key}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function HistoryTable({
  entries,
}: {
  entries: {
    id: string;
    date: string;
    kind: string;
    amount: string;
    reason: string;
    reference: string;
    action?: () => void;
  }[];
}) {
  if (!entries.length) return <p>No movements recorded.</p>;
  return (
    <div className="table-wrap" role="region" aria-label="Financial event history" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Date / event</th>
            <th>Amount</th>
            <th>Reason / reference</th>
            <th>Correction</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <th scope="row">
                {e.date}
                <small>{e.kind}</small>
              </th>
              <td>{cents(e.amount)}</td>
              <td>
                {e.reason}
                <small>{e.reference}</small>
              </td>
              <td>
                {e.action && (
                  <button className="button secondary" onClick={e.action}>
                    Reverse event
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
