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

  await page.getByLabel('Unit number or name').fill('Apartment 15B');
  await page.getByLabel('Unit type').selectOption('apartment');
  await page.getByLabel('Area / building / row').fill('Building B');
  await page.getByLabel('Monthly rent ($)').fill('950');
  await page.getByLabel('Site information / notes').fill('Example: Covered parking and accessible doorway');
  await page.getByRole('button', { name: 'Save sample space' }).click();
  await expect(page.locator('p.demo-notice[role="status"]')).toContainText('RV-15 details updated');

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
  await page.getByLabel('Customer name', { exact: true }).fill('Example Tenant Updated');
  await page.getByRole('button', { name: 'Save sample customer' }).click();
  await expect(page.getByRole('status')).toContainText('Example Tenant Updated updated');

  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();
  await expect(page.getByLabel('Unit number or name')).toHaveValue('Apartment 15B');
  await expect(page.getByLabel('Unit type')).toHaveValue('apartment');
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
  await expect(page.getByText('Example touring motorcycle', { exact: true })).toBeVisible();

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
  await expect(page.getByText('Example touring motorcycle', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});


test('RV site length, width, rent and electrical fields can be cleared and retyped without sticky zeros', async ({ page }) => {
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-15');
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();

  const fields = [
    { label: 'Length (feet)', value: '40' },
    { label: 'Width (feet)', value: '12.5' },
    { label: 'Monthly rent ($)', value: '795.50' },
    { label: 'Electrical service (amps)', value: '50' },
  ];
  for (const field of fields) {
    const input = page.getByLabel(field.label);
    await input.fill('');
    await expect(input, field.label + ' can be cleared').toHaveValue('');
    await input.pressSequentially(field.value);
    await expect(input, field.label + ' retypes without a leading zero').toHaveValue(field.value);
  }
  await page.getByRole('button', { name: 'Save sample space' }).click();
  await expect(page.locator('p.demo-notice[role="status"]')).toContainText('RV-15 details updated');

  await nav.getByRole('button', { name: 'Customers' }).click();
  const deposit = page.getByLabel('Deposit amount ($)');
  await deposit.fill('250');
  await deposit.fill('');
  await expect(deposit).toHaveValue('');
  await deposit.pressSequentially('175.25');
  await expect(deposit).toHaveValue('175.25');

  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();
  for (const field of fields) {
    await expect(page.getByLabel(field.label), field.label + ' saved correctly').toHaveValue(field.label === 'Monthly rent ($)' ? '795.5' : field.value);
  }
});


test('choose Site, Space, Apartment, Mobile Home or Campground and keep a separate unit number', async ({ page }) => {
  const apiWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
      apiWrites.push(request.url());
    }
  });

  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-15');
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();

  const unitType = page.getByLabel('Unit type');
  const typeOptions = unitType.locator('option');
  await expect(typeOptions).toHaveText(['Site', 'Space', 'Apartment', 'Mobile Home', 'Campground']);
  for (const designation of ['site', 'space', 'apartment', 'campground', 'mobile']) {
    await unitType.selectOption(designation);
    await expect(unitType).toHaveValue(designation);
  }
  await page.getByLabel('Unit number or name').fill('Lot 25');
  await page.getByRole('button', { name: 'Save sample space' }).click();
  await expect(page.locator('[data-site="RV-15"]')).toContainText('Mobile Home');
  await expect(page.locator('[data-site="RV-15"]')).toContainText('Lot 25');
  await expect(page.locator('[data-site="RV-15"]')).toContainText('RV-15');

  // The database-safe internal site ID stays RV-15 even when the display name changes.
  await nav.getByRole('button', { name: 'Customers' }).click();
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByRole('button', { name: 'Details and photos for RV-15' }).click();
  await expect(page.getByLabel('Unit type')).toHaveValue('mobile');
  await expect(page.getByLabel('Unit number or name')).toHaveValue('Lot 25');

  await unitType.selectOption('space');
  await page.getByRole('button', { name: 'Save sample space' }).click();
  await expect(page.locator('[data-site="RV-15"]')).toContainText('Space · Lot 25');
  expect(apiWrites).toEqual([]);
});


