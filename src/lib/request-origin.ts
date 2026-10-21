import type { NextRequest } from 'next/server';
export function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? request.url).origin;
    return request.headers.get('origin') === origin;
  } catch {
    return false;
  }
}
