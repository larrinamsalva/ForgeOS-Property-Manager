export function contentSecurityPolicy(nonce: string, development: boolean, supabaseUrl?: string) {
  let origin = '';
  try {
    const url = new URL(supabaseUrl ?? '');
    if (['https:', 'http:'].includes(url.protocol)) origin = url.origin;
  } catch {}
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + (development ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:" + (origin ? ' ' + origin : ''),
    "font-src 'self'",
    "connect-src 'self'" +
      (origin ? ' ' + origin : '') +
      (development ? ' ws://localhost:* ws://127.0.0.1:*' : ''),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
