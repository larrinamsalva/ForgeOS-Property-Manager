import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = 'http://127.0.0.1:3100';
async function login(page: Page, user = 'owner') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${user}@forgeos.example`);
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: name === 'Overview' ? 'Operations overview' : name })
  ).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function property(page: Page, name: string, type = 'rv_park') {
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill(name);
  await page.getByLabel('Property type', { exact: true }).selectOption(type);
  await page.getByLabel('City', { exact: true }).fill('Corning');
  await page.getByLabel('State / region').fill('CA');
  await save(page);
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
});
test('owner creates a persistent property portfolio, moves a customer in and out, and retains history', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Full creation flow runs once on desktop. Responsive workflows run on every viewport.'
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.getByLabel('Organization name').fill('Pine Creek Operations');
  await page.getByRole('button', { name: 'Create organization', exact: true }).click();
  await expect(page.getByLabel('Property view')).toBeVisible();
  await nav(page, 'Properties');
  await property(page, 'Pine Creek RV Park');
  await property(page, 'Pine Creek Apartments', 'apartments');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pine Creek RV Park', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pine Creek Apartments', exact: true })).toBeVisible();
  await page.getByLabel('Property view').selectOption({ label: 'Pine Creek RV Park' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveText('Pine Creek RV Park');
  await nav(page, 'Sites & units');
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('button', { name: 'Add site / unit' }).click();
    await page.getByLabel('Site / unit number').fill(`RV-${String(i).padStart(2, '0')}`);
    await page.getByLabel('monthly rate ($)').fill('650.10');
    await page.getByLabel('Maximum RV length (ft)').fill('45');
    await page.getByLabel('Amperage', { exact: true }).fill('50');
    await page.getByLabel('Section / building').fill('Creekside');
    await page.getByLabel('Amenities', { exact: true }).fill('Shade, picnic table');
    await page.getByLabel('Electric', { exact: true }).check();
    await page.getByLabel('Water', { exact: true }).check();
    await save(page);
  }
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('textbox', { name: 'Search site number, type, or section' }).fill('RV-05');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search site number, type, or section' }).fill('');
  await page.getByLabel('Status', { exact: true }).selectOption('occupied');
  await expect(page.getByRole('heading', { name: 'No sites match these filters' })).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('all');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('ForgeOS-sites.csv');
  await page.getByLabel('Property view').selectOption({ label: 'Pine Creek Apartments' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveText('Pine Creek Apartments');
  for (let i = 1; i <= 2; i++) {
    await page.getByRole('button', { name: 'Add site / unit' }).click();
    await page.getByLabel('Site / unit number').fill(`A-${i}`);
    await page.getByLabel('Site / unit type').selectOption('apartment');
    await page.getByLabel('Bedrooms', { exact: true }).fill('2');
    await page.getByLabel('Bathrooms', { exact: true }).fill('1.5');
    await page.getByLabel('monthly rate ($)').fill('1250.00');
    await save(page);
  }
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Property view').selectOption({ label: 'Pine Creek RV Park' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveText('Pine Creek RV Park');
  await nav(page, 'Customers & tenants');
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await page.getByLabel('First name').fill('River');
  await page.getByLabel('Last name').fill('Sample');
  await page.getByLabel('Email', { exact: true }).fill('river@example.com');
  await save(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'River Sample', exact: true })).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: 'River Sample' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await page.getByLabel('Phone', { exact: true }).fill('555-0100');
  await save(page);
  await page.reload();
  await expect(page.getByText('555-0100', { exact: true })).toBeVisible();
  await nav(page, 'Occupancy & history');
  await page.getByRole('button', { name: 'Assign customer', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Site / unit', exact: true })
    .selectOption({ label: 'RV-01 · $650.10 / month' });
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption({ label: 'River Sample' });
  await page.getByLabel('Agreed monthly rent ($)').fill('650.10');
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Confirm move-in' }).click();
  const response = await responsePromise;
  const payload = response.request().postDataJSON();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  const conflict = await page.request.post('/api/records', { headers: { origin }, data: payload });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error).toContain('overlapping');
  await nav(page, 'Overview');
  const totals = page.getByRole('region', { name: 'Operational totals' });
  await expect(
    totals
      .locator('.stat-card')
      .filter({ has: page.getByText('Occupied', { exact: true }) })
      .locator('strong')
  ).toHaveText('1');
  await expect(
    totals
      .locator('.stat-card')
      .filter({ has: page.getByText('Sites & units', { exact: true }) })
      .locator('strong')
  ).toHaveText('10');
  await nav(page, 'Customers & tenants');
  await page
    .getByRole('row')
    .filter({ hasText: 'River Sample' })
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await page.getByRole('button', { name: 'Archive record' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Complete active stays');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, 'Occupancy & history');
  await page.getByRole('button', { name: 'Move out', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm move-out' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await nav(page, 'Sites & units');
  await expect(page.getByRole('row').filter({ hasText: 'RV-01' })).toContainText('in preparation');
  await nav(page, 'Customers & tenants');
  await page
    .getByRole('row')
    .filter({ hasText: 'River Sample' })
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await page.getByRole('button', { name: 'Archive record' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Include archived').check();
  await page.getByRole('button', { name: 'River Sample', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('completed');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(errors).toEqual([]);
});
test('dashboard, forms, map, and customer records remain readable on this viewport in both themes', async ({
  page,
  request,
}, info) => {
  await request.post('http://127.0.0.1:54331/__test/seed');
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByRole('region', { name: 'Operational totals' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: `test-results/forgeos-${info.project.name}-${theme}.png`, fullPage: true });
  }
  await nav(page, 'Sites & units');
  await page.getByRole('button', { name: 'Add site / unit' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialogResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dialogResults.violations).toEqual([]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, 'Property map');
  await page.getByRole('button').filter({ hasText: 'RV-01' }).click();
  await expect(page.getByRole('dialog')).toContainText('River Sample');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, 'Customers & tenants');
  await expect(page.getByRole('button', { name: 'River Sample', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
test('restricted staff cannot read private records or forge a property write, and CSRF is rejected', async ({
  page,
  request,
}) => {
  const seed = await (await request.post('http://127.0.0.1:54331/__test/seed')).json();
  await login(page, 'technician');
  await expect(page.getByRole('heading', { name: 'Your role has limited access' })).toBeVisible();
  await nav(page, 'Customers & tenants');
  await expect(page.locator('body')).not.toContainText('river@example.com');
  const data = {
    entity: 'property',
    action: 'create',
    organization_id: seed.org,
    values: {
      name: 'Not permitted',
      category: 'rv_park',
      address: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'United States',
      timezone: 'America/Los_Angeles',
      phone: '',
      email: '',
      contact_name: '',
      description: '',
      notes: '',
      operating_status: 'active',
    },
  };
  const denied = await page.request.post('/api/records', { headers: { origin }, data });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toBe('Your role does not allow this action.');
  const csrf = await page.request.post('/api/records', {
    headers: { origin: 'https://untrusted.example' },
    data,
  });
  expect(csrf.status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to ForgeOS' })).toBeVisible();
});
