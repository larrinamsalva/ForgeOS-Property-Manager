import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { PortalReceiptContent } from '@/components/portal-document';
import { PrintButton } from '@/components/print-button';
import type { PortalReceiptDocument } from '@/lib/commercial-domain';
export const dynamic = 'force-dynamic';
export default async function Document({ params }: { params: Promise<{ receipt: string }> }) {
  const { receipt: id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login?portal=1');
  const result = await client.rpc('portal_receipt_statement', { receipt_id: id });
  if (result.error || !result.data) notFound();
  return (
    <main className="statement-page">
      <nav className="print-hidden statement-actions" aria-label="Document actions">
        <Link href="/portal" className="button secondary">
          Back to resident portal
        </Link>
        <PrintButton />
        <a className="button secondary" href={`/api/portal/receipts/${id}`}>
          Download PDF
        </a>
      </nav>
      <PortalReceiptContent document={result.data as PortalReceiptDocument} />
    </main>
  );
}
