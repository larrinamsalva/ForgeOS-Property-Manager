import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  const { error } = await (await serverClient()).auth.signOut();
  return NextResponse.json(error ? { error: 'Sign-out could not be completed.' } : { ok: true }, {
    status: error ? 503 : 200,
  });
}
