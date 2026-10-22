import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rows } from './billing-data';
import type { CollectionsSnapshot, ReceiptStatement } from './collections-domain';
export async function loadCollectionsSnapshot(
  client: SupabaseClient,
  org: string
): Promise<CollectionsSnapshot> {
  const names = [
    'collection_policies',
    'manual_payments',
    'payment_events',
    'deposit_accounts',
    'deposit_events',
    'collection_receipts',
    'late_fee_assessments',
    'late_fee_waivers',
    'account_notes',
    'reconciliations',
    'reconciliation_voids',
    'invoices',
    'invoice_revisions',
  ];
  const [all, summary] = await Promise.all([
    Promise.all(names.map((name) => rows(client, name, org))),
    client.rpc('collection_summary', { org }),
  ]);
  if (summary.error) throw new Error('Collections summary unavailable.');
  // Individual stored amounts are bounded below Number.MAX_SAFE_INTEGER; aggregate RPC amounts are text.
  for (const group of all)
    for (const row of group)
      for (const key of Object.keys(row))
        if (key.endsWith('_cents') && row[key] !== null) row[key] = String(row[key]);
  const [
    policies,
    payments,
    paymentEvents,
    deposits,
    depositEvents,
    receipts,
    fees,
    waivers,
    notes,
    reconciliations,
    reconciliationVoids,
    invoices,
    revisions,
  ] = all;
  return {
    policies,
    payments,
    paymentEvents,
    deposits,
    depositEvents,
    receipts,
    fees,
    waivers,
    notes,
    reconciliations,
    reconciliationVoids,
    invoices,
    revisions,
    summary: summary.data,
  } as unknown as CollectionsSnapshot;
}
export async function loadReceipt(client: SupabaseClient, id: string): Promise<ReceiptStatement | null> {
  const { data, error } = await client.rpc('collection_receipt', { receipt_id: id });
  if (error) throw new Error('Receipt unavailable.');
  return data;
}
