import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingSnapshot } from './billing-domain';
export async function rows(client: SupabaseClient, table: string, org: string) {
  const result: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('organization_id', org)
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new Error('Billing records unavailable.');
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
export async function loadBillingSnapshot(client: SupabaseClient, org: string): Promise<BillingSnapshot> {
  const names = [
    'billing_policies',
    'utility_rate_plans',
    'meter_register_events',
    'invoices',
    'invoice_revisions',
    'billing_ledger_entries',
  ];
  const all = await Promise.all(names.map((name) => rows(client, name, org)));
  const [{ data: sources, error }, { data: accounts, error: accountError }] = await Promise.all([
    client.rpc('billing_sources', { org }),
    client.rpc('collection_accounts', { org }),
  ]);
  if (accountError) throw new Error('Account balances unavailable.');
  if (error) throw new Error('Register evidence unavailable.');
  // API bigint values are safe within schema limits; financial consumers use strings/BigInt.
  for (const i of [1, 4, 5])
    for (const row of all[i])
      for (const key of ['monthly_base_cents', 'sewer_base_cents', 'total_cents', 'amount_cents'])
        if (row[key] !== undefined) row[key] = String(row[key]);
  return {
    policies: all[0],
    rates: all[1],
    events: all[2],
    invoices: all[3],
    revisions: all[4],
    ledger: all[5],
    sources,
    accounts,
  } as unknown as BillingSnapshot;
}

/** A single PostgreSQL statement snapshot keeps header, revision and ledger consistent. */
export async function loadBillingStatement(client: SupabaseClient, invoiceId: string) {
  const { data, error } = await client.rpc('billing_statement', { invoice_id: invoiceId });
  if (error) throw new Error('Statement records unavailable.');
  if (!data) return null;
  const statement = data as import('./billing-domain').BillingStatement;
  statement.revision.total_cents = String(statement.revision.total_cents);
  statement.ledger = statement.ledger.map((entry) => ({
    ...entry,
    amount_cents: String(entry.amount_cents),
  }));
  return statement;
}
