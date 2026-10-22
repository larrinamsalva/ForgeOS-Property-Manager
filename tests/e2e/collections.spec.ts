import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { addDays, dateAtProperty } from '../../src/lib/domain';
import type { CollectionsSnapshot } from '../../src/lib/collections-domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';
const origin = 'http://127.0.0.1:3100';
let seed: { org: string; property: string; customerId: string; stayId: string };
const today = () => dateAtProperty('America/Los_Angeles');
const scope = () => ({ organization_id: seed.org, property_id: seed.property });
async function login(page: Page, name = 'owner') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@forgeos.example`);
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
async function collections(page: Page) {
  await page.goto(`/collections?organization=${seed.org}&property=${seed.property}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Payments & collections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload collections' })).toBeEnabled();
}
async function api(page: Page, command: string, values: Record<string, unknown>, path = 'collections') {
  const response = await page.request.post(`/api/${path}`, {
    headers: { origin },
    data: {
      command,
      payload: {
        ...scope(),
        request_id: randomUUID(),
        ...(command === 'create_draft' ? {} : { reason: 'Fictional authorized test' }),
        ...values,
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response;
}
async function submit(page: Page, label: string) {
  const wait = page.waitForResponse(
    (r) => r.url().endsWith('/api/collections') && r.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  const response = await wait;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload collections' })).toBeEnabled();
  return response;
}
async function reason(page: Page, value = 'Fictional reviewed manual record') {
  await page.getByRole('textbox', { name: 'Reason / supporting record', exact: true }).fill(value);
}
async function policy(page: Page) {
  await page.getByRole('button', { name: 'Collections policy', exact: true }).click();
  await page.getByRole('button', { name: 'Configure collections', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable explicit manual invoice issuance', exact: true }).check();
  await page
    .getByRole('textbox', { name: 'Contract / jurisdiction review reference', exact: true })
    .fill('Fictional owner review 001');
  await reason(page);
  await submit(page, 'Save collections policy');
}
async function invoice(page: Page) {
  await api(
    page,
    'configure_policy',
    {
      proration: 'actual_calendar_days',
      due_days: 15,
      rent_tax_bps: 0,
      tax_label: '',
      authorization_reference: '',
    },
    'billing'
  );
  const i = (
    await (
      await api(
        page,
        'create_draft',
        {
          stay_id: seed.stayId,
          starts_on: addDays(today(), -3),
          ends_on: addDays(today(), -2),
          due_on: today(),
          rent_mode: 'none',
          manual_rent_cents: null,
          rent_reason: 'Separate fictional charge',
          include_utilities: false,
          utilities_reason: 'No utility charge in this test',
          accept_estimates: false,
          adjustments: [
            {
              kind: 'fee',
              description: 'Fictional agreed service',
              amount_cents: '10000',
              reason: 'Authorized fictional service',
              tax_bps: 0,
              tax_label: '',
              authorization_reference: '',
            },
          ],
        },
        'billing'
      )
    ).json()
  ).id as string;
  const billing = (await (
    await page.request.get(`/api/billing?organization=${seed.org}`)
  ).json()) as BillingSnapshot;
  const row = billing.invoices.find((r) => r.id === i)!;
  await api(page, 'approve_invoice', { invoice_id: i, revision_id: row.current_revision_id }, 'billing');
  return row;
}
async function recordPayment(page: Page, value = '150.00') {
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(seed.customerId);
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill(value);
  await reason(page);
  return submit(page, 'Record payment');
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
  seed = await (await request.post('http://127.0.0.1:54331/__test/seed')).json();
});
test('manual payments, deposits, receipts and reconciliation reach the same issued balance', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Full financial lifecycle runs once.');
  await login(page);
  const i = await invoice(page);
  await collections(page);
  await policy(page);
  await page.getByRole('button', { name: 'Invoices & aging', exact: true }).click();
  await page.getByRole('button', { name: `Issue ${i.number}`, exact: true }).click();
  await reason(page);
  await submit(page, 'Mark invoice issued');
  const p = await (await recordPayment(page)).json();
  expect(p.receipt_id).toBeTruthy();
  await page.getByRole('button', { name: 'Allocate', exact: true }).click();
  await page.getByRole('combobox', { name: 'Invoice', exact: true }).selectOption(i.id);
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill('60.00');
  await reason(page);
  await submit(page, 'Allocate payment');
  await expect(page.getByText('Available $90.00 · Allocated $60.00 · Refunded $0.00')).toBeVisible();
  await page.getByRole('button', { name: 'Deposits', exact: true }).click();
  await page.getByRole('button', { name: 'Open deposit account', exact: true }).click();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(seed.customerId);
  await reason(page);
  await submit(page, 'Open deposit account');
  for (const [button, value] of [
    ['Receive deposit', '80.00'],
    ['Apply deposit', '40.00'],
    ['Return deposit', '40.00'],
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill(value);
    if (button === 'Apply deposit')
      await page.getByRole('combobox', { name: 'Invoice', exact: true }).selectOption(i.id);
    await reason(page);
    await submit(page, 'Record deposit event');
  }
  await expect(page.getByText('Security · Held $0.00 ·')).toBeVisible();
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('button', { name: 'Record refund', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill('90.00');
  await reason(page);
  await submit(page, 'Record payment refund');
  await page.getByRole('button', { name: 'Invoices & aging', exact: true }).click();
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader').filter({ hasText: i.number }) });
  await expect(row).toContainText('Paid');
  await expect(row).toContainText('$0.00');
  await page.getByRole('button', { name: `History ${i.number}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Approved charges after credits $100.00 · Allocated $100.00'
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  const statement = await page.request.get(`/invoices/${i.id}`);
  expect(await statement.text()).toContain('Current outstanding');
  expect(await statement.text()).toContain('Payment &amp; deposit history');
  await page.getByRole('button', { name: 'Receipts', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF RCT-000001', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('RCT-000001.pdf');
  await page.getByRole('link', { name: 'Open RCT-000001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect(page.getByText('Unapplied amount $0.00', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Back to collections', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload collections' })).toBeEnabled();
  await page.getByRole('button', { name: 'Notes & follow-ups', exact: true }).click();
  await page.getByRole('button', { name: 'Add account note', exact: true }).click();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(seed.customerId);
  await page
    .getByRole('textbox', { name: 'Account note / arrangement details', exact: true })
    .fill('Manual follow-up after fictional settlement');
  await page.getByLabel('Manual follow-up date (optional)').fill(today());
  await submit(page, 'Add account note');
  await expect(page.getByText(/1 unresolved items due/)).toBeVisible();
  await page.getByRole('button', { name: 'Resolve follow-up', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Account note / arrangement details', exact: true })
    .fill('Reviewed fictional account and completed follow-up');
  await submit(page, 'Resolve follow-up');
  await expect(page.getByText(/0 unresolved items due/)).toBeVisible();
  await page.getByRole('button', { name: 'Reconciliation', exact: true }).click();
  await page.getByRole('button', { name: 'Review reconciliation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const checkbox of await dialog
    .getByRole('region', { name: 'Unmatched cash selection' })
    .getByRole('checkbox')
    .all())
    await checkbox.check();
  await dialog.getByRole('textbox', { name: 'Closing statement balance ($)', exact: true }).fill('100.00');
  await dialog
    .getByRole('textbox', { name: 'Statement / cash journal reference', exact: true })
    .fill('Fictional reviewed journal 001');
  await dialog
    .getByRole('textbox', { name: 'Review notes', exact: true })
    .fill('Matched four manual cash movements');
  await dialog.getByRole('button', { name: 'Preview reconciliation', exact: true }).click();
  await expect(dialog).toContainText('4 selected movements');
  await expect(dialog).toContainText('Unresolved variance');
  await submit(page, 'Record reviewed reconciliation');
  await expect(page.getByText(/0 unmatched movements/)).toBeVisible();
  const final = (await (
    await page.request.get(`/api/collections?organization=${seed.org}`)
  ).json()) as CollectionsSnapshot;
  expect(final.summary.accounts.find((a) => a.invoice_id === i.id)?.outstanding_cents).toBe('0');
  expect(final.summary.deposits[0].held_cents).toBe('0');
  expect(final.reconciliations[0].variance_cents).toBe('0');
});
test('collection forms and receipts remain accessible on every viewport in both themes', async ({
  page,
}, info) => {
  await login(page);
  await collections(page);
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((v) => (document.documentElement.dataset.theme = v), theme);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('manual-payment.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(seed.customerId);
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill('25.00');
  await reason(page);
  await submit(page, 'Record payment');
  await page.getByRole('button', { name: 'Receipts', exact: true }).click();
  await page.getByRole('link', { name: 'Open RCT-000001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('ForgeOS · Property Manager');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('receipt.png'), fullPage: true });
});
test('collection APIs and receipt routes reject cross-origin, raw card fields and revoked finance access', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'API boundary checks run once.');
  await login(page);
  await collections(page);
  const response = await recordPayment(page, '50.00');
  const payment = await response.json();
  const body = response.request().postDataJSON();
  expect(
    (
      await page.request.post('/api/collections', {
        headers: { origin: 'https://untrusted.example' },
        data: body,
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/collections', {
        headers: { origin },
        data: { ...body, payload: { ...body.payload, card_number: '4111111111111111' } },
      })
    ).status()
  ).toBe(400);
  expect((await page.request.post('/api/collections', { headers: { origin }, data: body })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
  expect((await page.request.get(`/api/collections/receipts/${payment.receipt_id}/pdf`)).status()).toBe(401);
  await login(page, 'technician');
  const result = await page.request.get(`/api/collections?organization=${seed.org}`);
  expect(result.ok()).toBe(true);
  const data = (await result.json()) as CollectionsSnapshot;
  expect(data.payments).toEqual([]);
  expect(data.receipts).toEqual([]);
  expect(data.summary.cash).toEqual([]);
  expect((await page.request.get(`/api/collections/receipts/${payment.receipt_id}/pdf`)).status()).toBe(404);
  expect(
    (
      await page.request.post('/api/collections', {
        headers: { origin },
        data: { ...body, payload: { ...body.payload, request_id: randomUUID() } },
      })
    ).status()
  ).toBe(403);
});

test('overdue fees require explicit owner policy and a separate reviewed invoice; waivers retain the charge', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Manual fee review runs once.');
  await login(page);
  const i = await invoice(page);
  await collections(page);
  await policy(page);
  await page.getByRole('button', { name: 'Configure collections', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable manually reviewed late fee drafts', exact: true }).check();
  await page.getByRole('textbox', { name: 'Late fee flat amount ($)', exact: true }).fill('5.00');
  await page.getByRole('textbox', { name: 'Late fee cap before tax ($)', exact: true }).fill('10.00');
  await reason(page, 'Fictional owner authorized manual fee policy');
  await submit(page, 'Save collections policy');
  const billing = (await (
    await page.request.get(`/api/billing?organization=${seed.org}`)
  ).json()) as BillingSnapshot;
  await api(page, 'issue_invoice', {
    invoice_id: i.id,
    revision_id: billing.invoices.find((b) => b.id === i.id)!.current_revision_id,
    issued_on: addDays(today(), -3),
    due_on: addDays(today(), -2),
  });
  await page.getByRole('button', { name: 'Reload collections', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload collections' })).toBeEnabled();
  await page.getByRole('button', { name: 'Invoices & aging', exact: true }).click();
  await page.getByRole('button', { name: `Prepare late fee ${i.number}`, exact: true }).click();
  await reason(page);
  const result = await (await submit(page, 'Prepare fee draft')).json();
  await page.goto(`/billing?organization=${seed.org}&property=${seed.property}`);
  await expect(page.getByRole('button', { name: 'Reload billing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'INV-000002', exact: true }).click();
  await page.getByRole('button', { name: 'Approve invoice', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Supervisor checked fictional fee authorization and basis');
  const approved = page.waitForResponse(
    (r) => r.url().endsWith('/api/billing') && r.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Approve invoice', exact: true }).click();
  expect((await approved).ok()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await collections(page);
  await page.getByRole('button', { name: 'Issue INV-000002', exact: true }).click();
  await reason(page);
  await submit(page, 'Mark invoice issued');
  await expect(page.getByRole('button', { name: 'Prepare late fee INV-000002', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Record waiver', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill('2.00');
  await reason(page, 'Fictional discretionary partial waiver');
  await submit(page, 'Record waiver');
  const final = (await (
    await page.request.get(`/api/collections?organization=${seed.org}`)
  ).json()) as CollectionsSnapshot;
  expect(final.summary.accounts.find((a) => a.invoice_id === result.invoice_id)?.outstanding_cents).toBe(
    '300'
  );
  expect(final.waivers).toHaveLength(1);
  expect(final.fees[0].fee_cents).toBe('500');
});
