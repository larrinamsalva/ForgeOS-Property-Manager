import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { PortalInvoiceContent } from '@/components/portal-document';
import { PrintButton } from '@/components/print-button';
import type { PortalInvoiceDocument } from '@/lib/commercial-domain';
export const dynamic = 'force-dynamic';
export default async function Document({ params }: { params: Promise<{ invoice: string }> }) {
  const { invoice: id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login?portal=1');
  const result = await client.rpc('portal_invoice_statement', { invoice_id: id });
  if (result.error || !result.data) notFound();
  return (
    <main className="statement-page">
      <nav className="print-hidden statement-actions" aria-label="Document actions">
        <Link href="/portal" className="button secondary">
          Back to resident portal
        </Link>
        <PrintButton />
        <a className="button secondary" href={`/api/portal/invoices/${id}?format=pdf`}>
          Download PDF
        </a>
      </nav>
      <PortalInvoiceContent document={result.data as PortalInvoiceDocument} />
    </main>
  );
}
