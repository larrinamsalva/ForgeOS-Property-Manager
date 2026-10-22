import { test, expect } from '@playwright/test';

test('visitors explore a no-login ForgeOS demo without touching business APIs', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && /^\/api\/(records|meters|billing|collections|operations|commercial|portal)/.test(new URL(req.url()).pathname)) {
      mutations.push(req.url());
    }
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Fictional people, sample balances', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveCount(0);

  const menu = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await menu.getByRole('button', { name: 'Sites & map' }).click();
  const site = page.getByRole('button', { name: /RV-15.*available/i });
  await site.click();
  await expect(page.getByRole('status')).toContainText('RV-15 — Reserved');
  await page.getByRole('button', { name: /RV-15.*reserved/i }).click();
  await expect(page.getByRole('status')).toContainText('RV-15 — Checked in');

  await menu.getByRole('button', { name: 'Meter readings' }).click();
  await page.getByRole('button', { name: 'Save example reading' }).click();
  await expect(page.getByText('+45 kWh')).toBeVisible();

  await menu.getByRole('button', { name: 'Maintenance' }).click();
  await page.locator('.demo-work').filter({ hasText: 'Inspect water hookup' }).getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByRole('status')).toContainText('No real job changed');

  await menu.getByRole('button', { name: 'Resident view' }).click();
  await expect(page.getByText('Welcome home, Example Resident!')).toBeVisible();

  await page.getByRole('button', { name: 'Reset sample' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('real staff routes still require authentication', async ({ page, request }) => {
  await page.goto('/properties');
  await expect(page).toHaveURL(/\/demo$/);
  const response = await request.post('/api/records', {
    headers: { origin: 'http://127.0.0.1:3100' },
    data: { entity: 'organization', action: 'create', values: { name: 'should not persist' } },
  });
  expect(response.status()).toBe(401);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Explore ForgeOS without an account' })).toBeVisible();
});
