import { describe, it, expect } from 'vitest';
import {
  quantity,
  quantityToMilli,
  checklistState,
  purchaseState,
  operationAlerts,
  type OperationsSnapshot,
  type ChecklistEntry,
  type PurchaseOrder,
  type PurchaseLine,
} from '../../src/lib/operations-domain';
import { operationsCommandSchema, operationsError } from '../../src/lib/operations-validation';
const id = '10000000-0000-4000-8000-000000000001';
describe('operations units, states and validation', () => {
  it('preserves exact fractional and large stock quantities', () => {
    expect(quantityToMilli('999999999.999')).toBe('999999999999');
    expect(quantityToMilli('-0.125', true)).toBe('-125');
    expect(quantity('-125')).toBe('-0.125');
    expect(quantity('9999999999990000')).toBe('9999999999990');
    for (const v of ['1.0001', '1e3', '-1', 'abc']) expect(() => quantityToMilli(v)).toThrow();
  });
  it('rejects raw stock overwrites, forged actors and invalid precise quantities', () => {
    const input = {
      command: 'use_material',
      payload: {
        organization_id: id,
        property_id: id,
        request_id: id,
        reason: 'Authorized work materials',
        work_order_id: id,
        item_id: id,
        quantity_milli: '1250',
        effective_on: '2026-10-21',
        reference: '',
      },
    };
    expect(operationsCommandSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { created_by: id },
      { quantity_milli: 1.25 },
      { quantity_milli: '0' },
      { quantity_milli: '1.5' },
      { balance: '1000' },
    ])
      expect(
        operationsCommandSchema.safeParse({ ...input, payload: { ...input.payload, ...patch } }).success
      ).toBe(false);
    expect(operationsError('P0001', 'insufficient_stock').status).toBe(409);
    expect(operationsError('42501', '').status).toBe(403);
  });
  it('derives partial/complete purchase receipt state from net quantities', () => {
    const order = { id, status: 'ordered' } as PurchaseOrder,
      lines = [{ id: 'line', purchase_order_id: id, quantity_milli: '3000' } as PurchaseLine];
    expect(purchaseState(order, lines, [{ id: 'line', received_milli: '1000' }])).toBe('part_received');
    expect(purchaseState(order, lines, [{ id: 'line', received_milli: '3000' }])).toBe('received');
    expect(purchaseState(order, lines, [{ id: 'line', received_milli: '0' }])).toBe('ordered');
  });
  it('uses the latest retained checklist result including manager reopen', () => {
    const entries = [
      { id: 'a', run_id: id, item_key: 'item-1', status: 'done', created_at: '2026-10-21T10:00:00Z' },
      { id: 'b', run_id: id, item_key: 'item-1', status: 'reopen', created_at: '2026-10-21T11:00:00Z' },
    ] as ChecklistEntry[];
    expect(checklistState(entries, id, 'item-1')?.status).toBe('reopen');
    expect(entries[0].status).toBe('done');
  });
  it('scopes due-work, checklist, service and stock alerts to the selected property', () => {
    const snapshot = {
      work: [{ id: 'w', property_id: id, number: 'WO-01', status: 'scheduled', due_on: '2026-10-20' }],
      items: [{ id: 'i', property_id: id, sku: 'PVC', unit: 'each', reorder_milli: '2000', archived: false }],
      summary: { stock: [{ id: 'i', quantity_milli: '1000' }] },
      runs: [],
      equipment: [],
      loans: [],
    } as unknown as OperationsSnapshot;
    expect(operationAlerts(snapshot, id, '2026-10-21')).toHaveLength(2);
    expect(operationAlerts(snapshot, 'another-property', '2026-10-21')).toEqual([]);
  });
});
