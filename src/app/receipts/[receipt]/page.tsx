import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { loadReceipt } from '@/lib/collections-data';
import { ReceiptStatement } from '@/components/receipt-statement';
import { PrintButton } from '@/components/print-button';
export const dynamic = 'force-dynamic';
export default async function Receipt({ params }: { params: Promise<{ receipt: string }> }) {
  const { receipt: id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const statement = await loadReceipt(client, id);
  if (!statement) notFound();
  return (
    <main className="statement-page">
      <nav className="print-hidden statement-actions" aria-label="Receipt actions">
        <Link
          className="button"
          href={`/collections?organization=${statement.receipt.organization_id}&property=${statement.receipt.property_id}`}
        >
          Back to collections
        </Link>
        <PrintButton />
      </nav>
      <ReceiptStatement statement={statement} />
    </main>
  );
}
