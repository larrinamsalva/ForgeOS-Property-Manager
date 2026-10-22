import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { configured } from './lib/supabase/config';
import { contentSecurityPolicy } from './lib/content-security';
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', policy);
  const next = () => {
    const result = NextResponse.next({ request: { headers: request.headers } });
    result.headers.set('Content-Security-Policy', policy);
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
  let response = next();
  if (!configured() || request.nextUrl.pathname === '/demo') return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          const retained = response.cookies.getAll();
          response = next();
          retained.forEach((cookie) => response.cookies.set(cookie));
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  await supabase.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|tablet/|tablet-icon/|manifest.webmanifest).*)',
  ],
};
