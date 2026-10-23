import { test, expect } from '@playwright/test';

test('fictional site and customer files share meter reading history and clear the fifth-day rent flag', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00-07:00'));
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  const overview = page.getByRole('region', { name: 'Overview spaces and customers' });
  const row = overview.locator('[data-overview-site="RV-01"]');
  await expect(row.getByText('Rent past due')).toBeVisible();
  await row.getByRole('button', { name: 'Open space record for RV-01' }).click();
  const account = page.getByRole('region', { name: 'Meter and rent account for RV-01' });
  await expect(account.getByText('RED FLAG · Rent past due')).toBeVisible();
  await expect(account.getByRole('table', { name: 'Meter history for RV-01' })).toContainText('No readings yet');

  await account.getByRole('button', { name: 'Open meter reader to add a sample reading' }).click();
  await expect(page.getByLabel('Site', { exact: true })).toHaveValue('RV-01');
  await page.getByRole('button', { name: 'Save example reading' }).click();
  await nav.getByRole('button', { name: 'Overview' }).click();
  await overview.locator('[data-overview-site="RV-01"]')
    .getByRole('button', { name: 'Open space record for RV-01' }).click();
  await expect(account.getByRole('table', { name: 'Meter history for RV-01' })).toContainText('45 kWh');

  await account.getByLabel('Notice to prepare').selectOption('past_due_warning');
  await expect(account.getByLabel('Notice preview for RV-01')).toContainText('rent of $725.00');
  await account.getByRole('button', { name: 'Save draft for staff review (no SMS)' }).click();
  await expect(account.getByText('Draft only, not sent')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Nothing was texted');

  await account.getByRole('button', { name: 'Mark sample rent paid for 2026-10' }).click();
  await expect(account.getByText('Rent paid', { exact: true })).toBeVisible();
  await expect(page.locator('[data-site="RV-01"]').getByText('RENT PAST DUE')).toHaveCount(0);

  await nav.getByRole('button', { name: 'Overview' }).click();
  await expect(row.getByText('Rent past due')).toHaveCount(0);
  await row.getByRole('button', { name: 'Open customer record for RV-01' }).click();
  await expect(page.getByRole('region', { name: 'Meter and rent account for RV-01' })
    .getByRole('table', { name: 'Meter history for RV-01' })).toContainText('45 kWh');
  expect(writes).toEqual([]);
});

test('3-day and late-fee workflows remain drafts without SMS or charges', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00-07:00'));
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-02' }).click();
  const account = page.getByRole('region', { name: 'Meter and rent account for RV-02' });
  await account.getByLabel('Notice to prepare').selectOption('late_fee_review');
  await expect(account.getByLabel('Notice preview for RV-02')).toContainText('Internal staff review only');
  await account.getByRole('button', { name: 'Save draft for staff review (no SMS)' }).click();
  await account.getByLabel('Notice to prepare').selectOption('three_day_legal_review');
  await expect(account.getByLabel('Notice preview for RV-02')).toContainText('INTERNAL LEGAL REVIEW ONLY');
  await account.getByRole('button', { name: 'Save draft for staff review (no SMS)' }).click();
  await expect(account.getByText('Draft only, not sent')).toHaveCount(2);
  await expect(account).toContainText('No phone recorded');
});
