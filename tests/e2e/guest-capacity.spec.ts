import { test, expect } from '@playwright/test';

test('guest can expand to 700+ spaces, add customers as they arrive, and search the directory', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The large-batch performance and directory test runs once on desktop.');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
  });

  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Property layout' }).click();
  await expect(page.getByRole('heading', { name: 'Plan your property capacity' })).toBeVisible();
  await expect(page.getByLabel('Planned number of RV spaces or units')).toHaveValue('700');
  await expect(page.getByText('20', { exact: true }).first()).toBeVisible();

  const batch = page.getByLabel('Spaces to add now (1–250 per batch)');
  for (const count of [250, 250, 180]) {
    await batch.fill(String(count));
    await page.getByRole('button', { name: 'Add spaces' }).click();
  }
  await expect(page.getByText('700', { exact: true }).first()).toBeVisible();
  await batch.fill('1');
  await page.getByRole('button', { name: 'Add spaces' }).click();
  await expect(page.getByText('701', { exact: true }).first()).toBeVisible();
  // Overview keeps 701+ rows accessible without rendering all rows at once.
  await nav.getByRole('button', { name: 'Overview' }).click();
  const overview = page.getByRole('region', { name: 'Overview spaces and customers' });
  await expect(overview.locator('[data-overview-site]')).toHaveCount(25);
  await page.getByLabel('Search space or customer').fill('RV-701');
  await expect(overview.locator('[data-overview-site]')).toHaveCount(1);
  await overview.getByRole('button', { name: 'Open space record for RV-701' }).click();
  await expect(page.getByRole('region', { name: 'Assigned customer for RV-701' })).toContainText('No current customer');
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-701');
  await expect(page.locator('[data-site="RV-701"]')).toBeVisible();
  await expect(page.locator('.demo-map-space')).toHaveCount(1);

  await nav.getByRole('button', { name: 'Customers' }).click();
  // Initial sample has 20 created units, 14 occupied, 3 available and 3 held.
  // Adding 681 units results in all 684 genuinely available units across this property.
  const availablePanel = page.getByRole('region', { name: 'All available units' });
  await expect(availablePanel).toContainText('684 available sites and units');
  await expect(availablePanel).toContainText('701 created units');
  await page.getByRole('button', { name: 'Browse all available units' }).click();
  const availableSearch = page.getByLabel('Search all available sites and units');
  await availableSearch.fill('RV-701');
  await expect(page.getByRole('button', { name: 'Assign Site RV-701 (RV-701)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign Site RV-01 (RV-01)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Assign Site RV-701 (RV-701)' }).click();
  await expect(page.getByLabel('Assign an available site (optional)')).toHaveValue('RV-701');
  // Availability spans all 701 sites, even though the site directory was filtered.
  const filter = page.getByLabel('Choose unit type');
  const assignment = page.getByLabel('Assign an available site (optional)');
  await expect(assignment.locator('option[value="RV-701"]')).toBeEnabled();
  await filter.selectOption('apartment');
  await expect(assignment.locator('option[value="RV-701"]')).toHaveCount(0);
  await filter.selectOption('site');
  await expect(assignment.locator('option[value="RV-701"]')).toBeEnabled();
  await page.getByLabel('Fictional customer name').fill('Example New Arrival');
  await assignment.selectOption('RV-701');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(page.getByRole('status')).toContainText('Example New Arrival added');
  await expect(availablePanel).toContainText('683 available sites and units');
  await expect(page.getByRole('button', { name: 'Assign Site RV-701 (RV-701)' })).toHaveCount(0);
  await page.getByLabel('Search', { exact: true }).fill('Example New Arrival');
  await expect(page.getByRole('cell', { name: 'Example New Arrival', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'RV-701' })).toBeVisible();
  expect(writes).toEqual([]);
});

test('guest can upload a sample image, mark a location and download the plan without account access', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url());
  });
  await page.goto('/demo');
  await page.getByRole('navigation', { name: 'Guest demo navigation' }).getByRole('button', { name: 'Property layout' }).click();

  await page.getByLabel('Upload property layout').setInputFiles({
    name: 'example-park-layout.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSmQAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByRole('status')).toContainText('not uploaded or saved to a server');
  await expect(page.getByText('example-park-layout.png')).toBeVisible();
  const layout = page.getByRole('button', { name: 'Place site RV-01 on uploaded layout' });
  await expect(layout).toBeVisible();
  await layout.click({ position: { x: 30, y: 30 } });
  await expect(page.getByText('1 numbered spots')).toBeVisible();

  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download site list (CSV)' }).click();
  expect((await csv).suggestedFilename()).toBe('forgeos-example-site-plan.csv');

  const image = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download numbered layout image' }).click();
  expect((await image).suggestedFilename()).toBe('forgeos-numbered-property-layout.png');

  await page.getByRole('button', { name: 'Reset sample' }).click();
  await page.getByRole('navigation', { name: 'Guest demo navigation' }).getByRole('button', { name: 'Property layout' }).click();
  await expect(page.getByText('example-park-layout.png')).toHaveCount(0);
  expect(writes).toEqual([]);
});
