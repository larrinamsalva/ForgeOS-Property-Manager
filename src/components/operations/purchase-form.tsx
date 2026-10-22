'use client';
import { useState } from 'react';
import { RecordForm, type Field } from '../record-form';
import { collectionDollars } from '@/lib/collections-domain';
import { quantityToMilli } from '@/lib/operations-domain';
import { cents } from '@/lib/billing-domain';
import type { OpsUI } from './types';
const blank = () => ({
  key: crypto.randomUUID(),
  item_id: '',
  quantity: '1',
  unit_cost: '0.00',
  purchase_request_id: '',
});
export function PurchaseForm({
  ui,
  onSave,
  onCancel,
}: {
  ui: OpsUI;
  onSave: (v: Record<string, unknown>) => Promise<unknown>;
  onCancel: () => void;
}) {
  const { data, propertyId, today } = ui;
  const [lines, setLines] = useState(() => [blank()]),
    [pending, setPending] = useState(false);
  const items = data.items.filter((i) => i.property_id === propertyId && !i.archived);
  const requests = data.requests.filter(
    (r) =>
      r.property_id === propertyId &&
      r.status === 'approved' &&
      !data.lines.some(
        (l) =>
          l.request_id === r.id &&
          data.orders.find((o) => o.id === l.purchase_order_id)?.status !== 'cancelled'
      )
  );
  const fields: Field[] = [
    {
      name: 'supplier_id',
      label: 'Supplier',
      type: 'select',
      required: true,
      options: data.suppliers
        .filter((s) => s.property_id === propertyId && !s.archived)
        .map((s) => ({ value: s.id, label: s.name })),
    },
    { name: 'expected_on', label: 'Expected delivery (optional)', type: 'date', default: today },
    { name: 'reference', label: 'Internal purchase reference' },
    { name: 'reason', label: 'Purchase justification', type: 'textarea', required: true },
  ];
  function update(index: number, patch: Partial<ReturnType<typeof blank>>) {
    setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function preview(row: ReturnType<typeof blank>) {
    try {
      return cents(
        (BigInt(quantityToMilli(row.quantity)) * BigInt(collectionDollars(row.unit_cost)) + 500n) / 1000n
      );
    } catch {
      return 'Check quantity / cost';
    }
  }
  return (
    <>
      <p>
        Prepare an internal purchase order. Manager approval and a separate manual “Record order placed”
        action are required. ForgeOS does not send orders or pay suppliers.
      </p>
      <fieldset disabled={pending} className="ops-purchase-lines">
        <legend>Order lines</legend>
        {lines.map((line, index) => (
          <section className="ops-line form-grid" key={line.key}>
            <div className="field">
              <label htmlFor={`po-request-${index}`}>Approved request {index + 1} (optional)</label>
              <select
                id={`po-request-${index}`}
                value={line.purchase_request_id}
                onChange={(e) => {
                  const r = requests.find((r) => r.id === e.target.value);
                  const item = items.find((i) => i.id === r?.item_id);
                  update(index, {
                    purchase_request_id: r?.id ?? '',
                    ...(r
                      ? {
                          item_id: r.item_id,
                          quantity: quantityFrom(r.quantity_milli),
                          unit_cost: decimal(item?.unit_cost_cents),
                        }
                      : {}),
                  });
                }}
              >
                <option value="">No linked request</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {items.find((i) => i.id === r.item_id)?.name} · {quantityFrom(r.quantity_milli)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`po-item-${index}`}>Item {index + 1}</label>
              <select
                id={`po-item-${index}`}
                value={line.item_id}
                disabled={!!line.purchase_request_id}
                onChange={(e) =>
                  update(index, {
                    item_id: e.target.value,
                    unit_cost: decimal(items.find((i) => i.id === e.target.value)?.unit_cost_cents),
                  })
                }
              >
                <option value="">Choose…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku} · {i.name} ({i.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`po-quantity-${index}`}>Quantity {index + 1}</label>
              <input
                id={`po-quantity-${index}`}
                value={line.quantity}
                disabled={!!line.purchase_request_id}
                onChange={(e) => update(index, { quantity: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label htmlFor={`po-cost-${index}`}>Unit cost {index + 1} ($)</label>
              <input
                id={`po-cost-${index}`}
                value={line.unit_cost}
                onChange={(e) => update(index, { unit_cost: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <p>Line total {preview(line)}</p>
            {lines.length > 1 && (
              <button
                className="button secondary"
                type="button"
                onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove line {index + 1}
              </button>
            )}
          </section>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={lines.length >= 30}
          onClick={() => setLines((rows) => [...rows, blank()])}
        >
          Add order line
        </button>
      </fieldset>
      <RecordForm
        fields={fields}
        submit="Prepare purchase order"
        onCancel={onCancel}
        onSave={async (v) => {
          const result = {
            ...v,
            expected_on: v.expected_on || null,
            lines: lines.map((l) => ({
              item_id: l.item_id,
              quantity_milli: quantityToMilli(l.quantity),
              unit_cost_cents: collectionDollars(l.unit_cost),
              purchase_request_id: l.purchase_request_id || null,
            })),
          };
          setPending(true);
          try {
            await onSave(result);
          } catch (e) {
            setPending(false);
            throw e;
          }
        }}
      />
    </>
  );
}
const decimal = (value = '0') =>
  `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;
const quantityFrom = (value: string) =>
  `${BigInt(value) / 1000n}${BigInt(value) % 1000n ? '.' + (BigInt(value) % 1000n).toString().padStart(3, '0').replace(/0+$/, '') : ''}`;
