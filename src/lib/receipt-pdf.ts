import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { cents } from './billing-domain';
import { stateLabel, type ReceiptStatement } from './collections-domain';
import { StatementCharacterError } from './invoice-pdf';
export async function receiptPdf(statement: ReceiptStatement) {
  const { receipt: r, history, voided, available_cents } = statement,
    s = r.snapshot;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.number} - ${stateLabel(s.kind)}`);
  pdf.setAuthor('ForgeOS');
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all(
    [400, 700].map(async (weight) =>
      pdf.embedFont(
        await readFile(
          join(
            process.cwd(),
            `node_modules/@fontsource/noto-sans/files/noto-sans-latin-${weight}-normal.woff`
          )
        ),
        { subset: true }
      )
    )
  );
  const supported = new Set(regular.getCharacterSet()),
    ink = rgb(0.1, 0.16, 0.23),
    accent = rgb(0.05, 0.35, 0.32);
  let page: PDFPage,
    y = 0;
  function newPage() {
    page = pdf.addPage([612, 792]);
    y = 740;
    page.drawText(`FORGEOS  |  ${r.number}`, { x: 48, y, size: 12, font: bold, color: accent });
    y -= 30;
  }
  function write(raw: string, size = 10, strong = false) {
    const text = raw.replace(/\s+/g, ' ').trim(),
      font = strong ? bold : regular;
    if ([...text].some((c) => !supported.has(c.codePointAt(0)!)))
      throw new StatementCharacterError(
        'This receipt contains characters the PDF font cannot encode. Use the printable receipt to preserve every name and character.'
      );
    // Character wrapping also handles long transaction references without truncation.
    let line = '';
    const lines: string[] = [];
    for (const word of text.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= 516) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const c of word) {
        if (font.widthOfTextAtSize(line + c, size) > 516) {
          lines.push(line);
          line = '';
        }
        line += c;
      }
    }
    if (line) lines.push(line);
    for (const line of lines) {
      if (y - size - 6 < 60) newPage();
      page.drawText(line, { x: 48, y: y - size, size, font, color: ink });
      y -= size + 6;
    }
    y -= 4;
  }
  function heading(text: string) {
    if (y < 105) newPage();
    y -= 8;
    write(text, 12, true);
  }
  newPage();
  write(s.property.name, 18, true);
  write(
    [s.property.address, s.property.city, s.property.state, s.property.postal_code].filter(Boolean).join(', ')
  );
  heading(stateLabel(s.kind));
  if (voided)
    write(
      `${r.source_kind === 'payment' ? 'VOIDED PAYMENT' : 'REVERSED EVENT'} - Original record retained`,
      12,
      true
    );
  write(cents(s.amount_cents), 24, true);
  write(
    `Transaction date ${s.effective_on} | ${s.method ? stateLabel(s.method) : 'Application of held deposit; no cash movement'}`
  );
  heading(s.customer.name);
  write(s.customer.mailing_address);
  write(s.customer.email);
  write(`Reference: ${s.reference || 'No external reference recorded'}`);
  write(s.notes);
  write(
    'Manual staff record. External processing and bank settlement are verified through your existing process.',
    9
  );
  if (s.kind.startsWith('deposit_'))
    write('This records a deposit liability event separately from invoice income.', 9);
  heading('Record evidence');
  write(`Recorded ${r.created_at} | Staff ${r.created_by}`, 9);
  write(`Source ${s.source.id}`, 9);
  if (s.source.payment_id) write(`Payment ${s.source.payment_id}`, 9);
  if (s.source.deposit_id) write(`Deposit account ${s.source.deposit_id}`, 9);
  if (s.source.invoice_id) write(`Invoice ${s.source.invoice_id}`, 9);
  if (s.source.reverses_id) write(`Reverses event ${s.source.reverses_id}`, 9);
  if (s.source.corrects_payment_id) write(`Corrects voided payment ${s.source.corrects_payment_id}`, 9);
  write('Original receipt details are preserved as recorded. Corrections create linked entries.', 9);
  if (r.source_kind === 'payment') {
    heading('Current payment history');
    write(
      `Unapplied amount ${cents(available_cents ?? '0')} as of this view. Allocations do not change the original received amount above.`,
      9
    );
    if (!history.length) write('No allocations, refunds or corrections recorded.', 9);
    for (const e of history) {
      if (y < 120) newPage();
      write(`${e.effective_on} | ${stateLabel(e.kind)} | ${cents(e.amount_cents)}`, 10, true);
      write(`${e.reason} | ${e.reference}`, 9);
      if (e.invoice_id) write(`Invoice ${e.invoice_id}`, 9);
      write(`Event ${e.id}${e.reverses_id ? ` | Reverses ${e.reverses_id}` : ''}`, 8);
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${r.number} | ${i + 1} / ${pages.length} | USD`, {
      x: 48,
      y: 32,
      size: 8,
      font: regular,
      color: ink,
    })
  );
  return pdf.save();
}
