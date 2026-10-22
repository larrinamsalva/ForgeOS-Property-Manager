import { readJson, BodyError } from '@/lib/request-body';
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { billingCommandSchema, billingError } from '@/lib/billing-validation';
import { loadBillingSnapshot } from '@/lib/billing-data';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const org = z.uuid().parse(request.nextUrl.searchParams.get('organization'));
    const client = await serverClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return NextResponse.json({ error: 'Sign in before opening billing.' }, { status: 401 });
    const { data: member } = await client
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', org)
      .eq('user_id', user.id)
      .single();
    if (!member) return NextResponse.json({ error: 'Organization access is unavailable.' }, { status: 403 });
    return NextResponse.json(await loadBillingSnapshot(client, org), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      {
        error:
          e instanceof ZodError
            ? 'Choose a valid organization.'
            : 'Billing records could not be loaded. Check the connection and migrations.',
      },
      { status: e instanceof ZodError ? 400 : 503 }
    );
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return NextResponse.json({ error: 'Use a JSON request.' }, { status: 415 });
  try {
    const client = await serverClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return NextResponse.json({ error: 'Session expired. Sign in before retrying.' }, { status: 401 });
    const input = billingCommandSchema.parse(await readJson(request));
    const result = await client.rpc('billing_command', input);
    if (result.error) {
      const mapped = billingError(result.error.code, result.error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ id: result.data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      {
        error:
          e instanceof ZodError
            ? 'Check required fields, dates and decimal values.'
            : e instanceof SyntaxError
              ? 'Request is invalid.'
              : 'Billing service unavailable. Retry when the connection is restored.',
      },
      { status: e instanceof ZodError || e instanceof SyntaxError ? 400 : 503 }
    );
  }
}
