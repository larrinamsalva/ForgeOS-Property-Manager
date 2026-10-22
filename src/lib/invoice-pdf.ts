import type { CollectionAccount } from './collections-domain';
import { stateLabel } from './collections-domain';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { cents, ledgerBalance } from './billing-domain';
import type { StatementInvoice, StatementRevision, StatementLedger } from './statement-domain';
export class StatementCharacterError extends Error {}
export async function invoicePdf(
  invoice: StatementInvoice,
  revision: StatementRevision,
  ledger: StatementLedger[],
  collection?: CollectionAccount,
  resident = false
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${invoice.number} - ${collection?.issued_on ? 'Invoice' : 'Internal review statement'}`);
  pdf.setAuthor('ForgeOS');
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
    readFile(join(process.cwd(), 'node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff')),
  ]);
  const [regular, bold] = await Promise.all([
    pdf.embedFont(regularBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
  ]);
  const supported = new Set(regular.getCharacterSet());
  const ink = rgb(0.1, 0.16, 0.23);
  const muted = rgb(0.29, 0.34, 0.4);
  const accent = rgb(0.05, 0.35, 0.32);
  const margin = 48;
  const width = 516;
  let page: PDFPage;
  let y = 0;
  let tableHeader: [string, string, string] | null = null;
  const status = collection?.issued_on
    ? stateLabel(collection.state).toUpperCase()
    : invoice.status === 'approved'
      ? 'APPROVED - NOT ISSUED'
      : invoice.status.toUpperCase();
  function clean(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }
  function wrap(raw: string, maxWidth: number, size: number, strong = false): string[] {
    const text = clean(raw);
    const font = strong ? bold : regular;
    try {
      if ([...text].some((character) => !supported.has(character.codePointAt(0)!)))
        throw new Error('Unsupported character');
      font.encodeText(text);
    } catch {
      throw new StatementCharacterError(
        'This statement contains characters the PDF font cannot encode. Use the printable statement to preserve every name and character.'
      );
    }
    const words = text.split(' ');
    const output: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) output.push(current);
      current = '';
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, size) > maxWidth) {
          output.push(current);
          current = '';
        }
        current += character;
      }
    }
    if (current) output.push(current);
    return output.length ? output : [''];
  }
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 744;
    page.drawText('FORGEOS', { x: margin, y, size: 12, font: bold, color: accent });
    page.drawText(invoice.number, { x: 390, y, size: 11, font: bold, color: ink });
    y -= 24;
    page.drawText(status, { x: margin, y, size: 11, font: bold, color: ink });
    y -= 18;
    page.drawText(
      collection?.issued_on
        ? `Issued ${collection.issued_on} | Due ${collection.due_on}`
        : 'Internal review copy. Not a payment request.',
      {
        x: margin,
        y,
        size: 9,
        font: regular,
        color: muted,
      }
    );
    y -= 24;
    page.drawLine({
      start: { x: margin, y: y + 10 },
      end: { x: 564, y: y + 10 },
      color: rgb(0.8, 0.84, 0.85),
      thickness: 0.6,
    });
    if (tableHeader) row(...tableHeader, true);
  }
  function space(height: number) {
    if (y - height < 62) newPage();
  }
  function text(raw: string, size = 10, strong = false, color = ink) {
    for (const row of wrap(raw, width, size, strong)) {
      space(size + 5);
      page.drawText(row, { x: margin, y: y - size, size, font: strong ? bold : regular, color });
      y -= size + 5;
    }
  }
  function heading(value: string) {
    space(40);
    y -= 10;
    text(value, 12, true, accent);
    y -= 3;
  }
  function row(description: string, quantity: string, amount: string, strong = false) {
    const descriptionRows = wrap(description, 292, 10, strong);
    const quantityRows = wrap(quantity, 100, 9);
    const amountRows = wrap(amount, 100, 10, strong);
    const count = Math.max(descriptionRows.length, quantityRows.length, amountRows.length);
    space(count * 15 + 8);
    for (let n = 0; n < count; n++) {
      if (descriptionRows[n])
        page.drawText(descriptionRows[n], {
          x: margin,
          y: y - 10,
          size: 10,
          font: strong ? bold : regular,
          color: ink,
        });
      if (quantityRows[n])
        page.drawText(quantityRows[n], { x: 348, y: y - 10, size: 9, font: regular, color: muted });
      if (amountRows[n])
        page.drawText(amountRows[n], {
          x: 564 - (strong ? bold : regular).widthOfTextAtSize(amountRows[n], 10),
          y: y - 10,
          size: 10,
          font: strong ? bold : regular,
          color: ink,
        });
      y -= 15;
    }
    y -= 6;
  }
  const calc = revision.calculation;
  newPage();
  text(calc.property.name, 18, true);
  text(
    [calc.property.address, calc.property.city, calc.property.state, calc.property.postal_code]
      .filter(Boolean)
      .join(', ')
  );
  y -= 10;
  text(calc.customer.name, 13, true);
  if (calc.customer.mailing_address) text(calc.customer.mailing_address);
  if (calc.customer.email) text(calc.customer.email);
  text(`Site / unit ${calc.site.label} | Revision ${revision.revision}`);
  text(`Service dates: ${calc.starts_on} to ${calc.ends_on} (end exclusive)`);
  text(
    `${collection?.issued_on ? 'Actual due date: ' + collection.due_on : 'Planned due date: ' + calc.due_on} | Currency: USD`
  );
  heading('Itemized charges');
  row('Description', 'Quantity', 'Amount', true);
  tableHeader = ['Description', 'Quantity', 'Amount'];
  for (const item of calc.lines) {
    row(item.description, `${item.quantity} ${item.unit}`, cents(item.subtotal_cents));
    if (BigInt(item.tax_cents) !== 0n)
      row(
        `${item.source.rate?.tax_label || item.source.tax_label || 'Authorized tax'} (${item.tax_bps} basis points)`,
        '',
        cents(item.tax_cents)
      );
  }
  row('Subtotal', '', cents(calc.subtotal_cents));
  row('Tax', '', cents(calc.tax_cents));
  row('Statement total', '', cents(calc.total_cents), true);
  tableHeader = null;
  if (invoice.status !== 'draft') {
    row(
      collection?.issued_on ? 'Current outstanding' : 'Approved / unissued internal balance',
      '',
      cents(collection?.outstanding_cents ?? ledgerBalance(ledger, invoice.id)),
      true
    );
  }
  if (collection?.issued_on) {
    text(`Balances as of ${collection.as_of} | Grace through ${collection.grace_ends_on}`, 9);
    text(
      `Charges after credits ${cents(collection.adjusted_cents)} | Allocated ${cents(collection.allocated_cents)}`,
      9
    );
    heading('Payment and deposit history');
    if (!collection.history.length) text('No allocations recorded.', 9);
    for (const e of collection.history) {
      text(`${e.effective_on} | ${e.source} | ${stateLabel(e.kind)} | ${cents(e.amount_cents)}`, 9);
      text(`${e.reason} | ${e.reference}`, 9);
      text(`Source ${e.source_id}`, 8);
    }
  }
  text(calc.rounding, 9, false, muted);
  if (calc.utilities_reason) text(`Utility decision: ${calc.utilities_reason}`, 9);
  if (calc.rent_reason) text(`Rent decision: ${calc.rent_reason}`, 9);
  if (invoice.approval_reason) text(`Approval reason: ${invoice.approval_reason}`, 9);
  if (invoice.void_reason) text(`Void reason: ${invoice.void_reason}`, 9);
  heading('Calculation evidence');
  text(
    'Monthly base charges use actual calendar days. Tiers reset per invoice and rate version; assigned meters are aggregated.',
    9
  );
  for (const item of calc.lines) {
    space(item.source.segments?.length ? 190 : 100);
    heading(item.description);
    const rate = item.source.rate;
    if (rate) {
      text(`Rate: ${rate.label} | ${rate.id}`, 9);
      text(`Effective ${rate.starts_on} to ${rate.ends_on || 'open ended'} | ${rate.billed_unit}`, 9);
      for (const tier of rate.tiers)
        text(`Tier through ${tier.up_to || 'unlimited'}: $${tier.unit_price} / ${rate.billed_unit}`, 9);
      if (rate.tax_bps > 0 && rate.authorization_reference)
        text(`Tax authorization: ${rate.authorization_reference}`, 9);
    }
    for (const segment of item.source.segments ?? []) {
      space(135);
      text(`${segment.meter.label} | Serial ${segment.meter.serial_number}`, 10, true);
      text(
        `From ${segment.from_reading.effective_value} ${segment.meter.unit} at ${segment.from_reading.captured_at} (${segment.from_reading.kind})`,
        9
      );
      text(
        `To ${segment.to_reading.effective_value} ${segment.meter.unit} at ${segment.to_reading.captured_at} (${segment.to_reading.kind})`,
        9
      );
      text(
        `Usage: ${segment.delta} x multiplier ${segment.multiplier} x conversion ${segment.conversion_factor} = ${segment.quantity} ${segment.unit}`,
        9
      );
      text(`Readings: ${segment.from_reading.id} / ${segment.to_reading.id}`, 8);
      text(`Accepted reviews: ${segment.from_reading.review_id} / ${segment.to_reading.review_id}`, 8);
      if (segment.register_event)
        text(`Register ${segment.register_event.kind}: ${segment.register_event.reason}`, 9);
    }
    if (!rate) {
      const source = item.source;
      if (typeof source.agreed_rate_cents === 'string')
        text(`Agreed rent: ${cents(source.agreed_rate_cents)} per ${String(source.billing_period)}.`, 9);
      if (typeof source.starts_on === 'string')
        text(`Service: ${source.starts_on} to ${String(source.ends_on)} (end exclusive).`, 9);
      if (typeof source.proration === 'string')
        text(`Proration: ${source.proration.replaceAll('_', ' ')}.`, 9);
      if (item.category === 'rent') text(`Stay record: ${invoice.stay_id}`, 8);
      if (source.lease && typeof source.lease === 'object' && 'id' in source.lease)
        text(`Lease record: ${String(source.lease.id)}`, 8);
      if (typeof source.reason === 'string') text(`Authorization: ${source.reason}`, 9);
      if (typeof source.authorization_reference === 'string' && source.authorization_reference)
        text(`Tax authorization: ${source.authorization_reference}`, 9);
    }
  }
  const entries = ledger.filter((e) => e.invoice_id === invoice.id);
  if (entries.length) {
    space(110);
    heading(resident ? 'Account adjustments' : 'Internal ledger history');
    row('Event', 'Date', 'Amount', true);
    tableHeader = ['Event', 'Date', 'Amount'];
    for (const entry of entries) {
      space(70);
      row(entry.kind.replaceAll('_', ' '), entry.created_at.slice(0, 10), cents(entry.amount_cents));
      text(`${entry.reason}${entry.reference ? ` | ${entry.reference}` : ''}`, 9);
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) =>
    p.drawText(`${invoice.number} | Revision ${revision.revision} | ${index + 1} / ${pages.length}`, {
      x: margin,
      y: 32,
      size: 8,
      font: regular,
      color: muted,
    })
  );
  return pdf.save();
}
