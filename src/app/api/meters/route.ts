import { readJson, BodyError } from '@/lib/request-body';
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { captureSchema, meterCommandSchema, meterError } from '@/lib/meter-domain';
import { loadMeterSnapshot } from '@/lib/meter-data';
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
      return NextResponse.json({ error: 'Sign in before downloading or syncing routes.' }, { status: 401 });
    const { data: membership, error: memberError } = await client
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', org)
      .eq('user_id', user.id)
      .single();
    if (memberError || !membership)
      return NextResponse.json({ error: 'Organization access is unavailable.' }, { status: 403 });
    return NextResponse.json(
      await loadMeterSnapshot(client, user.id, org, request.nextUrl.searchParams.get('reader') === '1'),
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      {
        error:
          e instanceof ZodError
            ? 'Choose a valid organization.'
            : 'Meter records could not be loaded. Check the connection and migrations.',
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
      return NextResponse.json(
        { error: 'Session expired. Sign in again; the queue is preserved.' },
        { status: 401 }
      );
    const input = z
      .object({ command: z.string(), payload: z.unknown() })
      .strict()
      .parse(await readJson(request));
    const result =
      input.command === 'capture'
        ? await client.rpc('submit_meter_reading', { payload: captureSchema.parse(input.payload) })
        : await client.rpc('meter_command', meterCommandSchema.parse(input));
    if (result.error) {
      const mapped = meterError(result.error.code, result.error.message);
      let conflictId: string | undefined;
      if (
        input.command === 'capture' &&
        [
          'assignment_conflict',
          'baseline_conflict',
          'capture_conflict',
          'capture_window',
          'capture_order',
          'lower_reading',
          'register_overflow',
        ].includes(result.error.message)
      ) {
        const reported = await client.rpc('report_meter_conflict', {
          payload: captureSchema.parse(input.payload),
          reason_code: result.error.message,
        });
        if (!reported.error) conflictId = reported.data;
      }
      return NextResponse.json({ error: mapped.error, conflictId }, { status: mapped.status });
    }
    return NextResponse.json({ id: result.data });
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      {
        error:
          e instanceof ZodError
            ? 'Check the required fields, dates and decimal values.'
            : e instanceof SyntaxError
              ? 'Request is invalid.'
              : 'Meter service unavailable. Preserve the queue and retry.',
      },
      { status: e instanceof ZodError || e instanceof SyntaxError ? 400 : 503 }
    );
  }
}
