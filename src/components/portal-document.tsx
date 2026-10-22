import { cents } from '@/lib/billing-domain';
import type { PortalInvoiceDocument, PortalReceiptDocument } from '@/lib/commercial-domain';
export function PortalInvoiceContent({ document: d }: { document: PortalInvoiceDocument }) {
  const c = d.revision.calculation;
  return (
    <article className="statement">
      <p className="eyebrow">ForgeOS · {d.invoice.number} · USD</p>
      <h1>{c.property.name}</h1>
      <p>
        {[c.property.address, c.property.city, c.property.state, c.property.postal_code]
          .filter(Boolean)
          .join(', ')}
      </p>
      <h2>
        {c.customer.name} · {c.site.label}
      </h2>
      <p>
        {c.starts_on} to {c.ends_on} · Due {c.due_on} · Revision {d.revision.revision}
      </p>
      {d.invoice.status === 'voided' && <p className="statement-status">VOIDED · Original record retained</p>}
      <h2>Charges & usage</h2>
      {c.lines.map((l, i) => (
        <section key={i}>
          <h3>{l.description}</h3>
          <p>
            {l.quantity} {l.unit} · Subtotal {cents(l.subtotal_cents)} · Tax {cents(l.tax_cents)} · Total{' '}
            {cents(l.total_cents)}
          </p>
          {l.source.segments?.map((s, j) => (
            <p key={j}>
              {s.meter.label}: {s.from_reading.effective_value} to {s.to_reading.effective_value} {s.unit} ·
              Usage {s.quantity} · Multiplier {s.multiplier} · Conversion {s.conversion_factor}
              {s.register_event ? ` · ${s.register_event.kind}` : ''}
            </p>
          ))}
        </section>
      ))}
      <p>
        Subtotal {cents(c.subtotal_cents)} · Tax {cents(c.tax_cents)}
      </p>
      <p className="statement-total">Current outstanding {cents(d.collection.outstanding_cents)}</p>
      <p>
        Approved total {cents(c.total_cents)} · Credits{' '}
        {cents(BigInt(c.total_cents) - BigInt(d.collection.adjusted_cents))} · Paid{' '}
        {cents(d.collection.allocated_cents)}
      </p>
      <p>{c.rounding}</p>
      <h2>Account history</h2>
      {d.collection.history.map((e) => (
        <p key={e.id}>
          {e.effective_on} · {e.kind.replaceAll('_', ' ')} · {cents(e.amount_cents)}
        </p>
      ))}
    </article>
  );
}
export function PortalReceiptContent({ document: d }: { document: PortalReceiptDocument }) {
  const r = d.receipt,
    s = r.snapshot;
  return (
    <article className="statement">
      <p className="eyebrow">ForgeOS · {r.number} · USD</p>
      <h1>{s.property.name}</h1>
      <h2>{s.customer.name}</h2>
      <p>
        {s.kind.replaceAll('_', ' ')} · {s.effective_on} · {s.method}
      </p>
      {d.voided && <p className="statement-status">VOIDED / REVERSED · Original retained</p>}
      <p className="statement-total">{cents(s.amount_cents)}</p>
      <p>Reference: {s.reference || 'Not recorded'}</p>
      <p>Recorded {r.created_at}. This receipt records your office’s manual transaction.</p>
      {s.kind.startsWith('deposit_') && (
        <p>Held deposit liability is recorded separately from invoice income.</p>
      )}
      {d.available_cents !== null && <p>Currently unapplied {cents(d.available_cents)}</p>}
      <h2>Current history</h2>
      {d.history.map((e) => (
        <p key={e.id}>
          {e.effective_on} · {e.kind.replaceAll('_', ' ')} · {cents(e.amount_cents)}
        </p>
      ))}
    </article>
  );
}
