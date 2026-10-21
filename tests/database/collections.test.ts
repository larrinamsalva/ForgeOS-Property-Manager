import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type {
  CollectionAccount,
  CollectionSummary,
  ReceiptStatement,
  ReconciliationPreview,
} from '../../src/lib/collections-domain';
import { randomUUID } from 'node:crypto';
import { database, asUser, foundation, identities } from '../support/database.mjs';
import { addDays } from '../../src/lib/domain';
let db: PGlite;
let today: string;
beforeAll(async () => {
  db = await database();
  today = String((await db.query<{ d: string }>('select current_date::text d')).rows[0].d);
});
afterAll(async () => {
  await db?.close();
});
interface CommandResult {
  id: string;
  invoice_id: string;
  receipt_id: string;
  preview: ReconciliationPreview;
}
async function rpc<T = CommandResult>(
  name: string,
  command: string,
  payload: Record<string, unknown>,
  user = identities.owner
) {
  return asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query<{ result: T }>(`select public.${name}($1,$2::jsonb) result`, [
          command,
          JSON.stringify(payload),
        ])
      ).rows[0].result
  );
}
const cmd = (
  s: { scope: Record<string, string> },
  command: string,
  input: Record<string, unknown> = {},
  user = identities.owner
) =>
  rpc(
    'collections_command',
    command,
    { ...s.scope, request_id: randomUUID(), reason: 'Fictional authorized test record', ...input },
    user
  );
const bill = (s: { scope: Record<string, string> }, command: string, input: Record<string, unknown>) =>
  rpc<string>('billing_command', command, {
    ...s.scope,
    request_id: randomUUID(),
    reason: 'Reviewed test billing',
    ...input,
  });
