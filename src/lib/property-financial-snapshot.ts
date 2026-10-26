import type { CollectionsSnapshot } from './collections-domain';

// Portfolio totals are derived solely from issued ledger accounts.
// Payment allocations are not the same as cash received.
export function propertyFinancialSnapshot(
  data: Pick<CollectionsSnapshot, 'invoices' | 'revisions' | 'summary' | 'payments'>,
  propertyIds: string[]
) {
  const authorized = new Set(propertyIds);
  const invoices = new Map(data.invoices.filter(i => authorized.has(i.property_id) && i.status === 'approved').map(i => [i.id, i]));
  const revisions = new Map(data.revisions.map(r => [r.id, r]));
  const totals = new Map<string, { propertyId: string; issuedCents: bigint; outstandingCents: bigint; overdueAccounts: number }>();
  for (const propertyId of authorized)
    totals.set(propertyId, { propertyId, issuedCents: 0n, outstandingCents: 0n, overdueAccounts: 0 });
  for (const account of data.summary.accounts) {
    const invoice = invoices.get(account.invoice_id);
    if (!invoice || invoice.property_id !== account.property_id ||
      !account.issued_on || !['issued','partially_paid','paid','overdue'].includes(account.state)) continue;
    const row = totals.get(invoice.property_id)!;
    const revision = revisions.get(invoice.current_revision_id);
    if (revision) row.issuedCents += BigInt(revision.total_cents);
    row.outstandingCents += BigInt(account.outstanding_cents);
    if (account.state === 'overdue') row.overdueAccounts++;
  }
  // Gross recorded payments (not allocations), excluding corrected/voided records.
  const excluded = new Set(data.payments.filter(p => p.corrects_payment_id).map(p => p.corrects_payment_id));
  const payments = data.payments.filter(p => authorized.has(p.property_id) && !excluded.has(p.id));
  return [...totals.values()].map(row => ({
    propertyId: row.propertyId,
    issuedCents: row.issuedCents.toString(),
    outstandingCents: row.outstandingCents.toString(),
    overdueAccounts: row.overdueAccounts,
    recordedPaymentsCents: payments.filter(p => p.property_id === row.propertyId)
      .reduce((sum,p)=>sum + BigInt(p.amount_cents),0n).toString(),
  }));
}
