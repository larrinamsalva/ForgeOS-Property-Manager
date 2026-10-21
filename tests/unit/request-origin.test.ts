import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sameOrigin } from '../../src/lib/request-origin';
afterEach(() => vi.unstubAllEnvs());
describe('Mutation request origin', () => {
  it('uses the configured public origin when an internal proxy origin differs', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://forgeos.example');
    expect(
      sameOrigin(
        new NextRequest('http://internal:3000/api/records', {
          headers: { origin: 'https://forgeos.example' },
        })
      )
    ).toBe(true);
  });
  it('rejects foreign or absent origins even with a valid session transport', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://forgeos.example');
    expect(
      sameOrigin(
        new NextRequest('http://internal:3000/api/records', {
          headers: { origin: 'https://untrusted.example' },
        })
      )
    ).toBe(false);
    expect(sameOrigin(new NextRequest('http://internal:3000/api/records'))).toBe(false);
  });
  it('uses the request origin for local setup when no public origin is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined);
    expect(
      sameOrigin(
        new NextRequest('http://localhost:3000/api/records', { headers: { origin: 'http://localhost:3000' } })
      )
    ).toBe(true);
  });
});
