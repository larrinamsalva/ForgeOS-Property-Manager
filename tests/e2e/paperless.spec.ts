import { test, expect } from '@playwright/test';

const origin='http://127.0.0.1:3100';

test.beforeEach(async ({request})=>{
  await request.post('http://127.0.0.1:54331/__test/reset');
});

test('paperless files are not exposed to anonymous visitors or cross-site POSTs',async ({request})=>{
  const list=await request.get('/api/attachments?organization=00000000-0000-4000-8000-000000000001&property=00000000-0000-4000-8000-000000000002&kind=site&target=00000000-0000-4000-8000-000000000003');
  expect(list.status()).toBe(401);
  const photo=await request.get('/api/attachments?file=00000000-0000-4000-8000-000000000003');
  expect(photo.status()).toBe(401);
  const cross=await request.post('/api/attachments',{headers:{origin:'https://evil.example', 'content-type':'image/png'},data:Buffer.from('sample')});
  expect(cross.status()).toBe(403);
  const unauth=await request.post('/api/attachments',{headers:{origin,'content-type':'image/png'},data:Buffer.from('sample')});
  expect(unauth.status()).toBe(401);
  const rejectedDeletion=await request.delete('/api/attachments?file=00000000-0000-4000-8000-000000000003',{headers:{origin:'https://evil.example'}});
  expect(rejectedDeletion.status()).toBe(403);
  const unauthenticatedDelete=await request.delete('/api/attachments?file=00000000-0000-4000-8000-000000000003',{headers:{origin}});
  expect(unauthenticatedDelete.status()).toBe(401);
});

test('paperless UI shows camera and record selectors only in authenticated workspace',async ({page})=>{
  await page.goto('/paperless');
  await expect(page).toHaveURL(/\/demo$/);
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('owner@forgeos.example');
  await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
  await page.getByRole('button',{name:'Sign in to ForgeOS'}).click();
  await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Paperless photos & files'}).click();
  await expect(page.getByRole('heading',{name:'Paperless photos & files',exact:true})).toBeVisible();
  await expect(page.getByLabel('Organization name')).toBeVisible();
  await expect(page.getByLabel('Camera photo capture')).toHaveCount(0);
});

test('owner can reach phone camera auto-filing once a property and person are selected',async ({page},info)=>{
  test.skip(info.project.name !== 'desktop','Create records on desktop fixture, UI responsive separately.');
  await page.goto('/login');
  await page.getByLabel('Email',{exact:true}).fill('owner@forgeos.example');
  await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
  await page.getByRole('button',{name:'Sign in to ForgeOS'}).click();
  await page.getByLabel('Organization name').fill('Sample Paperless Park');
  await page.getByRole('button',{name:'Create organization',exact:true}).click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Properties'}).click();
  await page.getByRole('button',{name:'Add property',exact:true}).click();
  await page.getByLabel('Property name').fill('Private Park Example');
  await page.getByLabel('City',{exact:true}).fill('Corning');
  await page.getByLabel('State / region').fill('CA');
  await page.getByRole('button',{name:'Save record',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Paperless photos & files'}).click();
  await expect(page.getByLabel('Paperless property')).toHaveValue(/.+/);
  await expect(page.getByLabel('Camera photo capture')).toHaveAttribute('capture','environment');
  await expect(page.getByLabel('Camera photo capture')).toBeDisabled();
  await expect(page.getByLabel('Choose paperless photos or PDFs')).toBeDisabled();
  await expect(page.getByText('working internet connection')).toBeVisible();
});
