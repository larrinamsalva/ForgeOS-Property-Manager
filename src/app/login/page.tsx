import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Flame, ShieldCheck } from 'lucide-react';
import { AuthForm } from '@/components/auth-form';
import { ThemeButton } from '@/components/theme-button';
import { configured } from '@/lib/supabase/config';
import { serverClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const portal = (await searchParams).portal === '1';
  if (!configured()) redirect('/setup');
  const {
    data: { user },
  } = await (await serverClient()).auth.getUser();
  if (user) redirect(portal ? '/portal' : '/');
  return (
    <main className="auth-page">
      <div className="auth-art">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Flame />
          </span>
          <span>
            Forge<span className="brand-os">OS</span>
            <small>PROPERTY MANAGER</small>
          </span>
        </Link>
        <div>
          <span className="eyebrow">Built for independent owners</span>
          <h1>
            Every property.
            <br />
            One clear view.
          </h1>
          <p>
            From the first site to the last move-out. Keep your property, your people, and your records
            together.
          </p>
          <div className="auth-promise">
            <ShieldCheck size={22} />
            Organization and property permissions protect your workspace.
          </div>
        </div>
        <span className="auth-tagline">One System. Every Site. Total Control.</span>
      </div>
      <div className="auth-form-panel">
        <div className="auth-theme">
          <ThemeButton />
        </div>
        <div className="auth-card">
          <span className="eyebrow">Welcome to ForgeOS</span>
          <h2>{portal ? 'Your resident account.' : 'Your operation starts here.'}</h2>
          <p className="muted">
            {portal
              ? 'Sign in to view records shared by your property.'
              : 'Sign in to your property workspace.'}
          </p>
          <AuthForm portal={portal} />
          <Link href={portal ? '/login' : '/login?portal=1'}>
            {portal ? 'Staff sign in' : 'Resident sign in'}
          </Link>
        </div>
        <p className="auth-footnote">ForgeOS Property Manager</p>
      </div>
    </main>
  );
}
