import { cents } from '@/lib/billing-domain';
import { stateLabel, type ReceiptStatement as Statement } from '@/lib/collections-domain';
export function ReceiptStatement({ statement }: { statement: Statement }) {
  const { receipt: r, history, available_cents, voided } = statement,
    s = r.snapshot;
  return (
    <article className="statement">
      <p className="eyebrow">ForgeOS · {r.number} · USD</p>
      <h1>{s.property.name}</h1>
      <p>
        {[s.property.address, s.property.city, s.property.state, s.property.postal_code]
          .filter(Boolean)
          .join(', ')}
      </p>
      <h2>{stateLabel(s.kind)}</h2>
      {voided && (
        <p className="statement-status">
          {r.source_kind === 'payment' ? 'VOIDED PAYMENT' : 'REVERSED EVENT'} · Original record retained
        </p>
      )}
      <p className="statement-total">{cents(s.amount_cents)}</p>
      <p>
        Transaction date {s.effective_on} ·{' '}
        {s.method ? stateLabel(s.method) : 'Application of held deposit; no cash movement'}
      </p>
      <h2>{s.customer.name}</h2>
      <p className="preserve-lines">{s.customer.mailing_address}</p>
      <p>{s.customer.email}</p>
      <p>Reference: {s.reference || 'No external reference recorded'}</p>
      <p className="preserve-lines">{s.notes}</p>
      <p>
        Manual staff record. External processing and bank settlement are verified through your existing
        process.
      </p>
      {s.kind.startsWith('deposit_') && (
        <p>This records a deposit liability event separately from invoice income.</p>
      )}
      <p>
        Recorded {r.created_at} · Staff {r.created_by}
      </p>
      <p>
        Source {s.source.id}
        {s.source.payment_id ? ` · Payment ${s.source.payment_id}` : ''}
        {s.source.deposit_id ? ` · Deposit account ${s.source.deposit_id}` : ''}
        {s.source.invoice_id ? ` · Invoice ${s.source.invoice_id}` : ''}
      </p>
      {s.source.reverses_id && <p>Reverses original event {s.source.reverses_id}</p>}
      {s.source.corrects_payment_id && <p>Corrects voided payment {s.source.corrects_payment_id}</p>}
      <p>Original receipt details are preserved as recorded. Corrections create linked entries.</p>
      {r.source_kind === 'payment' && (
        <>
          <h2>Current payment history</h2>
          <p>
            Unapplied amount {cents(available_cents ?? '0')} as of this view. Allocations do not change the
            original received amount above.
          </p>
          {!history.length ? (
            <p>No allocations, refunds or corrections recorded.</p>
          ) : (
            history.map((e) => (
              <section className="statement-evidence" key={e.id}>
                <p>
                  {e.effective_on} · {stateLabel(e.kind)} · {cents(e.amount_cents)}
                </p>
                <p>
                  {e.reason} · {e.reference}
                </p>
                {e.invoice_id && <p>Invoice {e.invoice_id}</p>}
                <p>
                  Event {e.id}
                  {e.reverses_id ? ` · Reverses ${e.reverses_id}` : ''}
                </p>
              </section>
            ))
          )}
        </>
      )}
    </article>
  );
}
