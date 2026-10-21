import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addDays, dateAtProperty } from '../../src/lib/domain';
const origin = 'http://127.0.0.1:3100';
const today = () => dateAtProperty('America/Los_Angeles');
async function nav(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('owner@forgeos.example');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  await page.getByLabel('Property view').selectOption({ label: 'Pine Creek RV Park' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveText('Pine Creek RV Park');
}
async function submit(page: Page, name: string) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  return result;
}
async function book(
  page: Page,
  site: string,
  start = today(),
  end = addDays(today(), 3),
  status = 'confirmed'
) {
  await page.getByRole('button', { name: 'New reservation', exact: true }).click();
  const form = page.getByRole('dialog');
  await form
    .getByRole('combobox', { name: 'Site / unit', exact: true })
    .selectOption({ label: `${site} · rv` });
  await form.getByRole('combobox', { name: 'Customer', exact: true }).selectOption({ label: 'River Sample' });
  await form.getByLabel('Arrival date').fill(start);
  await form.getByLabel('Departure date').fill(end);
  await form.getByRole('combobox', { name: 'Booking status', exact: true }).selectOption(status);
  await form.getByLabel('Agreed rate ($)').fill('45.29');
  await form.getByLabel('Deposit requirement ($)').fill('100.00');
  await form.getByLabel('Deposit noted as received ($)').fill('25.00');
  await form.getByLabel('Deposit reference').fill('Fictional receipt TEST-01');
  await form.getByLabel('Guest count').fill('2');
  const response = await submit(page, 'Create reservation');
  const id = (await response.json()).data.id as string;
  const code = `FG-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  await expect(
    page.getByRole('region', { name: 'Booking records', exact: true }).getByRole('button', { name: code })
  ).toBeVisible();
  return { code, payload: response.request().postDataJSON() };
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
  await request.post('http://127.0.0.1:54331/__test/seed');
});
test('booking, check-in, lease renewal, site transfer and move-out retain the customer history', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Full lifecycle runs once. Responsive planning runs on every viewport.'
  );
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await nav(page, 'Reservations');
  const created = await book(page, 'RV-02');
  const conflict = await page.request.post('/api/records', { headers: { origin }, data: created.payload });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error).toContain('overlapping');
  await page.reload();
  const bookings = page.getByRole('region', { name: 'Booking records', exact: true });
  await bookings.getByRole('button', { name: created.code }).click();
  await page.getByRole('button', { name: 'Edit reservation', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Site / unit', exact: true })
    .selectOption({ label: 'RV-03 · rv' });
  const stale = await submit(page, 'Save reservation');
  const stalePayload = stale.request().postDataJSON();
  const staleResponse = await page.request.post('/api/records', { headers: { origin }, data: stalePayload });
  expect(staleResponse.status()).toBe(409);
  expect((await staleResponse.json()).error).toContain('changed');
  await bookings.getByRole('button', { name: created.code }).click();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await page.getByLabel('Occupants', { exact: true }).fill('River Sample and fictional guest');
  await page.getByLabel('Move-in condition').fill('Clean; no damage noted');
  await page.getByLabel('Initial meter handover notes').fill('Test photo reference IN-01');
  await submit(page, 'Confirm check-in');
  await expect(bookings.getByRole('row').filter({ hasText: created.code })).toContainText('checked in');
  await nav(page, 'Occupancy & history');
  const checkedIn = page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^RV-03/ }) });
  await expect(checkedIn).toContainText('$45.29');
  await expect(checkedIn).toContainText('nightly');
  await checkedIn.getByRole('button', { name: 'Departure plan', exact: true }).click();
  await page.getByLabel('Planned departure', { exact: true }).fill(addDays(today(), 5));
  await page.getByLabel('Reason for departure change').fill('Guest extended visit');
  await submit(page, 'Save departure plan');
  await expect(checkedIn).toContainText(addDays(today(), 5));
  await nav(page, 'Leases & renewals');
  await page.getByRole('button', { name: 'Record lease terms', exact: true }).click();
  await page.getByLabel('Existing stay').selectOption({ label: `River Sample · RV-03 · ${today()}` });
  await page.getByLabel('Agreement or document reference').fill('Fictional reviewed agreement TEST-LEASE');
  await submit(page, 'Save lease terms');
  const terms = page.getByRole('region', { name: 'Lease terms', exact: true });
  await terms.getByRole('button', { name: 'Renew', exact: true }).click();
  await submit(page, 'Save renewal');
  await page.reload();
  await expect(terms.locator('tbody tr')).toHaveCount(2);
  const renewal = terms.getByRole('row').filter({ hasText: 'Renewal' });
  await renewal.getByRole('button', { name: 'Void', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Wrong term recorded; replacement follows');
  await submit(page, 'Void terms');
  await terms
    .getByRole('row')
    .filter({ hasText: 'Initial term' })
    .getByRole('button', { name: 'Renew', exact: true })
    .click();
  await submit(page, 'Save renewal');
  await expect(terms.locator('tbody tr')).toHaveCount(3);
  await nav(page, 'Occupancy & history');
  await checkedIn.getByRole('button', { name: 'Transfer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Destination site / unit', exact: true })
    .selectOption({ label: 'RV-04' });
  await page.getByLabel('New agreed rate ($)').fill('52.10');
  await page
    .getByLabel('Transfer reason and condition notes')
    .fill('Requested a quieter site; site inspected');
  await submit(page, 'Confirm transfer');
  await expect(checkedIn).toContainText('completed');
  const current = page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^RV-04/ }) });
  await expect(current).toContainText('Transferred from RV-03');
  await current.getByRole('button', { name: 'Move out', exact: true }).click();
  await page.getByLabel('Move-out condition').fill('Clean transfer site');
  await page.getByLabel('Maintenance follow-up needed').check();
  await page.getByLabel('Final meter handover notes').fill('Test reference OUT-01');
  await page.getByLabel('Billing and deposit handover notes').fill('External test records reviewed');
  await submit(page, 'Confirm move-out');
  await page.reload();
  await expect(current).toContainText('completed');
  await nav(page, 'Customers & tenants');
  await page.getByRole('button', { name: 'River Sample', exact: true }).click();
  const history = page.getByRole('dialog');
  await expect(history).toContainText(created.code);
  await expect(history).toContainText('Fictional reviewed agreement TEST-LEASE');
  await history
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: /^RV-04/ }) })
    .getByText('View handover', { exact: true })
    .click();
  await expect(history).toContainText('Clean transfer site');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, 'Reservations');
  const cancelled = await book(page, 'RV-05', addDays(today(), 1), addDays(today(), 2));
  await bookings.getByRole('button', { name: cancelled.code }).click();
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('Plans changed');
  await submit(page, 'Confirm cancellation');
  await expect(bookings.getByRole('row').filter({ hasText: cancelled.code })).toContainText('cancelled');
  const absent = await book(page, 'RV-06');
  await bookings.getByRole('button', { name: absent.code }).click();
  await page.getByRole('button', { name: 'Mark no-show', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reason', exact: true }).fill('Did not arrive');
  await submit(page, 'Confirm no-show');
  await expect(bookings.getByRole('row').filter({ hasText: absent.code })).toContainText('no show');
  expect(errors).toEqual([]);
});
test('calendar, availability and booking forms work across viewport sizes and themes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await nav(page, 'Reservations');
  for (const mode of ['Month', 'Day', 'Week']) {
    await page
      .getByRole('group', { name: 'Calendar view' })
      .getByRole('button', { name: mode, exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Reservation calendar grid' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
      true
    );
  }
  await page.getByRole('button', { name: 'Search availability', exact: true }).click();
  const available = page.getByRole('region', { name: 'Availability results' });
  await expect(available.getByRole('button').filter({ hasText: 'RV-02' })).toBeVisible();
  await expect(available.getByRole('button').filter({ hasText: 'RV-01' })).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/planning-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'New reservation', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await nav(page, 'Leases & renewals');
  await page.getByRole('button', { name: 'Record lease terms', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(errors).toEqual([]);
});