test('customer unit selector lists all unoccupied types across the property and protects reserved units', async ({ page }) => {
  const apiWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) apiWrites.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Sites & map' }).click();
  async function classify(id: string, designation: string, name: string) {
    await page.getByLabel('Find a space').fill(id);
    await page.getByRole('button', { name: 'Details and photos for ' + id }).click();
    await page.getByLabel('Unit type').selectOption(designation);
    await page.getByLabel('Unit number or name').fill(name);
    await page.getByRole('button', { name: 'Save sample space' }).click();
  }
  await classify('RV-15', 'apartment', 'A-15');
  await classify('RV-16', 'campground', 'Camp 16');
  await classify('RV-17', 'mobile', 'MH 17');
  await classify('RV-18', 'space', 'Space 18'); // Initial status is reserved.

  await nav.getByRole('button', { name: 'Customers' }).click();
  const type = page.getByLabel('Choose unit type');
  const assignment = page.getByLabel('Assign an available site (optional)');
  const nameInput = page.getByLabel('Fictional customer name');
  // 'Assigned' is immediately below the name, before type/number fields.
  const nameBox = await nameInput.boundingBox();
  const assignedBox = await assignment.boundingBox();
  const typeBox = await type.boundingBox();
  expect(nameBox && assignedBox && typeBox).toBeTruthy();
  expect(assignedBox!.y).toBeGreaterThan(nameBox!.y);
  expect(assignedBox!.y).toBeLessThan(typeBox!.y);
  await expect(type.locator('option')).toHaveText([
    'All sites, spaces, apartments, mobile homes & campgrounds',
    'Site', 'Space', 'Apartment', 'Mobile Home', 'Campground'
  ]);

  // This list contains every type independent of the Sites & map directory search/page.
  await expect(assignment.locator('option[value="RV-15"]')).toContainText('Apartment · A-15');
  await expect(assignment.locator('option[value="RV-16"]')).toContainText('Campground · Camp 16');
  await expect(assignment.locator('option[value="RV-17"]')).toContainText('Mobile Home · MH 17');
  // Reserved units are deliberately absent from the assignment dropdown.
  await expect(assignment.locator('option[value="RV-18"]')).toHaveCount(0);
  await expect(assignment.locator('option[value="RV-01"]')).toHaveCount(0); // Already occupied.

  // The separate complete-availability browser shows ALL actual vacant units,
  // independent of the type selector, directory page, and reserved units.
  const fullList = page.getByRole('region', { name: 'All available units' });
  await expect(fullList).toContainText('3 available sites and units');
  await expect(fullList).toContainText('20 created units');
  await page.getByRole('button', { name: 'Browse all available units' }).click();
  await expect(fullList.getByRole('button', { name: 'Assign Apartment A-15 (RV-15)' })).toBeVisible();
  await expect(fullList.getByRole('button', { name: 'Assign Campground Camp 16 (RV-16)' })).toBeVisible();
  await expect(fullList.getByRole('button', { name: 'Assign Mobile Home MH 17 (RV-17)' })).toBeVisible();
  await expect(fullList.getByRole('button', { name: 'Assign Space Space 18 (RV-18)' })).toHaveCount(0);
  await expect(fullList.getByRole('button', { name: 'Assign Site RV-01 (RV-01)' })).toHaveCount(0);

  await type.selectOption('apartment');
  await expect(assignment.locator('option[value="RV-15"]')).toBeEnabled();
  await expect(assignment.locator('option[value="RV-16"]')).toHaveCount(0);
  await page.getByLabel('Fictional customer name').fill('Example Apartment Arrival');
  await assignment.selectOption('RV-15');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(page.getByRole('status').last()).toContainText('Example Apartment Arrival added');

  // Occupying the apartment removes it from new-customer availability.
  await expect(assignment.locator('option[value="RV-15"]')).toHaveCount(0);
  await expect(fullList).toContainText('2 available sites and units');
  await expect(fullList.getByRole('button', { name: 'Assign Apartment A-15 (RV-15)' })).toHaveCount(0);
  // Even with Apartment still selected in the type dropdown, the full browser
  // can choose a site of a different type and reset the filter to All.
  await fullList.getByRole('button', { name: 'Assign Campground Camp 16 (RV-16)' }).click();
  await expect(type).toHaveValue('all');
  await expect(assignment).toHaveValue('RV-16');
  await type.selectOption('campground');
  await expect(assignment.locator('option[value="RV-16"]')).toBeEnabled();
  await page.getByLabel('Fictional customer name').fill('Example Camp Guest');
  await assignment.selectOption('RV-16');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(assignment.locator('option[value="RV-16"]')).toHaveCount(0);

  // The original customer can still see the assigned apartment during an edit.
  await page.getByLabel('Search', { exact: true }).fill('Example Apartment Arrival');
  await page.getByRole('button', { name: 'Edit customer Example Apartment Arrival' }).click();
  const editing = page.getByRole('region', { name: 'Edit customer Example Apartment Arrival' });
  await expect(editing.getByLabel('Choose unit type')).toHaveValue('apartment');
  await expect(editing.getByLabel('Assigned site (optional)').locator('option[value="RV-15"]')).toBeEnabled();
  expect(apiWrites).toEqual([]);
});



