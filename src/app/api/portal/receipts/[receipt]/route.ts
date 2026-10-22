import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import { receiptPdf } from '@/lib/receipt-pdf';
import { StatementCharacterError } from '@/lib/invoice-pdf';
import type { StatementReceipt } from '@/lib/statement-domain';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ receipt: string }> }) {
  try {
    const { client } = await apiSession();
    const { receipt: id } = await params;
    if (!z.uuid().safeParse(id).success)
      return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    const result = await client.rpc('portal_receipt_statement', { receipt_id: id });
    if (result.error) return rpcFailure(result.error);
    if (!result.data) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    const bytes = await receiptPdf(result.data as StatementReceipt);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ForgeOS-receipt-' + id + '.pdf"',
      },
    });
  } catch (error) {
    if (error instanceof StatementCharacterError)
      return NextResponse.json({ error: error.message }, { status: 422 });
    return apiFailure(error);
  }
}
