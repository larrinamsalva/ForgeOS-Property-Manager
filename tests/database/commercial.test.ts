import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { database, asUser, foundation, identities } from '../support/database.mjs';
import { addDays } from '../../src/lib/domain';
import {
  reportKinds,
  type ReportKind,
  type ReportResult,
  type ReportsSummary,
} from '../../src/lib/reports-domain';
import type {
  PortalSnapshot,
  PortalInvoiceDocument,
  PortalReceiptDocument,
} from '../../src/lib/commercial-domain';
import { createArchive, verifyArchive } from '../../src/lib/archive-format.mjs';
import registry from '../../src/lib/account-export-registry.json';
let db: PGlite, today: string;
beforeAll(async () => {
  db = await database();
  today = (await db.query<{ d: string }>('select current_date::text d')).rows[0].d;
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec('delete from private.commercial_limits');
});
async function query<T>(user: string, sql: string, args: unknown[] = []): Promise<T> {
  return asUser(db, user, async (tx) => (await tx.query<{ v: T }>(sql, args)).rows[0].v);
}
async function command(
  name: string,
  operation: string,
  payload: Record<string, unknown>,
  user = identities.owner
) {
  return query<{ id: string; receipt_id: string }>(user, `select public.${name}($1,$2::jsonb) v`, [
    operation,
    JSON.stringify(payload),
  ]);
}
async function setup() {
  const f = await foundation(db),
    scope = { organization_id: f.org, property_id: f.property };
  const ids = await asUser(db, identities.owner, async (tx) => {
    await tx.query("update properties set timezone='UTC' where id=$1", [f.property]);
    const site = (
      await tx.query<{ id: string; receipt_id: string }>(
        "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'R01','rv') returning id",
        [f.org, f.property]
      )
    ).rows[0].id;
    const customers = [];
    for (const first of ['River', 'Other'])
      customers.push(
        (
          await tx.query<{ id: string; receipt_id: string }>(
            "insert into customers(organization_id,property_id,first_name,last_name,notes) values($1,$2,$3,'Example','PRIVATE CUSTOMER NOTE') returning id",
            [f.org, f.property, first]
          )
        ).rows[0].id
      );
    const stay = (
      await tx.query<{ id: string; receipt_id: string }>(
        "insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,agreed_rate_cents,billing_period) values($1,$2,$3,$4,$5,65000,'monthly') returning id",
        [f.org, f.property, site, customers[0], addDays(today, -60)]
      )
    ).rows[0].id;
    for (const [u, r] of [
      [identities.office, 'office'],
      [identities.maintenance, 'maintenance'],
      [identities.technician, 'meter_technician'],
    ])
      await tx.query('select grant_property_access($1,$2,$3,$4)', [f.org, f.property, u, r]);
    return { site, customer: customers[0], otherCustomer: customers[1], stay };
  });
  const s = { ...f, ...ids, scope };
  const membership = (
    await staff(s, 'set_portal_access', {
      id: null,
      version: null,
      customer_id: s.customer,
      user_id: identities.resident,
      active: true,
      starts_on: today,
      expires_on: null,
    })
  ).id;
  return { ...s, membership };
}
function staff(
  s: { scope: Record<string, string> },
  operation: string,
  input: Record<string, unknown>,
  user = identities.owner
) {
  return command(
    'commercial_command',
    operation,
    { ...s.scope, request_id: randomUUID(), reason: 'Fictional authorized commercial record', ...input },
    user
  );
}
function resident(
  s: { membership: string },
  operation: string,
  input: Record<string, unknown>,
  user = identities.resident
) {
  return command(
    'resident_command',
    operation,
    {
      membership_id: s.membership,
      request_id: randomUUID(),
      reason: 'Resident requested test action',
      ...input,
    },
    user
  );
}
function snapshot(s: { membership: string }, user = identities.resident, page = 0) {
  return query<PortalSnapshot>(user, 'select public.portal_snapshot($1,$2) v', [s.membership, page]);
}
function report(
  s: { org: string },
  kind: ReportKind,
  user = identities.owner,
  extra: Record<string, unknown> = {},
  page = 0,
  size = 50
) {
  return query<ReportResult>(user, 'select public.report_records($1,$2,$3::jsonb,$4,$5) v', [
    s.org,
    kind,
    JSON.stringify({
      starts_on: addDays(today, -90),
      ends_on: addDays(today, 1),
      property_id: null,
      site_id: null,
      customer_id: null,
      employee_id: null,
      status: '',
      category: '',
      ...extra,
    }),
    page,
    size,
  ]);
}
function prepare(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
  return staff(s, 'prepare_message', {
    language: 'en',
    category: 'general',
    title: 'Hello {{customer_name}}',
    body: 'At {{property_name}}, site {{site_label}} on {{today}}.',
    template_id: null,
    template_version: null,
    customer_ids: [s.customer],
    scheduled_for: null,
    ...extra,
  });
}
describe('independent resident scope and retained commercial records', () => {
  it('does not turn a portal account into staff or expose raw commercial tables', async () => {
    const s = await setup();
    expect((await snapshot(s)).customer.id).toBe(s.customer);
    for (const table of [
      'organization_memberships',
      'customers',
      'invoices',
      'portal_memberships',
      'communications',
      'communication_recipients',
      'portal_contact_requests',
      'account_exports',
    ])
      expect(await query<number>(identities.resident, `select count(*)::int v from public.${table}`)).toBe(0);
    await expect(snapshot(s, identities.resident2)).rejects.toThrow();
    await expect(snapshot(s, identities.owner)).rejects.toThrow();
    await expect(
      staff(
        s,
        'set_portal_access',
        {
          id: null,
          version: null,
          customer_id: s.otherCustomer,
          user_id: identities.resident2,
          active: true,
          starts_on: today,
          expires_on: null,
        },
        identities.office
      )
    ).rejects.toThrow();
  });
  it('checks revocation and local expiry on every read and blocks archived writes', async () => {
    const s = await setup();
    await staff(s, 'set_portal_access', {
      id: s.membership,
      version: 1,
      customer_id: s.customer,
      user_id: identities.resident,
      active: true,
      starts_on: addDays(today, -10),
      expires_on: addDays(today, -1),
    });
    await expect(snapshot(s)).rejects.toThrow();
    await staff(s, 'set_portal_access', {
      id: s.membership,
      version: 2,
      customer_id: s.customer,
      user_id: identities.resident,
      active: true,
      starts_on: today,
      expires_on: today,
    });
    expect((await snapshot(s)).read_only).toBe(false);
    await asUser(db, identities.owner, async (tx) => {
      await tx.query('select public.complete_stay($1,$2)', [s.stay, today]);
      await tx.query('update customers set archived_at=now() where id=$1', [s.customer]);
    });
    expect((await snapshot(s)).read_only).toBe(true);
    await expect(resident(s, 'request_contact', { proposed: { phone: '555' } })).rejects.toThrow();
    await staff(s, 'set_portal_access', {
      id: s.membership,
      version: 3,
      customer_id: s.customer,
      user_id: identities.resident,
      active: false,
      starts_on: today,
      expires_on: null,
    });
    await expect(snapshot(s)).rejects.toThrow();
  });
  it('derives work scope from an actual own stay and preserves the original resident text', async () => {
    const s = await setup();
    const work = await resident(s, 'new_maintenance', {
      stay_id: s.stay,
      location: 'site',
      title: 'Leaking faucet',
      description: 'Water under kitchen sink',
      category: 'plumbing',
      priority: 'normal',
    });
    const workId = await query<string>(
      identities.owner,
      'select work_order_id v from portal_maintenance_requests where id=$1',
      [work.id]
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [identities.owner]);
    await db.query(
      "update work_orders set title='PRIVATE STAFF TITLE',description='PRIVATE STAFF DESCRIPTION',parts_required='PRIVATE PARTS' where id=$1",
      [workId]
    );
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const d = await snapshot(s);
    expect(d.requests).toHaveLength(1);
    expect(d.requests[0].title).toBe('Leaking faucet');
    expect(d.requests[0].site_label).toBe('R01');
    expect(JSON.stringify(d)).not.toContain('PRIVATE');
    await expect(
      resident(s, 'new_maintenance', {
        stay_id: randomUUID(),
        location: 'site',
        title: 'Forged',
        description: 'No own stay',
        category: '',
        priority: 'normal',
      })
    ).rejects.toThrow('current_stay_required');
    expect(await query<number>(identities.resident, 'select count(*)::int v from public.work_orders')).toBe(
      0
    );
  });
  it('records exact retries once and enforces the durable maintenance window', async () => {
    const s = await setup(),
      payload = {
        membership_id: s.membership,
        request_id: randomUUID(),
        reason: 'Fictional own maintenance',
        stay_id: s.stay,
        location: 'common',
        title: 'Light',
        description: 'Common area light',
        category: 'electric',
        priority: 'low',
      };
    const first = await command('resident_command', 'new_maintenance', payload, identities.resident);
    expect(await command('resident_command', 'new_maintenance', payload, identities.resident)).toEqual(first);
    await expect(
      command('resident_command', 'new_maintenance', { ...payload, title: 'Changed' }, identities.resident)
    ).rejects.toThrow('operation_conflict');
    for (let i = 0; i < 4; i++)
      await resident(s, 'new_maintenance', { ...payload, request_id: randomUUID() });
    await expect(resident(s, 'new_maintenance', { ...payload, request_id: randomUUID() })).rejects.toThrow(
      'commercial_rate_limit'
    );
    expect((await snapshot(s)).requests).toHaveLength(5);
  });
  it('requires office approval with a current contact baseline and rejects forged fields', async () => {
    const s = await setup();
    await expect(resident(s, 'request_contact', { proposed: { notes: 'PRIVATE FORGERY' } })).rejects.toThrow(
      'invalid_contact_proposal'
    );
    const r = await resident(s, 'request_contact', { proposed: { phone: '555-0101' } });
    expect((await snapshot(s)).customer.phone).toBe('');
    await expect(
      staff(s, 'decide_contact', { id: r.id, version: 1, status: 'approved' }, identities.technician)
    ).rejects.toThrow();
    await staff(
      s,
      'decide_contact',
      { id: r.id, version: 1, status: 'approved', reason: 'Verified phone with resident' },
      identities.office
    );
    expect((await snapshot(s)).customer.phone).toBe('555-0101');
    const stale = await resident(s, 'request_contact', { proposed: { phone: '555-0102' } });
    await asUser(db, identities.owner, (tx) =>
      tx.query("update customers set phone='office change' where id=$1", [s.customer])
    );
    await expect(
      staff(s, 'decide_contact', { id: stale.id, version: 1, status: 'approved' }, identities.office)
    ).rejects.toThrow('contact_source_changed');
    await resident(s, 'cancel_contact', { id: stale.id, version: 1 });
    expect((await snapshot(s)).contacts[0].status).toBe('cancelled');
  });
  it('freezes personalized copies, rechecks language and consent, and retains read and cancellation history', async () => {
    const s = await setup(),
      msg = await prepare(s);
    await asUser(db, identities.owner, (tx) =>
      tx.query("update customers set first_name='Changed' where id=$1", [s.customer])
    );
    await staff(s, 'add_message_note', { id: msg.id, reason: 'PRIVATE MESSAGE NOTE' });
    await staff(s, 'publish_message', { id: msg.id, version: 1 });
    const d = await snapshot(s);
    expect(d.messages[0].title).toBe('Hello River Example');
    expect(JSON.stringify(d)).not.toContain('PRIVATE');
    await resident(s, 'read_message', { id: d.messages[0].id });
    expect((await snapshot(s)).messages[0].read_at).toBeTruthy();
    const spanish = await prepare(s, { language: 'es', title: 'Hola {{customer_name}}' });
    await resident(s, 'set_preferences', {
      version: null,
      language: 'es',
      in_app: false,
      email_opt_in: true,
      sms_opt_in: false,
    });
    await staff(s, 'publish_message', { id: spanish.id, version: 1 });
    expect((await snapshot(s)).messages).toHaveLength(1);
    expect(
      await query<string>(
        identities.owner,
        'select status v from communication_recipients where communication_id=$1',
        [spanish.id]
      )
    ).toBe('skipped');
    const future = await prepare(s, { scheduled_for: new Date(Date.now() + 86400000).toISOString() });
    await expect(staff(s, 'publish_message', { id: future.id, version: 1 })).rejects.toThrow(
      'message_not_due'
    );
    await staff(s, 'cancel_message', { id: future.id, version: 1 });
    expect(
      await query<string>(identities.owner, 'select status v from communications where id=$1', [future.id])
    ).toBe('cancelled');
  });
});
describe('scoped reports and owner archives', () => {
  it('executes all report branches, paginates stable rows and uses exact current occupancy', async () => {
    const s = await setup();
    for (const kind of reportKinds) {
      const r = await report(s, kind);
      expect(Array.isArray(r.rows)).toBe(true);
    }
    const r = await report(s, 'occupancy');
    expect(r.rows).toHaveLength(1);
    expect(JSON.stringify(r)).toContain('R01');
    const d = await query<ReportsSummary>(identities.owner, 'select public.reports_summary($1,$2,$3) v', [
      s.org,
      addDays(today, -30),
      addDays(today, 1),
    ]);
    expect(d.properties[0].occupied).toBe('1');
    expect(d.properties[0].occupancy_percent).toBe('100.00');
    expect((await report(s, 'occupancy', identities.owner, { customer_id: s.otherCustomer })).total).toBe(
      '0'
    );
    expect((await report(s, 'occupancy', identities.owner, {}, 1, 1)).rows).toHaveLength(0);
  });
  it('denies residents, outsiders and financial-A / maintenance-B cross-role access', async () => {
    const s = await setup();
    for (const u of [identities.resident, identities.other, identities.technician, identities.maintenance])
      await expect(report(s, 'tenant_history', u)).rejects.toThrow();
    const property = (
      await asUser(db, identities.owner, (tx) =>
        tx.query<{ id: string; receipt_id: string }>(
          "insert into properties(organization_id,name,category) values($1,'Limited property','rv_park') returning id",
          [s.org]
        )
      )
    ).rows[0].id;
    await asUser(db, identities.owner, (tx) =>
      tx.query('select grant_property_access($1,$2,$3,$4)', [
        s.org,
        property,
        identities.office,
        'maintenance',
      ])
    );
    await expect(report(s, 'maintenance', identities.office, { property_id: property })).rejects.toThrow();
    expect(JSON.stringify(await report(s, 'property_comparison', identities.office))).not.toContain(
      'Limited property'
    );
  });
  it('creates a complete scoped public-data archive and verifies tamper, provenance and migration checks', async () => {
    const s = await setup(),
      ex = await staff(s, 'begin_export', {});
    const raw = await query<unknown>(identities.owner, 'select public.account_export_snapshot($1,$2) v', [
        s.org,
        ex.id,
      ]),
      a = createArchive(raw);
    const verified = verifyArchive(a.archive, a.checksum_sha256);
    expect(verified.tables).toBe(66);
    expect(verified.provenance_checked).toBe(true);
    expect(Object.keys(a.archive.payload.tables as object).sort()).toEqual(registry);
    expect(a.content).not.toContain('auth.users');
    expect(a.archive.manifest.includes_storage_bytes).toBe(false);
    const tables = a.archive.payload.tables as Record<string, Record<string, unknown>[]>;
    expect(tables.sites_units[0].monthly_rate_cents).toBe('0');
    const bad = structuredClone(a.archive);
    bad.manifest.organization_id = randomUUID();
    expect(() => verifyArchive(bad)).toThrow('Checksum');
    expect(() => verifyArchive(a.archive, '0'.repeat(64))).toThrow('audit checksum');
    await staff(s, 'finish_export', {
      id: ex.id,
      status: 'ready',
      sha256: a.checksum_sha256,
      byte_size: Buffer.byteLength(a.content),
      manifest: a.archive.manifest,
    });
    expect(
      await query<string>(identities.owner, 'select status v from account_exports where id=$1', [ex.id])
    ).toBe('ready');
    await expect(
      query(identities.office, 'select public.account_export_snapshot($1,$2) v', [s.org, ex.id])
    ).rejects.toThrow();
  });
  it('exposes only own issued invoices and receipts without staff-only evidence', async () => {
    const s = await setup();
    const bill = async (operation: string, p: Record<string, unknown>) =>
      query<string>(identities.owner, 'select public.billing_command($1,$2::jsonb) v', [
        operation,
        JSON.stringify({ ...s.scope, request_id: randomUUID(), reason: 'PRIVATE BILLING NOTE', ...p }),
      ]);
    const collect = (operation: string, p: Record<string, unknown>) =>
      command('collections_command', operation, {
        ...s.scope,
        request_id: randomUUID(),
        reason: 'PRIVATE COLLECTION NOTE',
        ...p,
      });
    await bill('configure_policy', {
      proration: 'actual_calendar_days',
      due_days: 15,
      rent_tax_bps: 0,
      tax_label: '',
      authorization_reference: '',
    });
    await collect('configure_collections', {
      manual_issuance_enabled: true,
      grace_days: 0,
      fees_enabled: false,
      fee_flat_cents: '0',
      fee_bps: 0,
      fee_cap_cents: '0',
      fee_tax_bps: 0,
      fee_tax_label: '',
      deposit_deductions_enabled: false,
      authorization_reference: 'Test owner',
    });
    const id = await bill('create_draft', {
      stay_id: s.stay,
      starts_on: addDays(today, -30),
      ends_on: addDays(today, -29),
      due_on: today,
      rent_mode: 'none',
      manual_rent_cents: null,
      rent_reason: 'PRIVATE RENT',
      include_utilities: false,
      utilities_reason: 'PRIVATE UTILITY',
      accept_estimates: false,
      adjustments: [
        {
          kind: 'fee',
          description: 'Agreed public charge',
          amount_cents: '10000',
          reason: 'PRIVATE ADJUSTMENT',
          tax_bps: 0,
          tax_label: '',
          authorization_reference: '',
        },
      ],
    });
    const own = (user = identities.resident) =>
      query<PortalInvoiceDocument | null>(user, 'select public.portal_invoice_statement($1) v', [id]);
    expect(await own()).toBeNull();
    const revision = (
      await db.query<{ id: string; receipt_id: string }>(
        'select current_revision_id id from invoices where id=$1',
        [id]
      )
    ).rows[0].id;
    await bill('approve_invoice', { invoice_id: id, revision_id: revision });
    expect(await own()).toBeNull();
    await collect('issue_invoice', {
      invoice_id: id,
      revision_id: revision,
      issued_on: addDays(today, -1),
      due_on: today,
    });
    const doc = await own();
    expect(doc?.revision.calculation.total_cents).toBe('10000');
    expect(JSON.stringify(doc)).not.toContain('PRIVATE');
    expect(await own(identities.resident2)).toBeNull();
    const pay = await collect('record_payment', {
      customer_id: s.customer,
      amount_cents: '5000',
      received_on: today,
      method: 'cash',
      reference: 'PUBLIC-REF',
      corrects_payment_id: null,
    });
    const receipt = await query<PortalReceiptDocument>(
      identities.resident,
      'select public.portal_receipt_statement($1) v',
      [pay.receipt_id]
    );
    expect(receipt.receipt.snapshot.amount_cents).toBe('5000');
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE');
    expect(
      await query(identities.resident2, 'select public.portal_receipt_statement($1) v', [pay.receipt_id])
    ).toBeNull();
    expect((await snapshot(s)).outstanding_cents).toBe('10000');
  });
});