test('Add Customer links a typed Space 88 to its available unit and blocks occupied or reserved numbers', async ({ page }) => {
  const apiWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) apiWrites.push(request.url());
  });
  await page.goto('/demo');
  const nav = page.getByRole('navigation', { name: 'Guest demo navigation' });
  await nav.getByRole('button', { name: 'Property layout' }).click();
  await page.getByLabel('Spaces to add now (1–250 per batch)').fill('68');
  await page.getByRole('button', { name: 'Add spaces' }).click();

  await nav.getByRole('button', { name: 'Sites & map' }).click();
  await page.getByLabel('Find a space').fill('RV-88');
  await page.getByRole('button', { name: 'Details and photos for RV-88' }).click();
  await page.getByLabel('Unit type').selectOption('space');
  await page.getByRole('button', { name: 'Save sample space' }).click();

  await nav.getByRole('button', { name: 'Customers' }).click();
  const type = page.getByLabel('Choose unit type');
  const number = page.getByLabel('Space / unit number');
  const assignment = page.getByLabel('Assign an available site (optional)');
  await type.selectOption('space');
  await number.fill('88');
  await expect(assignment).toHaveValue('RV-88');
  await expect(page.getByText('Selected: I live in Space 88')).toBeVisible();
  await number.fill('Space 88');
  await expect(assignment).toHaveValue('RV-88');

  await page.getByLabel('Fictional customer name').fill('Example Space 88 Resident');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(page.locator('.demo-notice[role="status"]')).toContainText('Example Space 88 Resident added');
  await expect(number).toHaveValue('');
  await expect(assignment.locator('option[value="RV-88"]')).toHaveCount(0);
  await number.fill('88');
  await expect(assignment).toHaveValue('unassigned');
  await page.getByLabel('Fictional customer name').fill('Another Sample Resident');
  await page.getByRole('button', { name: 'Add example customer' }).click();
  await expect(page.locator('.demo-record-error[role="alert"]')).toContainText('Space or unit number not found');
  await expect(page.getByRole('button', { name: 'Edit customer Another Sample Resident' })).toHaveCount(0);

  // Reserved RV-18 and occupied RV-01 can never be resolved to new assignments.
  await type.selectOption('site');
  await number.fill('18');
  await expect(assignment).toHaveValue('unassigned');
  await number.fill('1');
  await expect(assignment).toHaveValue('unassigned');
  expect(apiWrites).toEqual([]);
});
