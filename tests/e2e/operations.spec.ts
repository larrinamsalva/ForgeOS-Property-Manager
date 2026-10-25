import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { dateAtProperty, addDays } from '../../src/lib/domain';
import type { OperationsSnapshot } from '../../src/lib/operations-domain';
const origin = 'http://127.0.0.1:3100',
  worker = '10000000-0000-4000-8000-000000000006';
let seed: { org: string; property: string };
const today = () => dateAtProperty('America/Los_Angeles');
async function login(page: Page, name = 'owner') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@forgeos.example`);
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}
async function signout(page: Page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
}
async function section(page: Page, value = 'maintenance') {
  await page.goto(`/${value}?organization=${seed.org}&property=${seed.property}`);
  await expect(page.getByRole('button', { name: 'Reload operations', exact: true })).toBeEnabled();
}
async function note(page: Page, value = 'Fictional authorized operations evidence') {
  await page.getByRole('textbox', { name: 'Reason / work note', exact: true }).fill(value);
}
async function submit(page: Page, label?: string) {
  const dialog = page.getByRole('dialog');
  const wait = page.waitForResponse(
    (r) => r.url().endsWith('/api/operations') && r.request().method() === 'POST'
  );
  if (label) await dialog.getByRole('button', { name: label, exact: true }).click();
  else await dialog.locator('button[type=submit]').click();
  const response = await wait;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload operations', exact: true })).toBeEnabled();
  return response.json();
}
async function api(page: Page, command: string, payload: Record<string, unknown>) {
  const r = await page.request.post('/api/operations', {
    headers: { origin },
    data: {
      command,
      payload: {
        organization_id: seed.org,
        property_id: seed.property,
        request_id: randomUUID(),
        reason: 'Fictional operations test',
        ...payload,
      },
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json() as Promise<{ id: string }>;
}
async function profile(page: Page) {
  return api(page, 'save_staff', {
    id: null,
    version: null,
    user_id: worker,
    employee_code: 'M01',
    name: 'Morgan Maintenance',
    email: 'morgan@example.com',
    phone: '',
    employment_status: 'active',
    starts_on: today(),
    supervisor_id: null,
    notes: '',
  });
}
async function catalog(page: Page) {
  const s = await api(page, 'save_supplier', {
    id: null,
    version: null,
    name: 'Fictional Supply Co',
    contact: 'Dispatch',
    email: 'vendor@example.com',
    phone: '',
    address: '123 Example Lane',
    notes: '',
    archived: false,
  });
  const items = [];
  for (const [sku, name, cost] of [
    ['PVC-01', 'PVC fittings', '101'],
    ['GLOVES-01', 'Work gloves', '200'],
  ])
    items.push(
      await api(page, 'save_item', {
        id: null,
        version: null,
        sku,
        name,
        category: 'Supplies',
        unit: 'each',
        location: 'Shop',
        supplier_id: s.id,
        unit_cost_cents: cost,
        reorder_milli: '2000',
        restock_milli: '10000',
        notes: '',
        archived: false,
      })
    );
  return { supplier: s.id, items: items.map((i) => i.id) };
}
async function openWork(page: Page) {
  await page.getByRole('button', { name: 'WO-000001', exact: true }).click();
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
  seed = await (await request.post('http://127.0.0.1:54331/__test/seed')).json();
});
test('assigned repair records time, stock, private photos and equipment before manager approval', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Complete role and materials lifecycle runs once.');
  await login(page);
  await section(page, 'operations');
  await page.getByRole('button', { name: 'Staff & history', exact: true }).click();
  await page.getByRole('button', { name: 'Add staff profile', exact: true }).click();
  await page.getByRole('textbox', { name: 'Registered user ID', exact: true }).fill(worker);
  await page.getByRole('textbox', { name: 'Employee code', exact: true }).fill('M01');
  await page.getByRole('textbox', { name: 'Employee name', exact: true }).fill('Morgan Maintenance');
  await note(page);
  await submit(page);
  await section(page, 'inventory');
  await page.getByRole('button', { name: 'Add stock item', exact: true }).click();
  await page.getByRole('textbox', { name: 'SKU / stock code', exact: true }).fill('PVC-01');
  await page.getByRole('textbox', { name: 'Item name', exact: true }).fill('PVC fittings');
  await page.getByRole('textbox', { name: 'Standard unit cost ($)', exact: true }).fill('1.23');
  await page.getByRole('textbox', { name: 'Reorder threshold', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Suggested restock quantity', exact: true }).fill('10');
  await note(page);
  const item = await submit(page);
  await page.getByRole('button', { name: 'Receive stock', exact: true }).click();
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('10');
  await note(page);
  await submit(page);
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Equipment code', exact: true }).fill('EQ-01');
  await page.getByRole('textbox', { name: 'Equipment name', exact: true }).fill('Inspection tool');
  await page.getByLabel('Next service date (optional)').fill(addDays(today(), 30));
  await note(page);
  await submit(page);
  await section(page);
  await page.getByRole('button', { name: 'New maintenance request', exact: true }).click();
  await page.getByRole('textbox', { name: 'Work title', exact: true }).fill('Repair fictional water leak');
  await page
    .getByRole('textbox', { name: 'Problem / work description', exact: true })
    .fill('Replace a fictional leaking fitting at the common area.');
  await page.getByRole('combobox', { name: 'Assigned employee', exact: true }).selectOption(worker);
  await note(page);
  const w = await submit(page);
  await signout(page);
  await login(page, 'maintenance');
  await section(page);
  await openWork(page);
  await expect(page.getByRole('dialog')).not.toContainText('Estimated & actual cost');
  await page.getByRole('button', { name: 'Start / resume work', exact: true }).click();
  await note(page);
  await submit(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Add work note / time', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Minutes worked (0 for note only)', exact: true }).fill('45');
  await note(page, 'Inspected and repaired fictional fitting');
  await submit(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Use materials', exact: true }).click();
  await page.getByRole('combobox', { name: 'Material item', exact: true }).selectOption(item.id);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('2');
  await note(page);
  await submit(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Add photograph', exact: true }).click();
  await page.getByRole('combobox', { name: 'Photo stage', exact: true }).selectOption('after');
  await page.getByLabel('Caption', { exact: true }).fill('Fictional repaired fitting');
  await page.getByLabel('Work photograph', { exact: true }).setInputFiles({
    name: 'fictional.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8p0AAAAASUVORK5CYII=',
      'base64'
    ),
  });
  await page.getByRole('button', { name: 'Upload work photo', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload operations', exact: true })).toBeEnabled();
  await openWork(page);
  await page.getByRole('button', { name: 'View photograph', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Fictional repaired fitting', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check out Inspection tool', exact: true }).click();
  await note(page);
  await submit(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Return equipment', exact: true }).click();
  await note(page);
  await submit(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await note(page);
  await submit(page);
  const restricted = (await (
    await page.request.get(`/api/operations?organization=${seed.org}`)
  ).json()) as OperationsSnapshot;
  expect(restricted.items).toEqual([]);
  expect(restricted.costs).toEqual([]);
  expect(restricted.orders).toEqual([]);
  for (const part of restricted.context.parts) {
    expect(part).not.toHaveProperty('unit_cost_cents');
    expect(part).not.toHaveProperty('supplier_id');
  }
  await signout(page);
  await login(page);
  await section(page);
  await openWork(page);
  await page.getByRole('button', { name: 'Record actual expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount ($)', exact: true }).fill('5.00');
  await note(page, 'Fictional authorized disposal cost');
  await submit(page);
  await openWork(page);
  await expect(page.getByRole('dialog')).toContainText('Actual $7.46');
  await expect(page.getByRole('dialog')).toContainText('Total recorded time 45 minutes');
  await page.getByRole('button', { name: 'Approve & close', exact: true }).click();
  await note(page, 'Manager verified fictional repair, time, materials and evidence');
  await submit(page);
  const final = (await (
    await page.request.get(`/api/operations?organization=${seed.org}`)
  ).json()) as OperationsSnapshot;
  expect(final.work.find((r) => r.id === w.id)?.status).toBe('closed');
  expect(final.summary.stock.find((i) => i.id === item.id)?.quantity_milli).toBe('8000');
  expect(final.photos[0].status).toBe('uploaded');
  expect(final.loans[0].returned_on).toBe(today());
});
test('purchase requests become reviewed orders with partial receipts and retained returns', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Purchasing lifecycle runs once.');
  await login(page);
  const c = await catalog(page);
  await section(page, 'inventory');
  await page.getByRole('button', { name: 'Purchasing', exact: true }).click();
  await page.getByRole('button', { name: 'Request supplies', exact: true }).click();
  await page.getByRole('combobox', { name: 'Requested item', exact: true }).selectOption(c.items[0]);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('3');
  await note(page);
  const request = await submit(page);
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await note(page);
  await submit(page);
  await page.getByRole('button', { name: 'Prepare purchase order', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Approved request 1 (optional)', exact: true })
    .selectOption(request.id);
  await page.getByRole('button', { name: 'Add order line', exact: true }).click();
  await page.getByRole('combobox', { name: 'Item 2', exact: true }).selectOption(c.items[1]);
  await page.getByRole('textbox', { name: 'Quantity 2', exact: true }).fill('2');
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(c.supplier);
  await page
    .getByRole('textbox', { name: 'Purchase justification', exact: true })
    .fill('Fictional reviewed restock for operations');
  const order = await submit(page, 'Prepare purchase order');
  await page.getByRole('button', { name: 'Approve order', exact: true }).click();
  await note(page);
  await submit(page);
  await page.getByRole('button', { name: 'Record order placed', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Order confirmation / supporting reference', exact: true })
    .fill('Fictional vendor confirmation 001');
  await note(page);
  await submit(page);
  for (const [sku, quantity] of [
    ['PVC-01', '1'],
    ['PVC-01', '2'],
    ['GLOVES-01', '2'],
  ]) {
    await page.getByRole('button', { name: 'PO-000001', exact: true }).click();
    const article = page
      .getByRole('dialog')
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: new RegExp(`^${sku}`) }) });
    await article.getByRole('button', { name: 'Receive delivery', exact: true }).click();
    await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill(quantity);
    await note(page);
    await submit(page);
  }
  await expect(page.getByRole('region', { name: 'Purchase orders' })).toContainText('Received');
  await page.getByRole('button', { name: 'PO-000001', exact: true }).click();
  const returnedLine = page
    .getByRole('dialog')
    .locator('article')
    .filter({
      has: page.getByRole('heading', { name: /^PVC-01/ }),
    });
  await returnedLine.getByRole('button', { name: 'Return received stock', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1');
  await note(page);
  await submit(page);
  await expect(page.getByRole('region', { name: 'Purchase orders' })).toContainText('Part received');
  const final = (await (
    await page.request.get(`/api/operations?organization=${seed.org}`)
  ).json()) as OperationsSnapshot;
  expect(final.orders.find((p) => p.id === order.id)?.status).toBe('ordered');
  expect(final.receipts).toHaveLength(4);
  expect(final.summary.stock.find((i) => i.id === c.items[0])?.quantity_milli).toBe('2000');
  expect(final.summary.stock.find((i) => i.id === c.items[1])?.quantity_milli).toBe('2000');
  const returned = final.receipts.find((r) => BigInt(r.quantity_milli) < 0);
  expect(final.lines.find((l) => l.id === returned?.line_id)?.item_id).toBe(c.items[0]);
  expect(final.requests[0].status).toBe('ordered');
});
test('recurring checklists retain dated employee results and private notifications', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Recurring checklist role workflow runs once.');
  await login(page);
  await profile(page);
  await section(page, 'operations');
  await page.getByRole('button', { name: 'Add checklist plan', exact: true }).click();
  await page.getByRole('textbox', { name: 'Plan name', exact: true }).fill('Morning grounds checks');
  await page.getByRole('combobox', { name: 'Assigned employee', exact: true }).selectOption(worker);
  await page
    .getByRole('textbox', { name: 'Checklist items (one per line)', exact: true })
    .fill('Inspect trash\nInspect water leaks');
  await note(page);
  await submit(page);
  await page.getByRole('button', { name: 'Recurring calendar', exact: true }).click();
  const row = page
    .getByRole('region', { name: 'Recurring operations calendar' })
    .getByRole('row')
    .filter({ hasText: today() });
  await row.getByRole('button', { name: 'Create occurrence', exact: true }).click();
  await note(page);
  await submit(page);
  await signout(page);
  await login(page, 'maintenance');
  await section(page, 'operations');
  await page.getByRole('button', { name: 'Morning grounds checks', exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Inspect trash', exact: true }) })
    .getByRole('button', { name: 'Complete item', exact: true })
    .click();
  await note(page, 'Emptied fictional trash bins');
  await submit(page);
  await page.getByRole('button', { name: 'Morning grounds checks', exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Inspect water leaks', exact: true }) })
    .getByRole('button', { name: 'Skip with reason', exact: true })
    .click();
  await note(page, 'Fictional area unavailable; notified supervisor');
  await submit(page);
  await page.getByRole('button', { name: 'Morning grounds checks', exact: true }).click();
  await page.getByRole('button', { name: 'Close checklist run', exact: true }).click();
  await note(page);
  await submit(page);
  await expect(page.getByText(/Closed · 2\/2 recorded/)).toBeVisible();
  await page.getByRole('button', { name: /^My notifications/ }).click();
  await expect(page.getByRole('heading', { name: 'Checklist assigned · Unread', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('button', { name: /^My notifications \(0\)/ })).toBeVisible();
});
test('operations forms stay accessible in both themes on every viewport', async ({ page }, info) => {
  await login(page);
  await profile(page);
  await section(page);
  await page.getByRole('button', { name: 'New maintenance request', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${theme}-maintenance-form.png`), fullPage: true });
  }
  await page.screenshot({ path: info.outputPath('maintenance-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await section(page, 'inventory');
  await page.getByRole('button', { name: 'Add stock item', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
});
test('operations boundaries reject cross-origin and forged stock while unassigned staff see no work', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'API boundary checks run once.');
  await login(page);
  await profile(page);
  const c = await catalog(page);
  const payload = {
    organization_id: seed.org,
    property_id: seed.property,
    request_id: randomUUID(),
    reason: 'Fictional receive stock',
    item_id: c.items[0],
    quantity_milli: '1000',
    unit_cost_cents: '101',
    effective_on: today(),
    reference: '',
  };
  const data = { command: 'receive_stock', payload };
  expect(
    (
      await page.request.post('/api/operations', { headers: { origin: 'https://untrusted.example' }, data })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/operations', {
        headers: { origin },
        data: { ...data, payload: { ...payload, created_by: worker } },
      })
    ).status()
  ).toBe(400);
  await signout(page);
  await login(page, 'maintenance');
  expect((await page.request.post('/api/operations', { headers: { origin }, data })).status()).toBe(403);
  const response = await page.request.get(`/api/operations?organization=${seed.org}`);
  expect(response.ok()).toBe(true);
  const records = (await response.json()) as OperationsSnapshot;
  expect(records.work).toEqual([]);
  expect(records.items).toEqual([]);
  expect(records.context.parts).toEqual([]);
  await signout(page);
  expect((await page.request.get(`/api/operations?organization=${seed.org}`)).status()).toBe(401);
});

