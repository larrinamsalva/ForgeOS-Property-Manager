import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { loadReceipt } from '@/lib/collections-data';
import { receiptPdf } from '@/lib/receipt-pdf';
import { StatementCharacterError } from '@/lib/invoice-pdf';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ receipt: string }> }) {
  const { receipt: id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return NextResponse.json({ error: 'Sign in before downloading receipts.' }, { status: 401 });
  try {
    const statement = await loadReceipt(client, id);
    if (!statement) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    return new Response(new Uint8Array(await receiptPdf(statement)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${statement.receipt.number}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof StatementCharacterError
            ? e.message
            : 'Receipt could not be generated. Use the printable receipt and retry later.',
      },
      { status: e instanceof StatementCharacterError ? 422 : 503 }
    );
  }
}
