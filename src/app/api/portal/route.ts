import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import { sameOrigin } from '@/lib/request-origin';
import { readJson } from '@/lib/request-body';
import { residentCommandSchema } from '@/lib/commercial-validation';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { client } = await apiSession();
    const membership_id = z.uuid().parse(request.nextUrl.searchParams.get('membership'));
    const history_page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(request.nextUrl.searchParams.get('page') ?? 0);
    const result = await client.rpc('portal_snapshot', { membership_id, history_page });
    if (result.error) return rpcFailure(result.error);
    return NextResponse.json(result.data, { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  try {
    const { client } = await apiSession();
    const input = residentCommandSchema.parse(await readJson(request));
    const result = await client.rpc('resident_command', input);
    if (result.error) return rpcFailure(result.error);
    return NextResponse.json(result.data, { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
