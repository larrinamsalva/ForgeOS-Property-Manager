import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { identities } from '../support/database.mjs';
import { dateAtProperty, addDays } from '../../src/lib/domain';
const origin = 'http://127.0.0.1:3100';
const passphrase = 'Field-reader-example-2026';
interface Seed {
  org: string;
  property: string;
  siteIds: string[];
}
async function login(page: Page, name = 'owner') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@forgeos.example`);
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
}
async function command(page: Page, command: string, payload: Record<string, unknown>) {
  const response = await page.request.post('/api/meters', {
    headers: { origin },
    data: { command, payload },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).id as string;
}
async function setup(page: Page, assignee = identities.owner) {
  await page.request.post('http://127.0.0.1:54331/__test/reset');
  const seed = (await (await page.request.post('http://127.0.0.1:54331/__test/seed')).json()) as Seed;
  await login(page);
  const scope = { organization_id: seed.org, property_id: seed.property };
  const siteIds = seed.siteIds;
  const assignments: string[] = [];
  const meters: string[] = [];
  let n = 0;
  const starts = new Date(Date.now() - 86400000).toISOString();
  for (const site of Array.from(new Set(siteIds))) {
    n++;
    const meter = await command(page, 'new_meter', {
      ...scope,
      label: `Pedestal ${n}`,
      utility: n === 1 ? 'electric' : 'water',
      serial_number: `TEST-METER-${n}`,
      location: `Beside site ${n}`,
      unit: n === 1 ? 'kWh' : 'gallons',
      register_digits: 6,
      multiplier: '1',
      max_delta: '100',
      installed_at: starts,
      notes: 'Fictional meter',
    });
    meters.push(meter);
    assignments.push(
      await command(page, 'new_assignment', { ...scope, meter_id: meter, site_id: site, starts_at: starts })
    );
  }
  const today = dateAtProperty('America/Los_Angeles');
  const route = await command(page, 'new_route', {
    ...scope,
    label: 'Creekside morning',
    assigned_to: assignee,
    starts_on: today,
    ends_on: addDays(today, 1),
    cadence: 'monthly',
    assignments,
  });
  const snapshot = await (await page.request.get(`/api/meters?organization=${seed.org}`)).json();
  return {
    ...seed,
    scope,
    assignments,
    meters,
    route,
    items: snapshot.items as { id: string; assignment_id: string }[],
  };
}
async function openReader(page: Page, org: string) {
  await page.goto(`/tablet/index.html?organization=${org}`);
  await page.getByLabel('Device passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Prepare or unlock reader' }).click();
  await expect(page.getByText('Reader unlocked.', { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function unlock(page: Page) {
  await page.getByLabel('Device passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Prepare or unlock reader' }).click();
  await expect(page.locator('#reader')).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
test('meter routes survive offline reload, retry photos once and retain supervisor correction history', async ({
  page,
  context,
  request,
  browser,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const s = await setup(page);
  await openReader(page, s.org);
  await noOverflow(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/tablet/index.html');
  expect(manifest.icons).toHaveLength(3);
  const headers = await page.request.get('/tablet/index.html');
  expect(headers.headers()['permissions-policy']).toContain('camera=(self)');
  const image = await (await page.request.get('/tablet-icon/192')).body();
  await context.setOffline(true);
  await page.getByLabel('New register reading', { exact: false }).fill('1234.123456');
  await page
    .locator('#camera')
    .setInputFiles({ name: 'test-meter.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('#photo-description')).toContainText('Photo ready');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.kind === 'operation') {
        IDBObjectStore.prototype.add = original;
        throw new DOMException('Simulated quota', 'QuotaExceededError');
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#message')).toContainText('not saved');
  await expect(page.locator('#progress-text')).toHaveText('0 / 2');
  await expect(page.locator('#register')).toHaveValue('1234.123456');
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#progress-text')).toHaveText('1 / 2');
  await page.getByLabel('New register reading', { exact: false }).fill('0');
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#progress-text')).toHaveText('2 / 2');
  const raw = await page.evaluate(async () => {
    const modulePath = '/tablet/vault.mjs';
    const mod = await import(modulePath);
    return JSON.stringify({ vaults: await mod.listVaults(), records: await mod.rawRecords() });
  });
  expect(raw).not.toContain('1234.123456');
  expect(raw).not.toContain('Pedestal');
  expect(raw).not.toContain('River Sample');
  expect(raw).not.toContain(passphrase);
  expect(raw).not.toContain('access_token');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepare your reader' })).toBeVisible();
  await unlock(page);
  await expect(page.locator('#progress-text')).toHaveText('2 / 2');
  await expect(page.locator('#queue-history')).toContainText('1234.123456');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export encrypted recovery' }).click();
  const download = await downloading;
  const recovery = await readFile((await download.path())!);
  const restoredContext = await browser.newContext();
  const restored = await restoredContext.newPage();
  await restored.goto(`${origin}/tablet/index.html`);
  await restored.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await restored
    .locator('#recovery-file')
    .setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: recovery });
  await expect(restored.locator('#message')).toContainText('Recovery queue imported');
  await restoredContext.setOffline(true);
  await unlock(restored);
  await expect(restored.locator('#progress-text')).toHaveText('2 / 2');
  await expect(restored.locator('#queue-history')).toContainText('1234.123456');
  await restoredContext.close();
  await expect(page.locator('#message')).toContainText('Encrypted recovery exported');
  await request.post('http://127.0.0.1:54331/__test/fail-photo', { data: { count: 1 } });
  await context.setOffline(false);
  await expect(page.locator('#message')).toContainText('still need attention', { timeout: 30000 });
  await expect(page.locator('#queue-history')).toContainText('photo pending');
  await page.getByRole('button', { name: /Sync now/ }).click();
  await expect(page.locator('#message')).toHaveText(
    'All device entries and photos are synced. Readings await supervisor review.',
    { timeout: 30000 }
  );
  const stored = await (await page.request.get(`/api/meters?organization=${s.org}`)).json();
  expect(stored.readings).toHaveLength(2);
  expect(stored.photos).toHaveLength(1);
  expect(stored.photos[0].status).toBe('uploaded');
  const encrypted = await page.evaluate(async () => {
    const modulePath = '/tablet/vault.mjs';
    const mod = await import(modulePath);
    return mod.rawRecords();
  });
  expect(encrypted.filter((r: { pending: boolean }) => r.pending)).toHaveLength(0);
  const caches = await page.evaluate(async () => {
    const keys = await window.caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await window.caches.open(key)).keys()).map((r) => new URL(r.url).pathname)
        )
      )
    ).flat();
  });
  expect(
    caches.every((path) =>
      [
        '/tablet/index.html',
        '/tablet/reader.css',
        '/tablet/reader.mjs',
        '/tablet/vault.mjs',
        '/icon.svg',
        '/manifest.webmanifest',
      ].includes(path)
    )
  ).toBe(true);
  await page.getByRole('button', { name: 'Outdoor mode' }).click();
  await noOverflow(page);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  await page.goto(`/meters?organization=${s.org}&property=${s.property}`);
  await page.getByRole('button', { name: 'Supervisor review', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '1234.123456' });
  await row.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel('Corrected register value', { exact: false }).fill('1234.123457');
  await page
    .getByLabel('Review and correction reason', { exact: false })
    .fill('Photograph confirms final digit');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).toContainText('1234.123457');
  await expect(row).toContainText('River Sample');
  await row.getByRole('button', { name: 'View photo' }).click();
  await expect(
    page.getByRole('img', { name: 'Photograph attached to the selected meter reading' })
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: 'Photograph attached to the selected meter reading' })
        .evaluate((el: HTMLImageElement) => el.naturalWidth)
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Reading history', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Meter reading history' })).toContainText('1234.123456');
  // The same immutable reading is now discoverable from both linked staff records.
  await page.goto(`/sites?organization=${s.org}&property=${s.property}`);
  await page.getByRole('button', { name: 'RV-01', exact: true }).click();
  const siteSummary = page.getByRole('region', { name: 'Site water electric gas utility summary' });
  await expect(siteSummary).toContainText('Electricity');
  await expect(siteSummary).toContainText('Water');
  await expect(siteSummary).toContainText('Gas');
  await expect(siteSummary).toContainText('Latest approved');
  await expect(siteSummary).toContainText('1234.123457');
  await expect(siteSummary.getByRole('button', { name: 'Ask by voice' })).toBeVisible();
  await siteSummary.getByRole('button', { name: 'Read meters aloud' }).click();
  await expect(siteSummary.getByRole('status')).toContainText(/Reading site meter information aloud|not supported/i);
  const siteFile = page.getByRole('region', { name: 'Linked meter reading table' });
  await expect(siteFile).toContainText('1234.123457');
  await expect(siteFile).toContainText('River Sample');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto(`/customers?organization=${s.org}&property=${s.property}`);
  await page.getByRole('button', { name: 'River Sample', exact: true }).click();
  const customerFile = page.getByRole('region', { name: 'Linked meter reading table' });
  await expect(customerFile).toContainText('1234.123457');
  await expect(customerFile).toContainText('RV-01');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await noOverflow(page);
  expect(errors).toEqual([]);
  if (info.project.name === 'tablet')
    await page.screenshot({ path: 'test-results/meter-history-tablet.png', fullPage: true });
});

test('conflicting offline captures reach the supervisor inbox and are reconciled without overwriting history', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Conflict lifecycle runs once; offline layouts run on every viewport.'
  );
  const s = await setup(page);
  await openReader(page, s.org);
  await context.setOffline(true);
  await page.locator('#register').fill('42');
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#progress-text')).toHaveText('1 / 2');
  const assignment = s.assignments[0];
  await command(page, 'close_assignment', {
    ...s.scope,
    assignment_id: assignment,
    ends_at: new Date(Date.now() - 10000).toISOString(),
    remove_meter: true,
    reason: 'Pedestal meter replaced during offline route',
  });
  await context.setOffline(false);
  await expect(page.locator('#queue-history')).toContainText('supervisor conflict inbox', { timeout: 30000 });
  await expect(page.locator('#queue-history')).toContainText('conflict');
  const reported = await (await page.request.get(`/api/meters?organization=${s.org}`)).json();
  expect(reported.readings).toHaveLength(0);
  expect(reported.conflicts).toHaveLength(1);
  expect(reported.conflicts[0].payload.value).toBe('42');
  page.once('dialog', (d) => d.accept());
  await page.goto(`/meters?organization=${s.org}&property=${s.property}`);
  await page.getByRole('button', { name: 'Supervisor review', exact: true }).click();
  await page.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await page
    .getByLabel('Reconciliation reason and recovery reference', { exact: false })
    .fill('Retained encrypted recovery; recollect replacement on a new route');
  await page.getByRole('button', { name: 'Record resolution', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.conflict-inbox')).toContainText('Resolved: discarded');
  await page.goto(`/tablet/index.html?organization=${s.org}`);
  await unlock(page);
  await page.getByRole('button', { name: /Sync now/ }).click();
  await expect(page.locator('#message')).toContainText('All device entries and photos are synced');
  await expect(page.locator('#queue-history')).toContainText('Supervisor discarded');
  await expect(page.locator('#queue-history')).toContainText('42');
});

test('technician sessions, role revocation and account switches preserve the protected outbox', async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Access and recovery lifecycle runs once.');
  const s = await setup(page, identities.technician);
  const ownerState = await context.storageState();
  const ownerContext = await browser.newContext({ storageState: ownerState, baseURL: origin });
  const owner = await ownerContext.newPage();
  await page.request.post('/api/auth/signout', { headers: { origin } });
  await login(page, 'technician');
  await openReader(page, s.org);
  await page.locator('#register').fill('55.500001');
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#progress-text')).toHaveText('1 / 2');
  const forbidden = await page.request.post('/api/meters', {
    headers: { origin },
    data: {
      command: 'review',
      payload: {
        ...s.scope,
        reading_id: crypto.randomUUID(),
        previous_review_id: null,
        decision: 'accepted',
        corrected_value: null,
        reason: 'Forged approval',
      },
    },
  });
  expect(forbidden.status()).toBe(403);
  const csrf = await page.request.post('/api/meters', {
    headers: { origin: 'https://foreign.example' },
    data: {},
  });
  expect(csrf.status()).toBe(403);
  await context.clearCookies();
  await page.getByRole('button', { name: /Sync now/ }).click();
  await expect(page.locator('#message')).toContainText('Sign in before');
  await expect(page.locator('#queue-count')).toHaveText('1');
  page.once('dialog', (d) => d.accept());
  await login(page, 'technician');
  const revoke = await owner.request.post('/api/records', {
    headers: { origin },
    data: {
      entity: 'access',
      action: 'revoke',
      organization_id: s.org,
      values: { property_id: s.property, user_id: identities.technician, role: 'meter_technician' },
    },
  });
  expect(revoke.ok(), await revoke.text()).toBe(true);
  await page.goto(`/tablet/index.html?organization=${s.org}`);
  await unlock(page);
  await page.getByRole('button', { name: /Sync now/ }).click();
  await expect(page.locator('#queue-history')).toContainText('access or route assignment changed');
  await expect(page.locator('#queue-count')).toHaveText('1');
  page.once('dialog', (d) => d.accept());
  await page.goto(`/meters?organization=${s.org}`);
  let warningText = '';
  page.once('dialog', async (dialog) => {
    warningText = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(() => warningText).toContain('unsynced');
  await expect(page.getByRole('heading', { name: 'Meters & reader', exact: true })).toBeVisible();
  await page.request.post('/api/auth/signout', { headers: { origin } });
  await login(page, 'owner');
  await page.goto(`/tablet/index.html?organization=${s.org}`);
  await page.getByLabel('Device passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Prepare or unlock reader' }).click();
  await expect(page.locator('#message')).toContainText('differs from this queue');
  await expect(page.locator('#reader')).toBeHidden();
  await ownerContext.close();
});

test('managers create meters, dated assignments and routes with accessible responsive forms', async ({
  page,
}, info) => {
  const s = await setup(page);
  await page.goto(`/meters?organization=${s.org}&property=${s.property}`);
  await expect(page.getByRole('heading', { name: 'Meter directory', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add meter', exact: true }).click();
  await page.getByLabel('Meter name', { exact: false }).fill('Gas service meter');
  await page.getByRole('combobox', { name: 'Utility', exact: true }).selectOption('gas');
  await page.getByLabel('Serial number', { exact: false }).fill('GAS-TEST-003');
  await page.getByLabel('Measurement unit', { exact: false }).fill('therms');
  let saving = page.waitForResponse(
    (r) => r.url().endsWith('/api/meters') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Create meter', exact: true }).click();
  let result = await saving;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.meter-directory')).toContainText('GAS-TEST-003');
  await page.getByRole('button', { name: 'Assign meter', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Meter', exact: true })
    .selectOption({ label: 'Gas service meter · GAS-TEST-003' });
  await page.getByRole('combobox', { name: 'Site / unit', exact: true }).selectOption({ label: 'RV-03' });
  saving = page.waitForResponse((r) => r.url().endsWith('/api/meters') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  result = await saving;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Reading routes', exact: true }).click();
  await page.getByRole('button', { name: 'Create route', exact: true }).click();
  await page.getByLabel('Route name', { exact: false }).fill('Weekly service run');
  await page.getByRole('combobox', { name: 'Assigned employee', exact: true }).selectOption({ label: 'Me' });
  await page.getByRole('combobox', { name: 'Schedule', exact: true }).selectOption('weekly');
  saving = page.waitForResponse((r) => r.url().endsWith('/api/meters') && r.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name: 'Create route', exact: true }).click();
  result = await saving;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.route-cards')).toContainText('Weekly service run');
  await page.getByRole('button', { name: 'Meter directory', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    await noOverflow(page);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    if (info.project.name === 'tablet')
      await page.screenshot({ path: `test-results/meter-directory-${theme}-tablet.png`, fullPage: true });
  }
});

test('automatic privacy lock encrypts and restores an unfinished form without submitting it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Privacy lock lifecycle runs once.');
  const s = await setup(page);
  await openReader(page, s.org);
  await page.locator('#register').fill('88.888888');
  await page.locator('#notes').fill('Unfinished field observation');
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(61000);
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#meter-name')).toBeEmpty();
  await expect(page.locator('#site-label')).toBeEmpty();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByLabel('Device passphrase', { exact: true }).fill('incorrect-passphrase');
  await page.getByRole('button', { name: 'Prepare or unlock reader' }).click();
  await expect(page.locator('#message')).toContainText('did not unlock');
  await unlock(page);
  await expect(page.locator('#register')).toHaveValue('88.888888');
  await expect(page.locator('#notes')).toHaveValue('Unfinished field observation');
  await expect(page.locator('#progress-text')).toHaveText('0 / 2');
  await page.getByRole('button', { name: 'Save reading & next' }).click();
  await expect(page.locator('#progress-text')).toHaveText('1 / 2');
  const server = await (await page.request.get(`/api/meters?organization=${s.org}`)).json();
  expect(server.readings).toHaveLength(0);
  const concurrent = await page.evaluate(async (pass) => {
    const path = '/tablet/vault.mjs';
    const mod = await import(path);
    const scoped = await mod.createVault(crypto.randomUUID(), crypto.randomUUID(), pass);
    const results = await Promise.allSettled([
      mod.forgetVault(scoped),
      mod.saveOperation(
        scoped,
        { payload: { id: crypto.randomUUID(), route_item_id: crypto.randomUUID() }, state: 'queued' },
        true
      ),
    ]);
    const meta = (await mod.listVaults()).find((v: { scope: string }) => v.scope === scoped.meta.scope);
    const records = (await mod.rawRecords()).filter(
      (r: { scope: string; pending: boolean }) => r.scope === scoped.meta.scope && r.pending
    );
    return {
      fulfilled: results.filter((r) => r.status === 'fulfilled').length,
      orphaned: !meta && records.length > 0,
    };
  }, passphrase);
  expect(concurrent.orphaned).toBe(false);
  expect(concurrent.fulfilled).toBe(1);
});
