import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import type { PortalInvoiceDocument } from '@/lib/commercial-domain';
import { invoicePdf, StatementCharacterError } from '@/lib/invoice-pdf';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  try {
    const { client } = await apiSession();
    const { invoice: id } = await params;
    if (!z.uuid().safeParse(id).success)
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    const result = await client.rpc('portal_invoice_statement', { invoice_id: id });
    if (result.error) return rpcFailure(result.error);
    const doc = result.data as PortalInvoiceDocument | null;
    if (!doc) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (request.nextUrl.searchParams.get('format') !== 'pdf')
      return NextResponse.json(doc, { headers: noStore });
    const bytes = await invoicePdf(doc.invoice, doc.revision, doc.ledger, doc.collection, true);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ForgeOS-invoice-' + id + '.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof StatementCharacterError)
      return NextResponse.json({ error: error.message }, { status: 422 });
    return apiFailure(error);
  }
}
