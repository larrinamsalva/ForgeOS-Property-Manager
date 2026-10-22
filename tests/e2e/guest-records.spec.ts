import { test, expect } from '@playwright/test';

test('each space can have its own type, rate, utilities, notes and an assigned customer record', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });

  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-15');
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();
  await expect(page.getByRole('region', { name: 'Edit space RV-15' })).toBeVisible();

  await page.getByLabel('Site / apartment name').fill('Apartment 15B');
  await page.getByLabel('Type of space').selectOption('apartment');
  await page.getByLabel('Area / building / row').fill('Building B');
  await page.getByLabel('Monthly rent ($)').fill('950');
  await page.getByLabel('Site information / notes').fill('Example: Covered parking and accessible doorway');
  await page.getByRole('button', { name: 'Save sample space' }).click();
  await expect(page.getByRole('status')).toContainText('RV-15 details updated');

  await nav.getByRole('button', { name: 'Customers' }).click();
  await page.getByLabel('Fictional customer name').fill('Example Apartment Tenant');
  await page.getByLabel('Assign an available site (optional)').selectOption('RV-15');
  await page.getByLabel('Phone number').fill('555-0100');
  await page.getByLabel('Email').fill('example@invalid.test');
  await page.getByLabel('Vehicle / RV details').fill('Sample gray car');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(page.getByRole('status')).toContainText('Example Apartment Tenant added');
  await page.getByLabel('Search', { exact: true }).fill('Example Apartment Tenant');
  await expect(page.getByRole('cell', { name: 'RV-15' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit customer Example Apartment Tenant' }).click();
  await expect(page.getByRole('region', { name: 'Edit customer Example Apartment Tenant' })).toBeVisible();
  await expect(page.getByLabel('Phone number').last()).toHaveValue('555-0100');
  await page.getByLabel('Customer name').fill('Example Tenant Updated');
  await page.getByRole('button', { name: 'Save sample customer' }).click();
  await expect(page.getByRole('status')).toContainText('Example Tenant Updated updated');

  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();
  await expect(page.getByLabel('Site / apartment name')).toHaveValue('Apartment 15B');
  await expect(page.getByLabel('Type of space')).toHaveValue('apartment');
  await expect(page.getByLabel('Monthly rent ($)')).toHaveValue('950');
  await expect(page.getByLabel('Site information / notes')).toHaveValue('Example: Covered parking and accessible doorway');
  await expect(page.getByText('Example Tenant Updated')).toBeVisible();
  expect(requests).toEqual([]);
});

test('photos and vehicle types remain grouped under the correct space, and reset clears them', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-02');
  await page.getByRole('button', { name: 'Details and photos for RV-02' }).click();
  await expect(page.getByRole('region', { name: 'Photos and vehicles for RV-02' })).toBeVisible();

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSmQAAAAASUVORK5CYII=';
  await page.getByLabel('What are these photos of?').selectOption('space');
  await page.getByLabel('Upload photos for this space').setInputFiles({ name: 'example-site.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('status').last()).toContainText('Added 1 local picture');
  await page.getByLabel('What are these photos of?').selectOption('boat');
  await page.getByLabel('Upload photos for this space').setInputFiles({ name: 'example-boat.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('img', { name: 'Boat / watercraft example for RV-02' })).toBeVisible();
  await expect(page.getByText('2 / 12 photos')).toBeVisible();

  await page.getByLabel('Vehicle type').selectOption('motorcycle');
  await page.getByLabel('Description / make / model').fill('Example touring motorcycle');
  await page.getByLabel('Sample identifier (optional)').fill('Motorcycle A');
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  await expect(page.getByText('Example touring motorcycle')).toBeVisible();

  await nav.getByRole('button', { name: 'Customers' }).click();
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-02' }).click();
  await expect(page.getByText('2 / 12 photos')).toBeVisible();
  await expect(page.getByText('Example touring motorcycle')).toBeVisible();

  await page.getByRole('button', { name: 'Remove photo example-boat.png' }).click();
  await expect(page.getByText('1 / 12 photos')).toBeVisible();
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-02');
  await page.getByRole('button', { name: 'Details and photos for RV-02' }).click();
  await expect(page.getByText('0 / 12 photos')).toBeVisible();
  await expect(page.getByText('Example touring motorcycle')).toHaveCount(0);
  expect(writes).toEqual([]);
});
