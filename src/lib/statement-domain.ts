import type { Calculation, Invoice, InvoiceRevision, LedgerEntry } from './billing-domain';
import type { CollectionReceipt, PaymentEvent } from './collections-domain';
export type StatementInvoice = Pick<Invoice, 'id' | 'number' | 'status' | 'stay_id'> &
  Partial<Pick<Invoice, 'approval_reason' | 'void_reason'>>;
export type StatementRevision = Pick<InvoiceRevision, 'revision'> &
  Partial<Omit<InvoiceRevision, 'calculation' | 'revision'>> & { calculation: Calculation };
export type StatementLedger = Pick<
  LedgerEntry,
  'invoice_id' | 'kind' | 'amount_cents' | 'created_at' | 'reason' | 'reference'
> &
  Partial<LedgerEntry>;
export interface StatementReceipt {
  receipt: Pick<CollectionReceipt, 'id' | 'number' | 'source_kind' | 'source_id' | 'created_at'> & {
    created_by?: string;
    snapshot: CollectionReceipt['snapshot'];
  };
  history: Pick<
    PaymentEvent,
    'id' | 'kind' | 'amount_cents' | 'effective_on' | 'invoice_id' | 'reason' | 'reference' | 'reverses_id'
  >[];
  available_cents: string | null;
  voided: boolean;
}
