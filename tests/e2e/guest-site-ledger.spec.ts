import { expect, test } from '@playwright/test';

test('a site and its linked customer show the same recorded meter entry without contacting private APIs', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      writes.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Meter readings' }).click();
  await page.getByRole('button', { name: 'Save example reading' }).click();
  await expect(page.getByText('+45 kWh').first()).toBeVisible();

  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-01');
  await page.getByRole('button', { name: 'Details and photos for RV-01' }).click();
  const ledger = page.getByRole('region', { name: 'Meter and rent history for RV-01' });
  await expect(ledger.getByRole('heading', { name: 'Site meter-reading history' })).toBeVisible();
  await expect(ledger.getByText(/Usage \+45 kWh/)).toBeVisible();
  await expect(ledger.getByText('Resident at reading: Example Resident 01')).toBeVisible();

  await nav.getByRole('button', { name: 'Customers' }).click();
  await page.getByRole('button', { name: 'Edit customer Example Resident 01' }).click();
  const customerLedger = page.getByRole('region', { name: 'Meter and rent history for RV-01' });
  await expect(customerLedger.getByRole('heading', { name: 'Customer meter-reading history' })).toBeVisible();
  await expect(customerLedger.getByText(/Usage \+45 kWh/)).toBeVisible();
  expect(writes).toEqual([]);
});

test('sample rent flag responds to paid status and action drafts never send a text', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      writes.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-01');
  const site = page.locator('.demo-map-space[data-site="RV-01"]');

  const now = new Date();
  const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', day: '2-digit' })
    .formatToParts(now).find((p) => p.type === 'day')?.value ?? '0');
  if (day > 5) {
    await expect(site).toHaveClass(/overdue/);
    await expect(site.getByText('PAST DUE')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Details and photos for RV-01' }).click();
  const ledger = page.getByRole('region', { name: 'Meter and rent history for RV-01' });
  await ledger.getByRole('button', { name: 'Mark sample rent paid' }).click();
  await expect(site).not.toHaveClass(/overdue/);
  await ledger.getByRole('button', { name: 'Mark sample rent unpaid' }).click();
  if (day > 5) await expect(site).toHaveClass(/overdue/);
  await ledger.getByLabel('Past-due notice action').selectOption('late_fee_review');
  await ledger.getByLabel('Proposed late fee').fill('20');
  await ledger.getByRole('button', { name: 'Prepare sample notice' }).click();
  await expect(ledger.getByRole('heading', { name: 'Prepared notices · not sent' })).toBeVisible();
  await expect(ledger.getByText('No SMS was transmitted.', { exact: false })).toBeVisible();
  await ledger.getByLabel('Past-due notice action').selectOption('three_day_review');
  await ledger.getByRole('button', { name: 'Prepare sample notice' }).click();
  await expect(ledger.getByText('NOT a served notice.', { exact: false })).toBeVisible();
  expect(writes).toEqual([]);

  await page.getByRole('button', { name: 'Reset sample' }).click();
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-01');
  await page.getByRole('button', { name: 'Details and photos for RV-01' }).click();
  await expect(page.getByRole('heading', { name: 'Prepared notices · not sent' })).toHaveCount(0);
});