test('supervisor reinspection API refuses anonymous, forged and unlinked approvals', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Boundary checks run once.');
  const runId = randomUUID();
  const linkId = randomUUID();
  const endpoint = '/api/inspection-rechecks';
  const payload = {
    organization_id: seed.org,
    property_id: seed.property,
    run_id: runId,
    inspection_link_id: linkId,
    outcome: 'verified',
    notes: 'Fictional supervisor reinspection',
  };
  expect((await page.request.post(endpoint, { headers: { origin }, data: payload })).status()).toBe(401);
  expect((await page.request.get(endpoint + '?' + new URLSearchParams({
    organization: seed.org, property: seed.property, run: runId,
  }))).status()).toBe(401);

  await login(page);
  expect((await page.request.post(endpoint, {
    headers: { origin: 'https://untrusted.example' }, data: payload,
  })).status()).toBe(403);
  expect((await page.request.post(endpoint, {
    headers: { origin }, data: { ...payload, outcome: 'approved' },
  })).status()).toBe(400);
  expect((await page.request.post(endpoint, {
    headers: { origin }, data: { ...payload, notes: ' ' },
  })).status()).toBe(400);
  expect((await page.request.post(endpoint, {
    headers: { origin }, data: payload,
  })).status()).toBe(403);
  const empty = await page.request.get(endpoint + '?' + new URLSearchParams({
    organization: seed.org, property: seed.property, run: runId,
  }));
  // The test fixture has no inspection-link records. The scoped endpoint
  // denies a read when that backing store is unavailable; it must not leak
  // records or pretend that an empty history was verified.
  expect(empty.status()).toBe(403);
  expect((await empty.json()).error).toBe('Inspection links unavailable.');

  await signout(page);
  await login(page, 'maintenance');
  expect((await page.request.post(endpoint, { headers: { origin }, data: payload })).status()).toBe(403);
});
