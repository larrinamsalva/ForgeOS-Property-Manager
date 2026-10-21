import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  cents,
  dollarsToCents,
  ledgerBalance,
  type Invoice,
  type InvoiceRevision,
  type Calculation,
} from '../../src/lib/billing-domain';
import { billingCommandSchema, billingError } from '../../src/lib/billing-validation';
import { invoicePdf, StatementCharacterError } from '../../src/lib/invoice-pdf';
const id = '10000000-0000-4000-8000-000000000001';
const calculation: Calculation = {
  currency: 'USD',
  starts_on: '2024-02-01',
  ends_on: '2024-03-01',
  due_on: '2024-03-15',
  property: {
    id,
    name: 'Pine Creek RV Park',
    address: '123 Fictional Lane',
    city: 'Corning',
    state: 'CA',
    postal_code: '00000',
    timezone: 'America/Los_Angeles',
  },
  customer: {
    id,
    name: 'José Núñez (fictional)',
    mailing_address: '456 Example Avenue\nCorning, CA 00000',
    email: 'sample@example.com',
  },
  site: { id, label: 'RV-12' },
  lines: [
    {
      category: 'rent',
      description: 'Monthly rent',
      quantity: '29',
      unit: 'days',
      subtotal_cents: '65000',
      tax_bps: 0,
      tax_cents: '0',
      total_cents: '65000',
      source: {
        starts_on: '2024-02-01',
        ends_on: '2024-03-01',
        agreed_rate_cents: '65000',
        billing_period: 'monthly',
        proration: 'actual_calendar_days',
      },
    },
  ],
  subtotal_cents: '65000',
  tax_cents: '0',
  total_cents: '65000',
  reading_ids: [],
  rate_ids: [],
  rounding: 'Each line rounds half away from zero to cents; tax rounds on that line subtotal.',
  utilities_reason: 'Utilities billed separately after approved readings.',
  rent_reason: '',
};
const invoice: Invoice = {
  organization_id: id,
  id,
  property_id: id,
  customer_id: id,
  site_id: id,
  stay_id: id,
  number: 'INV-000001',
  starts_on: calculation.starts_on,
  ends_on: calculation.ends_on,
  due_on: calculation.due_on,
  status: 'draft',
  current_revision_id: id,
  approval_reason: '',
  approved_at: null,
  approved_by: null,
  void_reason: '',
  created_at: '2024-03-01T12:00:00Z',
};
const revision: InvoiceRevision = {
  id,
  invoice_id: id,
  property_id: id,
  revision: 1,
  calculation,
  total_cents: '65000',
  reason: 'Initial calculation',
  created_at: invoice.created_at,
};
describe('billing input, money and statements', () => {
  it('formats and parses monetary strings with integer arithmetic', () => {
    expect(cents('999999999999')).toBe('$9,999,999,999.99');
    expect(cents('-1001')).toBe('-$10.01');
    expect(cents('0')).toBe('$0.00');
    expect(dollarsToCents('1234567.89')).toBe('123456789');
    for (const input of ['1e2', '0.001', 'NaN', '-1', '12,000'])
      expect(() => dollarsToCents(input)).toThrow();
    expect(ledgerBalance([])).toBe('0');
  });
  it('rejects unknown invoice states, actor fields, floating-point cents and invalid dates', () => {
    const input = {
      command: 'credit',
      payload: {
        organization_id: id,
        property_id: id,
        request_id: id,
        invoice_id: id,
        revision_id: id,
        reason: 'Authorized concession',
        amount_cents: '1001',
        reference: 'TEST',
      },
    };
    expect(billingCommandSchema.safeParse(input).success).toBe(true);
    for (const changes of [
      { amount_cents: 10.01 },
      { created_by: id },
      { status: 'paid' },
      { amount_cents: '1e3' },
    ])
      expect(
        billingCommandSchema.safeParse({ ...input, payload: { ...input.payload, ...changes } }).success
      ).toBe(false);
    expect(billingError('P0001', 'invoice_sources_changed').status).toBe(409);
    expect(billingError('42501', 'private detail').status).toBe(403);
    expect(billingError('unknown', 'secret host connection').error).not.toContain('secret');
  });
  it('creates a paginated statement with exact amounts and preserves supported accented names', async () => {
    const longCalculation = structuredClone(calculation);
    longCalculation.lines = Array.from({ length: 32 }, (_, index) => ({
      ...calculation.lines[0],
      description: `Reviewed rent segment ${index + 1} with a long but complete description`,
      subtotal_cents: '2031',
      total_cents: '2031',
      source: {
        ...calculation.lines[0].source,
        reason:
          'Fictional authorization reference ABC-123. Preserve the original agreement and calendar day calculation.',
      },
    }));
    longCalculation.subtotal_cents = '64992';
    longCalculation.total_cents = '64992';
    const bytes = await invoicePdf(
      invoice,
      { ...revision, calculation: longCalculation, total_cents: '64992' },
      []
    );
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
    if (process.env.FORGEOS_PDF_QA_PATH) {
      await mkdir(dirname(process.env.FORGEOS_PDF_QA_PATH), { recursive: true });
      await writeFile(process.env.FORGEOS_PDF_QA_PATH, bytes);
    }
  });
  it('reports unsupported PDF characters instead of silently changing customer names', async () => {
    await expect(
      invoicePdf(
        invoice,
        { ...revision, calculation: { ...calculation, customer: { ...calculation.customer, name: '测试' } } },
        []
      )
    ).rejects.toBeInstanceOf(StatementCharacterError);
  });
});
