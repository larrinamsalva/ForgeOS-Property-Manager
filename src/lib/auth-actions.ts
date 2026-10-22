'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { configured } from './supabase/config';
import { serverClient } from './supabase/server';
export interface AuthState {
  message: string;
  intent: string;
}
export async function authenticate(_state: AuthState, form: FormData): Promise<AuthState> {
  const intent = form.get('intent') === 'signup' ? 'signup' : 'signin';
  const destination = form.get('destination') === '/portal' ? '/portal' : '/';
  const failure = (message: string) => ({ message, intent });
  if (!configured()) return failure('Connect the ForgeOS database first.');
  const input = z
    .object({
      email: z.email().max(254),
      password: z
        .string()
        .min(intent === 'signup' ? 12 : 1)
        .max(256),
    })
    .safeParse({ email: form.get('email'), password: form.get('password') });
  if (!input.success)
    return failure('Enter a valid email and password. New passwords need at least 12 characters.');
  try {
    const client = await serverClient();
    const result =
      intent === 'signup'
        ? await client.auth.signUp({
            ...input.data,
            options: {
              emailRedirectTo: new URL(
                '/auth/callback' + (destination === '/portal' ? '?portal=1' : ''),
                process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
              ).href,
            },
          })
        : await client.auth.signInWithPassword(input.data);
    if (result.error)
      return failure(
        intent === 'signup'
          ? 'Could not create the account. Check your details and try again.'
          : 'Sign-in failed. Check your email and password.'
      );
    if (intent === 'signup' && !result.data.session)
      return failure('Check your email to confirm your account, then sign in.');
  } catch {
    return failure('The sign-in service is unavailable. Please try again.');
  }
  redirect(destination);
}
