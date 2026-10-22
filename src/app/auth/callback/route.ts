import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await (await serverClient()).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(request.nextUrl.searchParams.get('portal') === '1' ? '/portal' : '/', request.url)
      );
  }
  return NextResponse.redirect(
    new URL(
      '/login?confirmation=failed' + (request.nextUrl.searchParams.get('portal') === '1' ? '&portal=1' : ''),
      request.url
    )
  );
}
