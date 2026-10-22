import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import { sameOrigin } from '@/lib/request-origin';
import { readJson } from '@/lib/request-body';
import { commercialCommandSchema } from '@/lib/commercial-validation';
import { loadCommercialSnapshot } from '@/lib/commercial-data';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { client, user } = await apiSession();
    const org = z.uuid().parse(request.nextUrl.searchParams.get('organization'));
    const { data: member, error } = await client
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', org)
      .eq('user_id', user.id)
      .single();
    if (error || !member)
      return NextResponse.json({ error: 'Staff organization access is required.' }, { status: 403 });
    return NextResponse.json(await loadCommercialSnapshot(client, org), { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  try {
    const { client } = await apiSession();
    const input = commercialCommandSchema.parse(await readJson(request));
    const result = await client.rpc('commercial_command', input);
    if (result.error) return rpcFailure(result.error);
    return NextResponse.json(result.data, { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
