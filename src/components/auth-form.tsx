'use client';
import { useActionState, useState } from 'react';
import { authenticate } from '@/lib/auth-actions';
import { useHydrated } from '@/lib/use-hydrated';
export function AuthForm() {
  const [signup, setSignup] = useState(false);
  const [state, action, pending] = useActionState(authenticate, { message: '', intent: '' });
  const hydrated = useHydrated();
  const intent = signup ? 'signup' : 'signin';
  return (
    <>
      <div className="auth-tabs">
        <button
          className={!signup ? 'selected' : ''}
          onClick={() => setSignup(false)}
          disabled={!hydrated || pending}
          type="button"
        >
          Sign in
        </button>
        <button
          className={signup ? 'selected' : ''}
          onClick={() => setSignup(true)}
          disabled={!hydrated || pending}
          type="button"
        >
          Create account
        </button>
      </div>
      <form action={action}>
        <input type="hidden" name="intent" value={intent} />
        <fieldset className="auth-fields" disabled={pending || !hydrated}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              minLength={signup ? 12 : 1}
              required
            />
          </div>
          {signup && (
            <p className="muted">
              Use at least 12 characters. Your account starts with an empty, private workspace.
            </p>
          )}
          {state.message && state.intent === intent && (
            <p className="alert" role="status">
              {state.message}
            </p>
          )}
          <button type="submit" className="button primary full">
            {pending ? 'Please wait…' : signup ? 'Create account' : 'Sign in to ForgeOS'}
          </button>
        </fieldset>
      </form>
    </>
  );
}
