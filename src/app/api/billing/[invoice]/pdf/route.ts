import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { loadBillingStatement } from '@/lib/billing-data';
import { invoicePdf, StatementCharacterError } from '@/lib/invoice-pdf';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ invoice: string }> }) {
  const { invoice: id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Statement not found.' }, { status: 404 });
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return NextResponse.json({ error: 'Sign in before downloading statements.' }, { status: 401 });
  try {
    const statement = await loadBillingStatement(client, id);
    if (!statement) return NextResponse.json({ error: 'Statement not found.' }, { status: 404 });
    const { invoice, revision, ledger } = statement;
    const bytes = await invoicePdf(invoice, revision, ledger ?? []);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
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
            : 'Statement could not be generated. Use the printable statement and retry later.',
      },
      { status: e instanceof StatementCharacterError ? 422 : 503 }
    );
  }
}
