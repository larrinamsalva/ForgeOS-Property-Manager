'use client';
import { useState } from 'react';
import { cents } from '@/lib/billing-domain';
import {
  collectionDollars,
  paymentMethods,
  stateLabel,
  type CashSource,
  type ReconciliationPreview,
} from '@/lib/collections-domain';
import { addDays } from '@/lib/domain';
import { RecordForm, type Field } from './record-form';
export function ReconciliationForm({
  today,
  owner,
  sources,
  customerName,
  preview,
  onSave,
  onCancel,
}: {
  today: string;
  owner: boolean;
  sources: CashSource[];
  customerName: (id: string) => string;
  preview: (v: Record<string, unknown>) => Promise<{ preview: ReconciliationPreview }>;
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<{
      payload: Record<string, unknown>;
      snapshot: ReconciliationPreview;
    } | null>(null);
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const fields: Field[] = [
    {
      name: 'starts_on',
      label: 'Statement period start',
      type: 'date',
      default: addDays(today, -30),
      required: true,
    },
    {
      name: 'ends_on',
      label: 'Statement period end (exclusive)',
      type: 'date',
      default: addDays(today, 1),
      max: addDays(today, 1),
      required: true,
    },
    {
      name: 'method',
      label: 'Reconcile method',
      type: 'select',
      options: [{ value: 'all', label: 'All methods' }, ...paymentMethods],
      default: 'all',
      required: true,
    },
    { name: 'opening', label: 'Opening statement balance ($)', default: '0.00', required: true },
    { name: 'closing', label: 'Closing statement balance ($)', default: '0.00', required: true },
    { name: 'statement_reference', label: 'Statement / cash journal reference', required: true },
    { name: 'reason', label: 'Review notes', type: 'textarea', required: true },
    ...(owner
      ? [
          {
            name: 'acknowledge_variance',
            label: 'Acknowledge a nonzero variance as an unresolved discrepancy',
            type: 'checkbox' as const,
          },
          {
            name: 'variance_reason',
            label: 'Variance explanation (required if nonzero)',
            type: 'textarea' as const,
          },
        ]
      : []),
  ];
  async function showPreview(values: Record<string, unknown>) {
    const payload = {
      starts_on: values.starts_on,
      ends_on: values.ends_on,
      method: values.method,
      opening_cents: collectionDollars(String(values.opening), true),
      closing_cents: collectionDollars(String(values.closing), true),
      source_keys: selected,
    };
    const result = await preview(payload);
    setReview({
      payload: {
        ...payload,
        statement_reference: values.statement_reference,
        reason: values.reason,
        acknowledge_variance: values.acknowledge_variance ?? false,
        variance_reason: values.variance_reason ?? '',
      },
      snapshot: result.preview,
    });
    setError('');
  }
  async function confirm() {
    if (!review || pending) return;
    setPending(true);
    setError('');
    try {
      await onSave(review.payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconciliation unavailable.');
      setPending(false);
    }
  }
  if (review)
    return (
      <div>
        <p>Compare this preview with your external statement before recording the reviewed batch.</p>
        <dl className="collection-review">
          <dt>Period</dt>
          <dd>
            {review.snapshot.starts_on} → {review.snapshot.ends_on} (exclusive)
          </dd>
          <dt>Opening balance</dt>
          <dd>{cents(review.snapshot.opening_cents)}</dd>
          <dt>Selected cash movement</dt>
          <dd>{cents(review.snapshot.net_cents)}</dd>
          <dt>Expected closing</dt>
          <dd>{cents(review.snapshot.expected_closing_cents)}</dd>
          <dt>Statement closing</dt>
          <dd>{cents(review.snapshot.closing_cents)}</dd>
          <dt>Unresolved variance</dt>
          <dd>{cents(review.snapshot.variance_cents)}</dd>
        </dl>
        <p>
          {review.snapshot.source_count} selected movements; {review.snapshot.carried_forward_count} are
          unmatched items carried forward from before this period.
        </p>
        <ul>
          {review.snapshot.sources.map((s) => (
            <li key={s.source_key}>
              {s.effective_on} · {s.label} · {customerName(s.customer_id)} · {cents(s.amount_cents)} ·{' '}
              {s.reference || 'No reference'}
            </li>
          ))}
        </ul>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button className="button secondary" disabled={pending} onClick={() => setReview(null)}>
            Edit selection
          </button>
          <button className="button primary" disabled={pending} onClick={confirm}>
            {pending ? 'Saving…' : 'Record reviewed reconciliation'}
          </button>
        </div>
      </div>
    );
  return (
    <>
      <p>
        Select cash movements matched to your statement. Older unmatched entries may be carried forward. An
        item can belong to only one active reconciliation.
      </p>
      <div
        className="table-wrap collection-source-list"
        role="region"
        aria-label="Unmatched cash selection"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Date / event</th>
              <th>Customer / method</th>
              <th>Amount / reference</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source_key}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Match ${s.label} ${s.source_key}`}
                    checked={selected.includes(s.source_key)}
                    disabled={!selected.includes(s.source_key) && selected.length >= 1000}
                    onChange={(e) =>
                      setSelected((keys) =>
                        e.target.checked ? [...keys, s.source_key] : keys.filter((k) => k !== s.source_key)
                      )
                    }
                  />
                </td>
                <th scope="row">
                  {s.effective_on}
                  <small>{s.label}</small>
                </th>
                <td>
                  {customerName(s.customer_id)}
                  <small>{stateLabel(s.method)}</small>
                </td>
                <td>
                  {cents(s.amount_cents)}
                  <small>{s.reference}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sources.length && <p>No unmatched cash movements.</p>}
      </div>
      <p>{selected.length} selected (maximum 1,000).</p>
      <RecordForm fields={fields} submit="Preview reconciliation" onCancel={onCancel} onSave={showPreview} />
    </>
  );
}
