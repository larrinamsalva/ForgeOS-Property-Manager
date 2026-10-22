import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifyArchive } from '../../src/lib/archive-format.mjs';
import { dateAtProperty, addDays } from '../../src/lib/domain';
const origin = 'http://127.0.0.1:3100',
  residentId = '10000000-0000-4000-8000-000000000007';
let seed: { org: string; property: string; customerId: string; stayId: string };
const today = () => dateAtProperty('America/Los_Angeles');
async function login(page: Page, user = 'owner', portal = false) {
  await page.goto(portal ? '/login?portal=1' : '/login');
  await page.getByLabel('Email', { exact: true }).fill(user + '@forgeos.example');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS', exact: true }).click();
  if (portal)
    await expect(page.getByRole('heading', { name: 'Welcome home', exact: true })).toBeVisible({
      timeout: 60000,
    });
  else
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({ timeout: 60000 });
}
async function logout(page: Page) {
  expect((await page.request.post('/api/auth/signout', { headers: { origin } })).ok()).toBe(true);
}
async function api(
  request: APIRequestContext,
  path: string,
  command: string,
  values: Record<string, unknown>,
  own = false
) {
  const r = await request.post(path, {
    headers: { origin },
    data: {
      command,
      payload: {
        ...(own ? {} : { organization_id: seed.org, property_id: seed.property }),
        request_id: randomUUID(),
        reason: 'Fictional authorized acceptance test',
        ...values,
      },
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function grant(page: Page) {
  return api(page.request, '/api/commercial', 'set_portal_access', {
    id: null,
    version: null,
    customer_id: seed.customerId,
    user_id: residentId,
    active: true,
    starts_on: today(),
    expires_on: null,
  });
}
async function save(page: Page, apiPath: string) {
  const response = page.waitForResponse((r) => r.url().endsWith(apiPath) && r.request().method() === 'POST');
  await page.getByRole('dialog').locator('button[type=submit]').click();
  const r = await response;
  expect(r.ok(), await r.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  return apiPath === '/api/commercial/export' ? undefined : r.json();
}
async function reason(page: Page) {
  await page
    .getByRole('textbox', { name: 'Reason / supporting record', exact: true })
    .fill('Fictional resident acceptance request');
}
async function audit(page: Page) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
  seed = await (await request.post('http://127.0.0.1:54331/__test/seed')).json();
});
test('reports and verified owner archive work across screen sizes', async ({ page }, info) => {
  await login(page);
  await page.goto(`/reports?organization=${seed.org}&property=${seed.property}`);
  await expect(page.getByRole('cell', { name: 'Pine Creek RV Park', exact: true }).first()).toBeVisible({
    timeout: 60000,
  });
  await page.getByLabel('Report', { exact: true }).selectOption('tenant_history');
  await expect(page.getByRole('cell', { name: 'River Sample', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report CSV', exact: true }).click();
  const d = await download;
  const text = await readFile((await d.path())!, 'utf8');
  expect(text).toContain('River Sample');
  await audit(page);
  await page.screenshot({ path: info.outputPath('reports.png'), fullPage: true });
  const response = await page.request.get('/portal', { headers: { 'x-nonce': 'forged-client-nonce' } });
  const csp = response.headers()['content-security-policy'];
  expect(csp).toContain('strict-dynamic');
  expect(csp).not.toContain('forged-client-nonce');
  expect(response.headers()['cache-control']).toContain('no-store');
  await page.goto(`/commercial?organization=${seed.org}&property=${seed.property}`);
  await page.getByRole('button', { name: 'Export account JSON', exact: true }).click();
  await reason(page);
  const file = page.waitForEvent('download');
  await save(page, '/api/commercial/export');
  const archive = JSON.parse(await readFile((await (await file).path())!, 'utf8'));
  expect(verifyArchive(archive).tables).toBe(66);
});
test('resident statements, maintenance, approved contact updates and revocation stay scoped', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Complete account lifecycle runs once.');
  await login(page);
  const link = await grant(page);
  const bill = (command: string, p: Record<string, unknown>) => api(page.request, '/api/billing', command, p);
  await bill('configure_policy', {
    proration: 'actual_calendar_days',
    due_days: 15,
    rent_tax_bps: 0,
    tax_label: '',
    authorization_reference: '',
  });
  await api(page.request, '/api/collections', 'configure_collections', {
    manual_issuance_enabled: true,
    grace_days: 0,
    fees_enabled: false,
    fee_flat_cents: '0',
    fee_bps: 0,
    fee_cap_cents: '0',
    fee_tax_bps: 0,
    fee_tax_label: '',
    deposit_deductions_enabled: false,
    authorization_reference: 'Fictional owner setting',
  });
  // Draft creation has its own evidence fields rather than a generic reason.
  const r = await page.request.post('/api/billing', {
    headers: { origin },
    data: {
      command: 'create_draft',
      payload: {
        organization_id: seed.org,
        property_id: seed.property,
        request_id: randomUUID(),
        stay_id: seed.stayId,
        starts_on: addDays(today(), -5),
        ends_on: addDays(today(), -4),
        due_on: today(),
        rent_mode: 'none',
        manual_rent_cents: null,
        rent_reason: 'PRIVATE RENT',
        include_utilities: false,
        utilities_reason: 'PRIVATE UTILITY',
        accept_estimates: false,
        adjustments: [
          {
            kind: 'fee',
            description: 'Agreed service charge',
            amount_cents: '10000',
            reason: 'PRIVATE ADJUSTMENT',
            tax_bps: 0,
            tax_label: '',
            authorization_reference: '',
          },
        ],
      },
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const invoiceId = (await r.json()).id;
  const billing = await (await page.request.get('/api/billing?organization=' + seed.org)).json();
  const invoice = billing.invoices.find((i: { id: string }) => i.id === invoiceId);
  await bill('approve_invoice', { invoice_id: invoiceId, revision_id: invoice.current_revision_id });
  await api(page.request, '/api/collections', 'issue_invoice', {
    invoice_id: invoiceId,
    revision_id: invoice.current_revision_id,
    issued_on: today(),
    due_on: today(),
  });
  const payment = await api(page.request, '/api/collections', 'record_payment', {
    customer_id: seed.customerId,
    amount_cents: '5000',
    received_on: today(),
    method: 'cash',
    reference: 'PUBLIC-REF',
    corrects_payment_id: null,
  });
  await logout(page);
  await login(page, 'resident', true);
  await expect(page.getByRole('button', { name: 'Request maintenance', exact: true })).toBeEnabled();
  await expect(page.getByText('$100.00', { exact: true }).first()).toBeVisible();
  const doc = await page.request.get('/api/portal/invoices/' + invoiceId);
  expect(doc.ok()).toBe(true);
  expect(await doc.text()).not.toContain('PRIVATE');
  const pdf = await page.request.get('/api/portal/invoices/' + invoiceId + '?format=pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const receipt = await page.request.get('/api/portal/receipts/' + payment.receipt_id);
  expect((await receipt.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('link', { name: 'Printable statement', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Charges & usage', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to resident portal' }).click();
  await page.getByRole('button', { name: 'Request maintenance', exact: true }).click();
  await page.getByLabel('Current stay').selectOption(seed.stayId);
  await page.getByRole('textbox', { name: 'Request title', exact: true }).fill('Leaking faucet');
  await page
    .getByRole('textbox', { name: 'Describe the issue', exact: true })
    .fill('Water beneath the kitchen sink');
  await reason(page);
  await save(page, '/api/portal');
  await expect(page.getByRole('heading', { name: /Leaking faucet/ })).toBeVisible();
  await page.getByRole('button', { name: 'Propose contact update', exact: true }).click();
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('555-0101');
  await reason(page);
  await save(page, '/api/portal');
  await expect(page.getByRole('heading', { name: 'Contact proposal · pending' })).toBeVisible();
  expect(
    (
      await page.request.get(
        `/api/reports?organization=${seed.org}&summary=1&starts_on=${today()}&ends_on=${addDays(today(), 1)}`
      )
    ).status()
  ).toBe(403);
  expect((await page.request.get('/api/portal/invoices/' + randomUUID())).status()).toBe(404);
  await logout(page);
  await login(page);
  await page.goto(`/commercial?organization=${seed.org}&property=${seed.property}`);
  await page.getByRole('button', { name: 'Approve contact change', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Decision shown to resident', exact: true })
    .fill('Verified new number with resident');
  await save(page, '/api/commercial');
  await api(page.request, '/api/commercial', 'set_portal_access', {
    id: link.id,
    version: 1,
    customer_id: seed.customerId,
    user_id: residentId,
    active: false,
    starts_on: today(),
    expires_on: null,
  });
  await logout(page);
  await login(page, 'resident', true);
  await expect(page.getByRole('heading', { name: 'Ask the office to link your account' })).toBeVisible();
  expect((await page.request.get('/api/portal?membership=' + link.id)).status()).toBe(403);
});
test('prepared messages, resident preferences and retained read history stay accessible', async ({
  page,
}, info) => {
  await login(page);
  const link = await grant(page);
  await page.goto(`/communications?organization=${seed.org}&property=${seed.property}`);
  await page.getByRole('button', { name: 'Prepare message', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message title', exact: true }).fill('Hello {{customer_name}}');
  await page
    .getByRole('textbox', { name: 'Message body', exact: true })
    .fill('Welcome to {{property_name}}.');
  await page.getByRole('checkbox', { name: 'River Sample', exact: true }).check();
  await reason(page);
  await audit(page);
  await save(page, '/api/commercial');
  await page.getByRole('button', { name: 'Publish message', exact: true }).click();
  await reason(page);
  await save(page, '/api/commercial');
  await logout(page);
  await login(page, 'resident', true);
  await expect(page.getByRole('heading', { name: 'Hello River Sample', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByText(/^Read /)).toBeVisible();
  await page.getByRole('button', { name: 'Edit preferences', exact: true }).click();
  await page.getByLabel('Preferred language').selectOption('es');
  await page.getByRole('checkbox', { name: 'Receive in-app messages' }).uncheck();
  await reason(page);
  await audit(page);
  await save(page, '/api/portal');
  await audit(page);
  await page.screenshot({ path: info.outputPath('resident-portal.png'), fullPage: true });
  const forged = await page.request.post('/api/portal', {
    headers: { origin },
    data: {
      command: 'request_contact',
      payload: {
        membership_id: link.id,
        organization_id: seed.org,
        request_id: randomUUID(),
        reason: 'Forged scope',
        proposed: { phone: '123' },
      },
    },
  });
  expect(forged.status()).toBe(400);
  await logout(page);
  await login(page);
  const next = await api(page.request, '/api/commercial', 'prepare_message', {
    language: 'es',
    category: 'general',
    title: 'Aviso',
    body: 'Texto para residente',
    template_id: null,
    template_version: null,
    customer_ids: [seed.customerId],
    scheduled_for: null,
  });
  await api(page.request, '/api/commercial', 'publish_message', { id: next.id, version: 1 });
  await logout(page);
  await login(page, 'resident', true);
  await expect(page.getByRole('heading', { name: 'Hello River Sample', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aviso', exact: true })).toHaveCount(0);
});