async function rev(id: string) {
  return String(
    (await db.query<{ id: string }>('select current_revision_id id from invoices where id=$1', [id])).rows[0]
      .id
  );
}
async function account(id: string) {
  return asUser(
    db,
    identities.owner,
    async (tx) =>
      (await tx.query<{ a: CollectionAccount }>('select private.collection_account($1) a', [id])).rows[0].a
  );
}
async function summary(s: { org: string }) {
  return asUser(
    db,
    identities.owner,
    async (tx) =>
      (await tx.query<{ a: CollectionSummary }>('select public.collection_summary($1) a', [s.org])).rows[0].a
  );
}
async function setup(configure = true) {
  const f = await foundation(db);
  const scope = { organization_id: f.org, property_id: f.property };
  const ids = await asUser(db, identities.owner, async (tx) => {
    await tx.query("update properties set timezone='UTC' where id=$1", [f.property]);
    const site = String(
      (
        await tx.query<{ id: string }>(
          "insert into sites_units(organization_id,property_id,label,kind) values($1,$2,'C01','rv') returning id",
          [f.org, f.property]
        )
      ).rows[0].id
    );
    const customer = String(
      (
        await tx.query<{ id: string }>(
          "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'José','Example') returning id",
          [f.org, f.property]
        )
      ).rows[0].id
    );
    const stay = String(
      (
        await tx.query<{ id: string }>(
          "insert into occupancy_stays(organization_id,property_id,site_id,customer_id,starts_on,agreed_rate_cents,billing_period) values($1,$2,$3,$4,$5,10000,'monthly') returning id",
          [f.org, f.property, site, customer, addDays(today, -300)]
        )
      ).rows[0].id
    );
    for (const [user, role] of [
      [identities.office, 'office'],
      [identities.manager, 'manager'],
      [identities.technician, 'meter_technician'],
    ])
      await tx.query('select grant_property_access($1,$2,$3,$4)', [f.org, f.property, user, role]);
    return { site, customer, stay };
  });
  const s = { ...f, ...ids, scope };
  await bill(s, 'configure_policy', {
    proration: 'actual_calendar_days',
    due_days: 15,
    rent_tax_bps: 0,
    tax_label: '',
    authorization_reference: '',
  });
  if (configure) await policy(s);
  return s;
}
async function policy(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
  return cmd(s, 'configure_collections', {
    manual_issuance_enabled: true,
    grace_days: 3,
    fees_enabled: false,
    fee_flat_cents: '0',
    fee_bps: 0,
    fee_cap_cents: '0',
    fee_tax_bps: 0,
    fee_tax_label: '',
    deposit_deductions_enabled: false,
    authorization_reference: 'Fictional owner configuration',
    ...extra,
  });
}
async function invoice(s: Awaited<ReturnType<typeof setup>>, issue = true, offset = -20, amount = '10000') {
  const id = await bill(s, 'create_draft', {
    stay_id: s.stay,
    starts_on: addDays(today, -30),
    ends_on: addDays(today, -29),
    due_on: today,
    rent_mode: 'none',
    manual_rent_cents: null,
    rent_reason: 'Separate authorized charge',
    include_utilities: false,
    utilities_reason: 'No utilities on this invoice',
    accept_estimates: false,
    adjustments: [
      {
        kind: 'fee',
        description: 'Fictional agreed charge',
        amount_cents: amount,
        reason: 'Reviewed fictional charge',
        tax_bps: 0,
        tax_label: '',
        authorization_reference: '',
      },
    ],
  });
  await bill(s, 'approve_invoice', { invoice_id: id, revision_id: await rev(id) });
  if (issue)
    await cmd(s, 'issue_invoice', {
      invoice_id: id,
      revision_id: await rev(id),
      issued_on: addDays(today, Math.min(-30, offset - 1)),
      due_on: addDays(today, offset),
    });
  return id as string;
}
async function payment(
  s: Awaited<ReturnType<typeof setup>>,
  amount = '15000',
  extra: Record<string, unknown> = {}
) {
  return cmd(s, 'record_payment', {
    customer_id: s.customer,
    amount_cents: amount,
    received_on: addDays(today, -10),
    method: 'cash',
    reference: '',
    corrects_payment_id: null,
    ...extra,
  });
}
async function allocate(s: Awaited<ReturnType<typeof setup>>, p: string, i: string, amount = '10000') {
  return cmd(s, 'allocate_payment', {
    payment_id: p,
    invoice_id: i,
    amount_cents: amount,
    effective_on: today,
    reference: '',
  });
}
async function deposit(s: Awaited<ReturnType<typeof setup>>) {
  return cmd(s, 'new_deposit', {
    customer_id: s.customer,
    kind: 'security',
    label: 'Security deposit',
    stay_id: s.stay,
    reservation_id: null,
    reference: '',
  });
}
async function movement(
  s: Awaited<ReturnType<typeof setup>>,
  id: string,
  kind: string,
  amount = '10000',
  extra: Record<string, unknown> = {}
) {
  return cmd(s, 'record_deposit', {
    deposit_id: id,
    kind,
    amount_cents: amount,
    effective_on: today,
    method: kind === 'received' || kind === 'returned' ? 'cash' : null,
    invoice_id: null,
    reference: '',
    ...extra,
  });
}
describe('immutable manual collections', () => {
  it('requires explicit owner configuration for issuance and preserves unissued approval', async () => {
    const s = await setup(false);
    const i = await invoice(s, false);
    expect((await account(i)).state).toBe('approved_unissued');
    await expect(
      cmd(s, 'issue_invoice', { invoice_id: i, revision_id: await rev(i), issued_on: today, due_on: today })
    ).rejects.toThrow('manual_issuance_not_configured');
    await expect(cmd(s, 'configure_collections', {}, identities.manager)).rejects.toThrow();
    await policy(s);
    await cmd(s, 'issue_invoice', {
      invoice_id: i,
      revision_id: await rev(i),
      issued_on: today,
      due_on: today,
    });
    expect((await account(i)).state).toBe('issued');
  });
  it('splits one payment across invoices, accepts partial and multiple payments, and guards credits/voids', async () => {
    const s = await setup();
    const a = await invoice(s),
      b = await invoice(s);
    const p = await payment(s);
    await allocate(s, p.id, a, '6000');
    await allocate(s, p.id, b, '9000');
    expect((await account(a)).outstanding_cents).toBe('4000');
    await expect(allocate(s, p.id, a, '1')).rejects.toThrow('allocation_exceeds_balance');
    await expect(
      bill(s, 'credit', { invoice_id: a, revision_id: await rev(a), amount_cents: '4001', reference: '' })
    ).rejects.toThrow('credit_exceeds_outstanding');
    await expect(bill(s, 'void_invoice', { invoice_id: a, revision_id: await rev(a) })).rejects.toThrow(
      'invoice_has_payments'
    );
    const q = await payment(s, '4000');
    await allocate(s, q.id, a, '4000');
    expect((await account(a)).state).toBe('paid');
    expect((await account(b)).aging_bucket).toBe('1_30');
  });
  it('reverses allocations exactly and keeps original receipts frozen through corrections', async () => {
    const s = await setup();
    const i = await invoice(s);
    const p = await payment(s);
    const e = await allocate(s, p.id, i);
    const before = (
      await db.query<{ snapshot: unknown }>('select snapshot from collection_receipts where id=$1', [
        p.receipt_id,
      ])
    ).rows[0].snapshot;
    await cmd(s, 'reverse_payment_event', { event_id: e.id, effective_on: today, reference: '' });
    await expect(
      cmd(s, 'reverse_payment_event', { event_id: e.id, effective_on: today, reference: '' })
    ).rejects.toThrow();
    await cmd(s, 'void_payment', { payment_id: p.id, effective_on: today, reference: '' });
    await expect(allocate(s, p.id, i, '1')).rejects.toThrow('payment_voided');
    const corrected = await payment(s, '14000', { corrects_payment_id: p.id });
    expect(corrected.receipt_id).not.toBe(p.receipt_id);
    const r = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (await tx.query<{ r: ReceiptStatement }>('select collection_receipt($1) r', [p.receipt_id])).rows[0].r
    );
    expect(r.voided).toBe(true);
    expect(r.receipt.snapshot).toEqual(before);
    expect(r.history).toHaveLength(3);
    await bill(s, 'void_invoice', { invoice_id: i, revision_id: await rev(i) });
    expect((await account(i)).state).toBe('voided');
  });
  it('refunds only available funds, records actual payout method, and reverses refunds with linked receipts', async () => {
    const s = await setup();
    const i = await invoice(s);
    const p = await payment(s);
    await allocate(s, p.id, i);
    await expect(
      cmd(s, 'refund_payment', {
        payment_id: p.id,
        amount_cents: '5001',
        effective_on: today,
        method: 'cash',
        reference: '',
      })
    ).rejects.toThrow('refund_exceeds_available');
    const e = await cmd(s, 'refund_payment', {
      payment_id: p.id,
      amount_cents: '5000',
      effective_on: today,
      method: 'check',
      reference: 'CHECK-100',
    });
    const cash = (await summary(s)).cash;
    expect(cash.find((x) => x.source_key === `payment_event:${e.id}`)).toMatchObject({
      method: 'check',
      amount_cents: '-5000',
    });
    await cmd(s, 'reverse_payment_event', {
      event_id: e.id,
      effective_on: today,
      reference: 'Canceled check',
    });
    expect((await summary(s)).payments.find((x) => x.id === p.id)?.available_cents).toBe('5000');
  });
  it('keeps held deposits separate, applies without new cash, and prevents excessive return/reversal', async () => {
    const s = await setup();
    const i = await invoice(s);
    const d = await deposit(s);
    const received = await movement(s, d.id, 'received');
    await movement(s, d.id, 'applied', '4000', { invoice_id: i });
    expect((await account(i)).outstanding_cents).toBe('6000');
    expect((await summary(s)).deposits[0].held_cents).toBe('6000');
    expect((await summary(s)).cash).toHaveLength(1);
    await expect(movement(s, d.id, 'returned', '6001')).rejects.toThrow('deposit_exceeds_held');
    await expect(
      cmd(s, 'reverse_deposit', { event_id: received.id, effective_on: today, reference: '' })
    ).rejects.toThrow('deposit_exceeds_held');
    await movement(s, d.id, 'returned', '6000');
    expect((await summary(s)).deposits[0].held_cents).toBe('0');
  });
  it('requires configured deductions against a reviewed fee invoice and reverses their effect', async () => {
    const s = await setup();
    const i = await invoice(s);
    const d = await deposit(s);
    await movement(s, d.id, 'received');
    await expect(movement(s, d.id, 'deduction', '1000', { invoice_id: i })).rejects.toThrow(
      'deduction_not_configured'
    );
    await policy(s, { deposit_deductions_enabled: true });
    const e = await movement(s, d.id, 'deduction', '1000', { invoice_id: i });
    await cmd(s, 'reverse_deposit', { event_id: e.id, effective_on: today, reference: '' });
    expect((await account(i)).outstanding_cents).toBe('10000');
    expect((await summary(s)).deposits[0].held_cents).toBe('10000');
  });
  it('prepares capped manual late fees, blocks stale approval and retains waiver credit history', async () => {
    const s = await setup();
    const i = await invoice(s);
    await policy(s, { fees_enabled: true, fee_flat_cents: '500', fee_bps: 1000, fee_cap_cents: '1200' });
    const fee = await cmd(s, 'prepare_fee', { invoice_id: i });
    expect(
      (
        await db.query<{ fee_cents: number }>('select fee_cents from late_fee_assessments where id=$1', [
          fee.id,
        ])
      ).rows[0].fee_cents
    ).toBe(1200);
    await expect(cmd(s, 'prepare_fee', { invoice_id: i })).rejects.toThrow();
    const p = await payment(s, '1000');
    await allocate(s, p.id, i, '1000');
    await expect(
      bill(s, 'approve_invoice', { invoice_id: fee.invoice_id, revision_id: await rev(fee.invoice_id) })
    ).rejects.toThrow('fee_sources_changed');
    await bill(s, 'void_invoice', { invoice_id: fee.invoice_id, revision_id: await rev(fee.invoice_id) });
    const next = await cmd(s, 'prepare_fee', { invoice_id: i });
    await bill(s, 'approve_invoice', {
      invoice_id: next.invoice_id,
      revision_id: await rev(next.invoice_id),
    });
    await cmd(s, 'waive_fee', { assessment_id: next.id, amount_cents: '500' });
    expect((await account(next.invoice_id)).outstanding_cents).toBe('700');
    await expect(bill(s, 'void_invoice', { invoice_id: i, revision_id: await rev(i) })).rejects.toThrow();
  });
  it('does not assess within grace, on paid invoices or on fees', async () => {
    const s = await setup();
    await policy(s, { fees_enabled: true, fee_flat_cents: '500', fee_cap_cents: '500' });
    const i = await invoice(s, true, -2);
    await expect(cmd(s, 'prepare_fee', { invoice_id: i })).rejects.toThrow('invoice_not_overdue');
    const j = await invoice(s);
    const p = await payment(s, '10000');
    await allocate(s, p.id, j);
    await expect(cmd(s, 'prepare_fee', { invoice_id: j })).rejects.toThrow('invoice_not_overdue');
  });
  it('keeps arrangements and manual followups append-only with scoped resolution', async () => {
    const s = await setup();
    const i = await invoice(s);
    const n = await cmd(s, 'account_note', {
      customer_id: s.customer,
      invoice_id: i,
      kind: 'arrangement',
      body: 'Fictional agreed plan',
      follow_up_on: addDays(today, 2),
      promised_on: addDays(today, 5),
      promised_amount_cents: '5000',
      resolves_id: null,
    });
    await expect(
      cmd(
        s,
        'account_note',
        {
          customer_id: s.customer,
          invoice_id: i,
          kind: 'resolution',
          body: 'Plan resolved',
          resolves_id: n.id,
        },
        identities.office
      )
    ).rejects.toThrow();
    await cmd(s, 'account_note', {
      customer_id: s.customer,
      invoice_id: i,
      kind: 'resolution',
      body: 'Plan fulfilled manually',
      resolves_id: n.id,
    });
    await expect(
      asUser(db, identities.owner, (tx) => tx.query('delete from account_notes where id=$1', [n.id]))
    ).rejects.toThrow();
  });
  it('previews selected cash, carries old unmatched items and prevents double reconciliation', async () => {
    const s = await setup();
    const p = await payment(s, '10000');
    const input = {
      starts_on: addDays(today, -2),
      ends_on: addDays(today, 1),
      method: 'cash',
      opening_cents: '0',
      closing_cents: '10000',
      source_keys: [`payment:${p.id}`],
    };
    const preview = await cmd(s, 'preview_reconciliation', input);
    expect(preview.preview).toMatchObject({
      net_cents: '10000',
      variance_cents: '0',
      carried_forward_count: 1,
    });
    const r = await cmd(s, 'close_reconciliation', {
      ...input,
      statement_reference: 'Fictional cash journal',
      acknowledge_variance: false,
      variance_reason: '',
    });
    expect((await summary(s)).cash).toHaveLength(0);
    await expect(cmd(s, 'preview_reconciliation', input)).rejects.toThrow('reconciliation_source_changed');
    await cmd(s, 'void_reconciliation', { reconciliation_id: r.id });
    expect((await summary(s)).cash).toHaveLength(1);
  });
  it('requires owner variance acknowledgment and preserves unresolved variance in the snapshot', async () => {
    const s = await setup();
    const p = await payment(s, '10000');
    const input = {
      starts_on: addDays(today, -2),
      ends_on: addDays(today, 1),
      method: 'all',
      opening_cents: '0',
      closing_cents: '9900',
      source_keys: [`payment:${p.id}`],
      statement_reference: 'Statement test',
      acknowledge_variance: false,
      variance_reason: '',
    };
    await expect(cmd(s, 'close_reconciliation', input)).rejects.toThrow(
      'reconciliation_variance_requires_owner'
    );
    await expect(
      cmd(
        s,
        'close_reconciliation',
        { ...input, acknowledge_variance: true, variance_reason: 'Unresolved discrepancy' },
        identities.manager
      )
    ).rejects.toThrow('reconciliation_variance_requires_owner');
    const r = await cmd(s, 'close_reconciliation', {
      ...input,
      acknowledge_variance: true,
      variance_reason: 'Unresolved discrepancy',
    });
    expect(
      String(
        (
          await db.query<{ variance_cents: string }>(
            'select variance_cents from reconciliations where id=$1',
            [r.id]
          )
        ).rows[0].variance_cents
      )
    ).toBe('-100');
  });
  it('enforces actor-bound idempotency, duplicate references, financial dates and tenant isolation', async () => {
    const s = await setup();
    const payload = {
      ...s.scope,
      request_id: randomUUID(),
      customer_id: s.customer,
      amount_cents: '1000',
      received_on: today,
      method: 'check',
      reference: 'BANK-01',
      reason: 'Authorized manual record',
      corrects_payment_id: null,
    };
    const a = await rpc('collections_command', 'record_payment', payload);
    expect(await rpc('collections_command', 'record_payment', payload)).toEqual(a);
    await expect(
      rpc('collections_command', 'record_payment', { ...payload, amount_cents: '1001' })
    ).rejects.toThrow('operation_conflict');
    await expect(rpc('collections_command', 'record_payment', payload, identities.office)).rejects.toThrow(
      'operation_conflict'
    );
    await expect(payment(s, '1000', { method: 'check', reference: 'BANK-01' })).rejects.toThrow(
      'duplicate_payment_reference'
    );
    await expect(payment(s, '1000', { received_on: addDays(today, 1) })).rejects.toThrow(
      'invalid_financial_date'
    );
    for (const user of [identities.other, identities.technician]) {
      await expect(
        rpc('collections_command', 'record_payment', { ...payload, request_id: randomUUID() }, user)
      ).rejects.toThrow();
      await asUser(db, user, async (tx) => {
        expect(
          (await tx.query('select id from manual_payments where property_id=$1', [s.property])).rows
        ).toHaveLength(0);
        expect(
          (await tx.query<{ a: CollectionSummary }>('select collection_summary($1) a', [s.org])).rows[0].a
            .cash
        ).toEqual([]);
      });
    }
    await expect(
      asUser(db, identities.owner, (tx) =>
        tx.query('update manual_payments set amount_cents=1 where id=$1', [a.id])
      )
    ).rejects.toThrow();
  });
  it('limits office staff to receiving and allocating and rechecks revoked access', async () => {
    const s = await setup();
    const i = await invoice(s);
    const p = await cmd(
      s,
      'record_payment',
      {
        customer_id: s.customer,
        amount_cents: '10000',
        received_on: today,
        method: 'cash',
        reference: '',
        corrects_payment_id: null,
      },
      identities.office
    );
    await cmd(
      s,
      'allocate_payment',
      { payment_id: p.id, invoice_id: i, amount_cents: '5000', effective_on: today, reference: '' },
      identities.office
    );
    await expect(
      cmd(
        s,
        'refund_payment',
        { payment_id: p.id, amount_cents: '1000', effective_on: today, method: 'cash', reference: '' },
        identities.office
      )
    ).rejects.toThrow();
    const d = await cmd(
      s,
      'new_deposit',
      {
        customer_id: s.customer,
        kind: 'security',
        label: 'Office deposit',
        stay_id: s.stay,
        reservation_id: null,
        reference: '',
      },
      identities.office
    );
    await cmd(
      s,
      'record_deposit',
      {
        deposit_id: d.id,
        kind: 'received',
        amount_cents: '1000',
        effective_on: today,
        method: 'cash',
        invoice_id: null,
        reference: '',
      },
      identities.office
    );
    await expect(
      cmd(
        s,
        'record_deposit',
        {
          deposit_id: d.id,
          kind: 'returned',
          amount_cents: '1000',
          effective_on: today,
          method: 'cash',
          invoice_id: null,
          reference: '',
        },
        identities.office
      )
    ).rejects.toThrow();
    await asUser(db, identities.owner, (tx) =>
      tx.query('select revoke_property_access($1,$2,$3)', [s.org, s.property, identities.office])
    );
    await expect(
      cmd(
        s,
        'allocate_payment',
        { payment_id: p.id, invoice_id: i, amount_cents: '1', effective_on: today, reference: '' },
        identities.office
      )
    ).rejects.toThrow();
    await asUser(db, identities.office, async (tx) =>
      expect(
        (await tx.query('select id from collection_receipts where property_id=$1', [s.property])).rows
      ).toHaveLength(0)
    );
  });
  it('rejects cross-customer allocations, unissued invoices and foreign deposit links', async () => {
    const s = await setup();
    const t = await setup();
    const i = await invoice(s);
    const unissued = await invoice(s, false);
    const p = await payment(s);
    await expect(allocate(s, p.id, await invoice(t), '100')).rejects.toThrow('issued_invoice_required');
    await expect(allocate(s, p.id, unissued, '100')).rejects.toThrow('issued_invoice_required');
    const second = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (
          await tx.query<{ id: string }>(
            "insert into customers(organization_id,property_id,first_name,last_name) values($1,$2,'Another','Customer') returning id",
            [s.org, s.property]
          )
        ).rows[0].id
    );
    const q = await cmd(s, 'record_payment', {
      customer_id: second,
      amount_cents: '100',
      received_on: today,
      method: 'cash',
      reference: '',
      corrects_payment_id: null,
    });
    await expect(allocate(s, q.id, i, '100')).rejects.toThrow('issued_invoice_required');
    await expect(
      cmd(s, 'new_deposit', {
        customer_id: second,
        kind: 'security',
        label: 'Bad link',
        stay_id: s.stay,
        reservation_id: null,
        reference: '',
      })
    ).rejects.toThrow('invalid_deposit_link');
  });
  it('uses due-date aging independently from grace and keeps the issued policy version', async () => {
    const s = await setup();
    const buckets = [
      ['current', 0],
      ['1_30', -30],
      ['31_60', -31],
      ['61_90', -61],
      ['90_plus', -91],
    ] as const;
    for (const [bucket, offset] of buckets) {
      const i = await invoice(s, true, offset);
      expect((await account(i)).aging_bucket).toBe(bucket);
    }
    const grace = await invoice(s, true, -2);
    expect((await account(grace)).state).toBe('issued');
    await policy(s, { grace_days: 0 });
    expect((await account(grace)).grace_days).toBe(3);
    expect((await account(grace)).state).toBe('issued');
  });
  it('preserves frozen receipt names and exact supported maximum cents', async () => {
    const s = await setup();
    const p = await payment(s, '999999999999');
    await asUser(db, identities.owner, (tx) =>
      tx.query("update customers set first_name='Changed' where id=$1", [s.customer])
    );
    const r = await asUser(
      db,
      identities.owner,
      async (tx) =>
        (await tx.query<{ r: ReceiptStatement }>('select collection_receipt($1) r', [p.receipt_id])).rows[0].r
    );
    expect(r.receipt.snapshot.customer.name).toBe('José Example');
    expect(r.receipt.snapshot.amount_cents).toBe('999999999999');
    expect(r.available_cents).toBe('999999999999');
  });
  it('links adjacent reconciliation balances and carries later-entered older cash without rewriting batches', async () => {
    const s = await setup();
    const p = await payment(s, '10000', { received_on: addDays(today, -5) });
    const first = {
      starts_on: addDays(today, -5),
      ends_on: addDays(today, -2),
      method: 'cash',
      opening_cents: '0',
      closing_cents: '10000',
      source_keys: [`payment:${p.id}`],
      statement_reference: 'Journal period one',
      acknowledge_variance: false,
      variance_reason: '',
    };
    const a = await cmd(s, 'close_reconciliation', first);
    const q = await payment(s, '1000', { received_on: addDays(today, -4) });
    const second = {
      ...first,
      starts_on: addDays(today, -2),
      ends_on: addDays(today, 1),
      opening_cents: '0',
      closing_cents: '11000',
      source_keys: [`payment:${q.id}`],
    };
    await expect(cmd(s, 'preview_reconciliation', second)).rejects.toThrow('reconciliation_opening_mismatch');
    const b = await cmd(s, 'close_reconciliation', { ...second, opening_cents: '10000' });
    const snapshot = (
      await db.query<{ snapshot: ReconciliationPreview }>(
        'select snapshot from reconciliations where id=$1',
        [a.id]
      )
    ).rows[0].snapshot;
    expect(snapshot.sources).toHaveLength(1);
    await expect(cmd(s, 'void_reconciliation', { reconciliation_id: a.id })).rejects.toThrow(
      'reconciliation_has_later_period'
    );
    await cmd(s, 'void_reconciliation', { reconciliation_id: b.id });
    await cmd(s, 'void_reconciliation', { reconciliation_id: a.id });
    expect((await summary(s)).cash).toHaveLength(2);
  });
  it('cannot backdate a deposit payout or reuse funds before a refund reversal', async () => {
    const s = await setup();
    const d = await deposit(s);
    await movement(s, d.id, 'received', '10000');
    await expect(movement(s, d.id, 'returned', '1000', { effective_on: addDays(today, -1) })).rejects.toThrow(
      'financial_date_overdraw'
    );
    const p = await payment(s, '10000');
    const r = await cmd(s, 'refund_payment', {
      payment_id: p.id,
      amount_cents: '10000',
      effective_on: addDays(today, -2),
      method: 'cash',
      reference: '',
    });
    await cmd(s, 'reverse_payment_event', { event_id: r.id, effective_on: today, reference: '' });
    const i = await invoice(s);
    await expect(
      cmd(s, 'allocate_payment', {
        payment_id: p.id,
        invoice_id: i,
        amount_cents: '10000',
        effective_on: addDays(today, -1),
        reference: '',
      })
    ).rejects.toThrow('financial_date_overdraw');
    expect((await summary(s)).payments.find((x) => x.id === p.id)?.available_cents).toBe('10000');
    expect((await summary(s)).deposits.find((x) => x.id === d.id)?.held_cents).toBe('10000');
  });
});
