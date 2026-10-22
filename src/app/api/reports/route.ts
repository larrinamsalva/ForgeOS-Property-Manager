import { NextRequest, NextResponse } from 'next/server';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import { reportQuerySchema } from '@/lib/commercial-validation';
import { reportDefinitions, type ReportResult } from '@/lib/reports-domain';
import { csv } from '@/lib/domain';
import { collectionDollars } from '@/lib/collections-domain';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { client } = await apiSession(),
      q = request.nextUrl.searchParams;
    const input = reportQuerySchema.parse({
      organization: q.get('organization'),
      kind: q.get('kind') ?? 'property_comparison',
      starts_on: q.get('starts_on'),
      ends_on: q.get('ends_on'),
      property_id: q.get('property_id') || null,
      site_id: q.get('site_id') || null,
      customer_id: q.get('customer_id') || null,
      employee_id: q.get('employee_id') || null,
      status: q.get('status') ?? '',
      category: q.get('category') ?? '',
      page: q.get('page') ?? 0,
    });
    const { organization: org, kind, page, ...filters } = input;
    if (q.get('summary') === '1') {
      const result = await client.rpc('reports_summary', {
        org,
        starts_on: filters.starts_on,
        ends_on: filters.ends_on,
      });
      if (result.error) return rpcFailure(result.error);
      return NextResponse.json(result.data, { headers: noStore });
    }
    const download = q.get('format') === 'csv';
    const result = await client.rpc('report_records', {
      org,
      report_kind: kind,
      filters,
      page_number: download ? 0 : page,
      page_size: download ? 10001 : 50,
    });
    if (result.error) return rpcFailure(result.error);
    const data = result.data as ReportResult;
    if (!download) return NextResponse.json(data, { headers: noStore });
    if (BigInt(data.total) > 10000n)
      return NextResponse.json(
        { error: 'This export exceeds 10,000 rows. Narrow the filters and export again.' },
        { status: 409 }
      );
    const columns = reportDefinitions[kind].columns;
    const output = csv([
      columns.map((c) => c.label),
      ...data.rows.map((r) =>
        r.values.map((v, i) =>
          columns[i]?.kind === 'money' ? collectionDollars(String(v ?? '0')) : String(v ?? '')
        )
      ),
    ]);
    return new Response('\uFEFF' + output, {
      headers: {
        ...noStore,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ForgeOS-' + kind + '.csv"',
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
