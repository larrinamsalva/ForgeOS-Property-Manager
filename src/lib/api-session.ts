import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { serverClient } from './supabase/server';
import { BodyError } from './request-body';
import { commercialError } from './commercial-validation';
export const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function apiSession() {
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new BodyError('Sign in before continuing.', 401);
  return { client, user };
}
export function apiFailure(error: unknown) {
  if (error instanceof BodyError)
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: 'Check the request fields, dates and allowed values.' },
      { status: 400, headers: noStore }
    );
  return NextResponse.json(
    { error: 'The service is unavailable. Check the connection and migrations, then retry.' },
    { status: 503, headers: noStore }
  );
}
export function rpcFailure(error: { code: string; message: string }) {
  const mapped = commercialError(error.code, error.message);
  return NextResponse.json({ error: mapped.error }, { status: mapped.status, headers: noStore });
}
