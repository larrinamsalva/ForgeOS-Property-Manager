import {
  cents,
  ledgerBalance,
  type Invoice,
  type InvoiceRevision,
  type LedgerEntry,
} from '@/lib/billing-domain';
export function InvoiceStatement({
  invoice,
  revision,
  ledger,
}: {
  invoice: Invoice;
  revision: InvoiceRevision;
  ledger: LedgerEntry[];
}) {
  const calc = revision.calculation;
  return (
    <article className="statement">
      <p className="eyebrow">
        ForgeOS · {invoice.number} · Revision {revision.revision}
      </p>
      <h1>{calc.property.name}</h1>
      <p>
        {[calc.property.address, calc.property.city, calc.property.state, calc.property.postal_code]
          .filter(Boolean)
          .join(', ')}
      </p>
      <p className="statement-status">
        {invoice.status === 'approved' ? 'Approved · Not issued' : invoice.status.toUpperCase()}
      </p>
      <p>Internal review copy. Not a payment request.</p>
      <h2>{calc.customer.name}</h2>
      <p className="preserve-lines">{calc.customer.mailing_address}</p>
      <p>{calc.customer.email}</p>
      <p>
        Site / unit {calc.site.label} · {calc.starts_on} to {calc.ends_on} (end exclusive)
      </p>
      <p>Planned due date {calc.due_on} · USD</p>
      <div className="table-wrap" role="region" aria-label="Statement items" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Subtotal</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {calc.lines.map((line, i) => (
              <tr key={i}>
                <th scope="row">{line.description}</th>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{cents(line.subtotal_cents)}</td>
                <td>
                  {cents(line.tax_cents)}
                  {line.tax_bps > 0 && (
                    <small>
                      {line.source.rate?.tax_label || line.source.tax_label} · {line.tax_bps} basis points
                    </small>
                  )}
                </td>
                <td>{cents(line.total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="statement-total">Statement total {cents(calc.total_cents)}</p>
      {invoice.status !== 'draft' && (
        <p>Approved / unissued internal balance {cents(ledgerBalance(ledger, invoice.id))}</p>
      )}
      <p>{calc.rounding}</p>
      {calc.utilities_reason && <p>Utility decision: {calc.utilities_reason}</p>}
      {calc.rent_reason && <p>Rent decision: {calc.rent_reason}</p>}
      {invoice.approval_reason && <p>Approval reason: {invoice.approval_reason}</p>}
      {invoice.void_reason && <p>Void reason: {invoice.void_reason}</p>}
      <h2>Calculation evidence</h2>
      <p>Tiers reset per invoice and rate version. Monthly charges use actual calendar days.</p>
      {calc.lines.map((line, i) => (
        <section key={i} className="statement-evidence">
          <h3>{line.description}</h3>
          {line.source.rate && (
            <p>
              {line.source.rate.label} · {line.source.rate.id}
              <br />
              Effective {line.source.rate.starts_on} to {line.source.rate.ends_on || 'open ended'} ·{' '}
              {line.source.rate.billed_unit}
            </p>
          )}
          {line.source.rate && (
            <>
              <p>
                {line.source.rate.tiers
                  .map(
                    (tier) =>
                      `Through ${tier.up_to || 'unlimited'}: $${tier.unit_price} / ${line.source.rate!.billed_unit}`
                  )
                  .join('; ')}
              </p>
              {line.source.rate.tax_bps > 0 && (
                <p>Tax authorization: {line.source.rate.authorization_reference}</p>
              )}
            </>
          )}
          {!line.source.rate && (
            <p>
              {typeof line.source.agreed_rate_cents === 'string' && (
                <>
                  Agreed rent {cents(line.source.agreed_rate_cents)} per {String(line.source.billing_period)}
                  .{' '}
                </>
              )}
              {typeof line.source.reason === 'string' && <>Authorization: {line.source.reason}. </>}
              {typeof line.source.proration === 'string' && (
                <>Proration: {line.source.proration.replaceAll('_', ' ')}. </>
              )}{' '}
              {typeof line.source.starts_on === 'string' && (
                <>
                  {line.source.starts_on} to {String(line.source.ends_on)} (exclusive).{' '}
                </>
              )}
            </p>
          )}
          {(line.source.segments ?? []).map((segment, j) => (
            <div key={j}>
              <p>
                <strong>{segment.meter.label}</strong> · {segment.meter.serial_number}
              </p>
              <p>
                {segment.from_reading.effective_value} → {segment.to_reading.effective_value}{' '}
                {segment.meter.unit}
              </p>
              <p>
                {segment.delta} × {segment.multiplier} × {segment.conversion_factor} = {segment.quantity}{' '}
                {segment.unit}
              </p>
              <p>
                Reading {segment.from_reading.id} at {segment.from_reading.captured_at} (
                {segment.from_reading.kind})<br />
                Reading {segment.to_reading.id} at {segment.to_reading.captured_at} ({segment.to_reading.kind}
                )
              </p>
              <p>
                Accepted reviews {segment.from_reading.review_id} / {segment.to_reading.review_id}
              </p>
              {segment.register_event && (
                <p>
                  {segment.register_event.kind}: {segment.register_event.reason}
                </p>
              )}
            </div>
          ))}
          <details className="print-expanded">
            <summary>Full calculation record</summary>
            <pre className="source-json">{JSON.stringify(line.source, null, 2)}</pre>
          </details>
        </section>
      ))}
      {ledger.some((e) => e.invoice_id === invoice.id) && (
        <>
          <h2>Internal ledger history</h2>
          {ledger
            .filter((e) => e.invoice_id === invoice.id)
            .map((entry) => (
              <p key={entry.id}>
                {entry.created_at} · {entry.kind.replaceAll('_', ' ')} · {cents(entry.amount_cents)}
                <br />
                {entry.reason} {entry.reference}
              </p>
            ))}
        </>
      )}
    </article>
  );
}
