import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { addDays, dateAtProperty } from '../../src/lib/domain';
import type { BillingSnapshot } from '../../src/lib/billing-domain';
const origin = 'http://127.0.0.1:3100';
async function login(page: Page, name = 'owner') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@forgeos.example`);
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Sign in to ForgeOS' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  if (name === 'owner')
    await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
}
async function billing(page: Page) {
  await page.getByLabel('Property view').selectOption({ label: 'Pine Creek RV Park' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveText('Pine Creek RV Park');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Utilities & billing', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Utilities & billing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload billing' })).toBeEnabled();
}
async function submit(page: Page, name: string, api = 'billing') {
  const wait = page.waitForResponse(
    (r) => r.url().endsWith(`/api/${api}`) && r.request().method() === 'POST'
  );
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  const response = await wait;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  if (api === 'billing') await expect(page.getByRole('button', { name: 'Reload billing' })).toBeEnabled();
  return response;
}
async function policy(page: Page) {
  await page.getByRole('button', { name: 'Rates & policy', exact: true }).click();
  await page.getByRole('button', { name: 'Configure billing', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Fictional reviewed property billing policy');
  await submit(page, 'Save billing policy');
}
async function rate(page: Page, utility = 'electric', included = false) {
  await page.getByRole('button', { name: 'Add rate version', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Schedule name', { exact: true }).fill(`Test ${utility} authorization`);
  await dialog.getByRole('combobox', { name: 'Utility', exact: true }).selectOption(utility);
  await dialog
    .getByLabel('Effective from', { exact: true })
    .fill(addDays(dateAtProperty('America/Los_Angeles'), -10));
  await dialog.getByLabel('Billed unit', { exact: true }).fill(utility === 'electric' ? 'kWh' : 'gallons');
  if (included) await dialog.getByLabel('Included in rent (all charges zero)', { exact: true }).check();
  else {
    await dialog.getByLabel('Tier 1 price ($ per unit)', { exact: true }).fill('0.20');
    await dialog.getByLabel('Monthly base service ($)', { exact: true }).fill('5.00');
  }
  await dialog
    .getByLabel('Register unit 1', { exact: true })
    .fill(utility === 'electric' ? 'kWh' : 'gallons');
  await dialog
    .getByLabel('Rate authorization and reason', { exact: true })
    .fill('Fictional rate approved for this test property');
  await submit(page, 'Save rate version');
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:54331/__test/reset');
  await request.post('http://127.0.0.1:54331/__test/seed');
});
test('approved meter captures become a traceable invoice, PDF, credit, reversal and void', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'The full financial lifecycle runs once; responsive billing runs on each viewport.'
  );
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  const seed = await (await page.request.post('http://127.0.0.1:54331/__test/billing-baseline')).json();
  const capture = await page.request.post('/api/meters', {
    headers: { origin },
    data: {
      command: 'capture',
      payload: {
        ...seed.scope,
        id: randomUUID(),
        route_item_id: seed.closingItem,
        assignment_id: seed.assignment,
        captured_at: new Date().toISOString(),
        device_id: randomUUID(),
        previous_reading_id: seed.reading,
        previous_review_id: seed.review,
        value: '10420',
        kind: 'actual',
        flag: 'none',
        notes: 'Fictional closing capture',
        photo: null,
      },
    },
  });
  expect(capture.ok(), await capture.text()).toBe(true);
  await page.goto(`/meters?organization=${seed.scope.organization_id}&property=${seed.scope.property_id}`);
  await page.getByRole('button', { name: 'Supervisor review', exact: true }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Review and correction reason', exact: true })
    .fill('Compared original register and accepted closing evidence');
  await submit(page, 'Save review', 'meters');
  await billing(page);
  await policy(page);
  await rate(page);
  await rate(page, 'water', true);
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.getByRole('button', { name: 'New draft invoice', exact: true }).click();
  await page.getByLabel('Billing starts on').fill(seed.starts);
  await page.getByLabel('Billing ends on (exclusive)').fill(seed.ends);
  await page.getByLabel('Planned due date').fill(addDays(seed.ends, 15));
  await page.getByLabel('Authorized fee ($)', { exact: true }).fill('1.01');
  await page.getByLabel('fee description', { exact: true }).fill('Approved test service');
  await page
    .getByLabel('fee authorization reason', { exact: true })
    .fill('Reviewed fictional service request');
  await page.getByLabel('Agreed discount ($)', { exact: true }).fill('0.01');
  await page.getByLabel('discount description', { exact: true }).fill('Agreed test discount');
  await page.getByLabel('discount authorization reason', { exact: true }).fill('Reviewed fictional discount');
  const created = await submit(page, 'Calculate draft');
  const id = (await created.json()).id as string;
  const retry = await page.request.post('/api/billing', {
    headers: { origin },
    data: created.request().postDataJSON(),
  });
  expect((await retry.json()).id).toBe(id);
  await page.getByRole('button', { name: 'INV-000001', exact: true }).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('region', { name: 'Invoice items' })).toContainText('$84.00');
  await expect(detail).toContainText('420 × 1 × 1 = 420 kWh');
  const snapshot = (await (
    await page.request.get(`/api/billing?organization=${seed.scope.organization_id}`)
  ).json()) as BillingSnapshot;
  const revision = snapshot.revisions[0];
  expect(revision.calculation.reading_ids).toHaveLength(2);
  expect(revision.calculation.lines.find((l) => l.category === 'electric')?.subtotal_cents).toBe('8400');
  const downloadEvent = page.waitForEvent('download');
  await detail.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const pdf = await downloadEvent;
  expect(pdf.suggestedFilename()).toBe('INV-000001.pdf');
  const pdfPath = await pdf.path();
  expect((await readFile(pdfPath!)).subarray(0, 5).toString()).toBe('%PDF-');
  await pdf.saveAs(info.outputPath('billing-statement.pdf'));
  const [print] = await Promise.all([
    page.waitForEvent('popup'),
    detail.getByRole('link', { name: 'Printable statement' }).click(),
  ]);
  await expect(print.getByRole('heading', { name: 'Pine Creek RV Park' })).toBeVisible();
  await expect(print.getByText('Electric usage', { exact: true }).first()).toBeVisible();
  await print.emulateMedia({ media: 'print' });
  await print.pdf({ path: info.outputPath('browser-print.pdf'), format: 'Letter', printBackground: true });
  await print.close();
  await detail.getByRole('button', { name: 'Approve invoice', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Supervisor verified readings, authorized rate and statement total');
  const approval = await submit(page, 'Approve invoice');
  const approvalRetry = await page.request.post('/api/billing', {
    headers: { origin },
    data: approval.request().postDataJSON(),
  });
  expect(approvalRetry.ok()).toBe(true);
  await page.getByRole('button', { name: 'INV-000001', exact: true }).click();
  await page.getByRole('button', { name: 'Record credit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Credit amount ($)', exact: true }).fill('10.01');
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Owner approved fictional concession');
  await submit(page, 'Record credit');
  await page.getByRole('button', { name: 'INV-000001', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse this credit', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Concession entered against wrong statement');
  await submit(page, 'Record reversing entry');
  await page.getByRole('button', { name: 'Customer ledger', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Customer ledger entries' })).toContainText(
    'credit reversal'
  );
  const ledgerDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export ledger', exact: true }).click();
  expect((await ledgerDownload).suggestedFilename()).toContain('charge-ledger');
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.getByRole('button', { name: 'INV-000001', exact: true }).click();
  await page.getByRole('button', { name: 'Void invoice', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Fictional invoice replaced after review');
  await submit(page, 'Void invoice');
  await page.getByRole('button', { name: 'Customer ledger', exact: true }).click();
  await expect(page.getByText('Charges after credits $0.00', { exact: true })).toBeVisible();
  const final = (await (
    await page.request.get(`/api/billing?organization=${seed.scope.organization_id}`)
  ).json()) as BillingSnapshot;
  expect(final.ledger.filter((e) => e.kind === 'approval')).toHaveLength(1);
  expect(final.revisions).toHaveLength(1);
  expect(errors).toEqual([]);
  const unsigned = await page.context().browser()!.newContext();
  const protectedPdf = await unsigned.request.get(`${origin}/api/billing/${id}/pdf`);
  expect(protectedPdf.status()).toBe(401);
  await unsigned.close();
});
test('site customer record opens preselected monthly draft preparation without issuing a charge', async ({page}) => {
  await login(page);
  await billing(page);
  await policy(page);
  await page.getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Sites & units', exact: true }).click();
  await page.getByRole('button', { name: 'RV-01', exact: true }).click();
  const profile = page.getByRole('dialog');
  const prepareLink = profile.getByRole('link', {name:'Prepare monthly bill'});
  await expect(prepareLink).toBeVisible();
  const link = await prepareLink.getAttribute('href');
  expect(link).toContain('/billing?');
  expect(link).toContain('site=');
  expect(link).toContain('stay=');
  await prepareLink.click();
  const siteReview=page.getByRole('region',{name:'Site monthly billing preparation'});
  await expect(siteReview).toBeVisible();
  await expect(siteReview).toContainText('Monthly billing · RV-01');
  await expect(siteReview).toContainText('River Sample');
  await expect(siteReview).toContainText('Property billing policy');
  await expect(siteReview).toContainText('Existing invoices');
  await expect(siteReview).toContainText('rate schedule');
  await expect(siteReview).toContainText('boundary readings');
  await expect(page.getByRole('region',{name:'Invoice records'})).toHaveCount(0);
  await siteReview.getByRole('button',{name:'Calculate draft for this site'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Calculate draft invoice'})).toBeVisible();
  const chosen=dialog.getByRole('combobox',{name:'Customer stay'});
  await expect(chosen.locator('option:checked')).toContainText('River Sample');
  const chosenStart=await dialog.getByLabel('Billing starts on').inputValue();
  const chosenEnd=await dialog.getByLabel('Billing ends on (exclusive)').inputValue();
  expect(chosenStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(chosenEnd > chosenStart).toBe(true);
  await expect(siteReview).toContainText(chosenStart + ' → ' + chosenEnd);
  await dialog.getByRole('button',{name:'Cancel'}).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await page.request.get('/api/billing?organization='+new URL(link!, 'http://localhost').searchParams.get('organization'))).json()).invoices).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('monthly billing run lists real stay records by month without auto-issuing', async ({page}) => {
  await login(page);
  await billing(page);
  await policy(page);
  await page.getByRole('button', {name:'Monthly run', exact:true}).click();
  const board=page.getByRole('region',{name:'Property monthly billing board'});
  await expect(board).toBeVisible();
  // The fictional resident arrived this month, so the last completed month has no stay.
  await expect(board).toContainText('Every occupied site, one billing view');
  await board.getByLabel('Billing month').fill(dateAtProperty('America/Los_Angeles').slice(0,7));
  const table=board.getByRole('region',{name:'Monthly billing site table'});
  await expect(table).toContainText('RV-01');
  await expect(table).toContainText('River Sample');
  await expect(board).toContainText('1 stays');
  await board.getByLabel('Find billing site or resident').fill('Not here');
  await expect(board.getByText('No stays match this property, month and filter.')).toBeVisible();
  await board.getByLabel('Find billing site or resident').fill('River');
  await expect(table).toContainText('River Sample');
  await board.getByLabel('Billing readiness filter').selectOption('review');
  await expect(table).toContainText('Needs review');
  const link=table.getByRole('link',{name:'Review / prepare draft'});
  await expect(link).toBeVisible();
  await link.click();
  const focused=page.getByRole('region',{name:'Site monthly billing preparation'});
  await expect(focused).toBeVisible();
  await expect(focused).toContainText('River Sample');
  await expect(focused).toContainText('Monthly billing · RV-01');
  await focused.getByRole('button',{name:'Calculate draft for this site'}).click();
  const modal=page.getByRole('dialog');
  const starts=await modal.getByLabel('Billing starts on').inputValue();
  const ends=await modal.getByLabel('Billing ends on (exclusive)').inputValue();
  expect(ends).toBeGreaterThan(starts);
  await expect(focused).toContainText(starts + ' → ' + ends);
  await modal.getByRole('button',{name:'Cancel'}).click();
  // Navigating and pre-filling must not even create a draft, much less issue a bill.
  const url=new URL(page.url());
  const record=await (await page.request.get('/api/billing?organization='+url.searchParams.get('organization'))).json();
  expect(record.invoices).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('billing forms, rates and internal statements remain accessible on every viewport and theme', async ({
  page,
}, info) => {
  await login(page);
  await billing(page);
  await policy(page);
  await rate(page);
  await page.getByRole('button', { name: 'Add rate version', exact: true }).click();
  await page.getByRole('button', { name: 'Add conversion', exact: true }).click();
  await page.getByRole('button', { name: 'Add tier', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
      true
    );
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('billing-rates.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Invoices', exact: true }).click();
  await page.getByRole('button', { name: 'New draft invoice', exact: true }).click();
  const today = dateAtProperty('America/Los_Angeles');
  await page.getByLabel('Billing starts on').fill(addDays(today, -1));
  await page.getByLabel('Billing ends on (exclusive)').fill(today);
  await page.getByRole('checkbox', { name: 'Include metered utilities', exact: true }).uncheck();
  await page
    .getByLabel('Utility inclusion or exclusion reason', { exact: true })
    .fill('Utility invoice prepared separately after readings arrive');
  await submit(page, 'Calculate draft');
  await page.getByRole('button', { name: 'INV-000001', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
  ).toEqual([]);
  const [statement] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Printable statement' }).click(),
  ]);
  await expect(statement.getByRole('heading', { name: 'Pine Creek RV Park' })).toBeVisible();
  expect(await statement.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await statement.close();
});
test('billing APIs reject cross-origin actions and unassigned financial access', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'API boundary checks run once.');
  await login(page);
  await billing(page);
  const url = new URL(page.url());
  const org = url.searchParams.get('organization');
  expect(
    (
      await page.request.post('/api/billing', { headers: { origin: 'https://untrusted.example' }, data: {} })
    ).status()
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/billing', {
        headers: { origin },
        data: { command: 'approve_invoice', payload: { status: 'paid' } },
      })
    ).status()
  ).toBe(400);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
  await login(page, 'technician');
  const response = await page.request.get(`/api/billing?organization=${org}`);
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as BillingSnapshot;
  expect(data.invoices).toEqual([]);
  expect(data.ledger).toEqual([]);
  expect(data.rates).toEqual([]);
});
