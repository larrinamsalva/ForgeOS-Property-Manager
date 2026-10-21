import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  agingTotals,
  collectionDollars,
  openFollowups,
  type CollectionAccount,
  type ReceiptStatement,
  type AccountNote,
} from '../../src/lib/collections-domain';
import { collectionsCommandSchema, collectionsError } from '../../src/lib/collections-validation';
import { receiptPdf } from '../../src/lib/receipt-pdf';
import { StatementCharacterError } from '../../src/lib/invoice-pdf';
import {
  tenantCollectionProcessor,
  forgeOsSubscriptionProcessor,
  paymentProcessingStatus,
} from '../../src/lib/payment-processing';
const id = '10000000-0000-4000-8000-000000000001';
const receipt: ReceiptStatement = {
  receipt: {
    id,
    organization_id: id,
    property_id: id,
    customer_id: id,
    number: 'RCT-000001',
    source_kind: 'payment',
    source_id: id,
    created_at: '2026-10-21T12:00:00Z',
    created_by: id,
    snapshot: {
      currency: 'USD',
      kind: 'payment_received',
      amount_cents: '85000',
      effective_on: '2026-10-21',
      method: 'check',
      reference: 'Fictional check 1234',
      notes: 'Fictional manual payment received by the office.',
      source: { id },
      property: {
        name: 'Pine Creek RV Park',
        address: '123 Fictional Lane',
        city: 'Corning',
        state: 'CA',
        postal_code: '00000',
      },
      customer: {
        name: 'José Núñez (fictional)',
        mailing_address: '456 Example Avenue\nCorning, CA 00000',
        email: 'sample@example.com',
      },
    },
  },
  history: [],
  available_cents: '85000',
  voided: false,
};
describe('collections boundaries and representations', () => {
  it('uses exact bounded cent parsing and aggregate aging beyond safe JavaScript numbers', () => {
    expect(collectionDollars('9999999999.99')).toBe('999999999999');
    expect(collectionDollars('-12.3', true)).toBe('-1230');
    for (const value of ['-1', '1.001', '1e6', '0x10', '10000000000.00'])
      expect(() => collectionDollars(value)).toThrow();
    const a = { aging_bucket: '90_plus', outstanding_cents: '999999999999' } as CollectionAccount;
    expect(agingTotals(Array.from({ length: 10000 }, () => a))['90_plus']).toBe(9999999999990000n);
  });
  it('strictly rejects raw card data, unknown processor actions and imprecise JSON money', () => {
    const input = {
      command: 'record_payment',
      payload: {
        organization_id: id,
        property_id: id,
        request_id: id,
        customer_id: id,
        amount_cents: '1234',
        received_on: '2026-10-21',
        method: 'external_card',
        reference: 'External transaction 001',
        corrects_payment_id: null,
        reason: 'Recorded after external confirmation',
      },
    };
    expect(collectionsCommandSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { card_number: '4111111111111111' },
      { cvv: '123' },
      { amount_cents: 1234 },
      { amount_cents: '0' },
      { amount_cents: '1.5' },
    ])
      expect(
        collectionsCommandSchema.safeParse({ ...input, payload: { ...input.payload, ...extra } }).success
      ).toBe(false);
    expect(collectionsCommandSchema.safeParse({ ...input, command: 'charge_card' }).success).toBe(false);
    expect(collectionsError('P0001', 'allocation_exceeds_balance').status).toBe(409);
    expect(collectionsError('42501', '').status).toBe(403);
    expect(tenantCollectionProcessor()).toBeNull();
    expect(forgeOsSubscriptionProcessor()).toBeNull();
    expect(Object.values(paymentProcessingStatus).every((s) => s === 'disabled')).toBe(true);
  });
  it('keeps manual followups due until a linked resolution without reducing balances', () => {
    const note = {
      id,
      kind: 'note',
      follow_up_on: '2026-10-21',
      promised_on: null,
      resolves_id: null,
    } as AccountNote;
    const promise = {
      ...note,
      id: 'promise',
      kind: 'arrangement',
      follow_up_on: null,
      promised_on: '2026-10-22',
    } as AccountNote;
    expect(openFollowups([note, promise], '2026-10-21').map((n) => n.id)).toEqual([id]);
    expect(
      openFollowups(
        [note, promise, { id: 'resolved', kind: 'resolution', resolves_id: id } as AccountNote],
        '2026-10-22'
      ).map((n) => n.id)
    ).toEqual(['promise']);
  });
  it('produces complete PDF receipts and paginated correction history with embedded fonts', async () => {
    const simple = await receiptPdf(receipt);
    expect((await PDFDocument.load(simple)).getPageCount()).toBe(1);
    const long: ReceiptStatement = {
      ...receipt,
      voided: true,
      available_cents: '0',
      history: Array.from({ length: 24 }, (_, i) => ({
        id: `event-${i + 1}`,
        property_id: id,
        customer_id: id,
        payment_id: id,
        invoice_id: id,
        kind: 'allocation',
        amount_cents: '1000',
        effective_on: '2026-10-21',
        method: null,
        reverses_id: null,
        reference: `Fictional reference ${i + 1} ${'ABC123'.repeat(20)}`,
        reason:
          'Retained original allocation evidence and staff authorization for this fictional customer account.',
        created_at: '2026-10-21T13:00:00Z',
        created_by: id,
      })),
    };
    const bytes = await receiptPdf(long);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
    if (process.env.FORGEOS_RECEIPT_QA_DIR) {
      await mkdir(process.env.FORGEOS_RECEIPT_QA_DIR, { recursive: true });
      await writeFile(`${process.env.FORGEOS_RECEIPT_QA_DIR}/receipt.pdf`, simple);
      await writeFile(`${process.env.FORGEOS_RECEIPT_QA_DIR}/receipt-history.pdf`, bytes);
    }
  });
  it('uses a printable receipt fallback when PDF cannot preserve a name', async () => {
    await expect(
      receiptPdf({
        ...receipt,
        receipt: {
          ...receipt.receipt,
          snapshot: {
            ...receipt.receipt.snapshot,
            customer: { ...receipt.receipt.snapshot.customer, name: '测试' },
          },
        },
      })
    ).rejects.toBeInstanceOf(StatementCharacterError);
  });
});
