import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { loadBillingStatement } from '@/lib/billing-data';
import { InvoiceStatement } from '@/components/invoice-statement';
import { PrintButton } from '@/components/print-button';
export const dynamic = 'force-dynamic';
export default async function Statement({ params }: { params: Promise<{ invoice: string }> }) {
  const { invoice: id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const statement = await loadBillingStatement(client, id);
  if (!statement) notFound();
  const { invoice, revision, ledger } = statement;
  return (
    <main className="statement-page">
      <nav className="print-hidden statement-actions" aria-label="Statement actions">
        <Link
          className="button"
          href={`/billing?organization=${invoice.organization_id}&property=${invoice.property_id}`}
        >
          Back to billing
        </Link>
        <PrintButton />
      </nav>
      <InvoiceStatement invoice={invoice} revision={revision} ledger={ledger ?? []} />
    </main>
  );
}
