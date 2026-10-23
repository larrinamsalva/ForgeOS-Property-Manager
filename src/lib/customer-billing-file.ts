import type { CollectionsSnapshot, CollectionAccount } from './collections-domain';

export interface CustomerBillRow {
  id: string;
  number: string;
  startsOn: string;
  endsOn: string;
  dueOn: string;
  status: CollectionAccount['state'];
  statementCents: string;
  appliedCents: string;
  balanceCents: string;
}
export interface CustomerBillingSummary {
  bills: CustomerBillRow[];
  totalOutstandingCents: string;
  latestBillCents: string | null;
  receipts: CollectionsSnapshot['receipts'];
}

// Financial totals come only from ISSUED invoices and authoritative
// collections balances. Never count drafts, unissued proposals or voids.
export function customerBillingSummary(
  data: Pick<CollectionsSnapshot, 'invoices' | 'revisions' | 'summary' | 'receipts'>,
  customerId: string,
  propertyId: string
): CustomerBillingSummary {
  const revisions = new Map(data.revisions.map((r) => [r.id, r]));
  const accountByInvoice = new Map(data.summary.accounts.map((a) => [a.invoice_id, a]));
  const bills: CustomerBillRow[] = data.invoices.flatMap((invoice) => {
    if (invoice.customer_id !== customerId || invoice.property_id !== propertyId) return [];
    const a = accountByInvoice.get(invoice.id);
    if (!a?.issued_on || !['issued', 'partially_paid', 'paid', 'overdue'].includes(a.state) || invoice.status !== 'approved') return [];
    const revision = revisions.get(invoice.current_revision_id);
    // If invoice evidence is missing, don't claim an accurate statement total.
    if (!revision) return [];
    return [{
      id: invoice.id, number: invoice.number, startsOn: invoice.starts_on, endsOn: invoice.ends_on,
      dueOn: a.due_on ?? invoice.due_on, status: a.state,
      statementCents: revision.total_cents, appliedCents: a.allocated_cents,
      balanceCents: a.outstanding_cents,
    }];
  }).sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.number.localeCompare(a.number));
  const receipts = data.receipts.filter((r) => r.customer_id === customerId &&
    r.property_id === propertyId).sort((a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return {
    bills,
    totalOutstandingCents: bills.reduce((sum, b) => sum + BigInt(b.balanceCents), 0n).toString(),
    latestBillCents: bills[0]?.statementCents ?? null,
    receipts,
  };
}
