import { Flame, Database, ShieldCheck } from 'lucide-react';
import { ThemeButton } from '@/components/theme-button';
export default function Setup() {
  return (
    <main className="setup-page">
      <header>
        <div className="brand">
          <span className="brand-mark">
            <Flame />
          </span>
          <span>
            ForgeOS<small>PROPERTY MANAGER</small>
          </span>
        </div>
        <ThemeButton />
      </header>
      <div className="setup-content">
        <span className="eyebrow">Milestone 1 · Foundation</span>
        <h1>
          A solid home for
          <br />
          your entire operation.
        </h1>
        <p className="setup-lead">
          ForgeOS is ready for its dedicated database connection. Connect your project to start creating
          properties, sites, customers, and occupancy records.
        </p>
        <div className="setup-card">
          <Database size={28} />
          <div>
            <h2>Connect the ForgeOS database</h2>
            <p>This installation has no configured live workspace. No customer records are loaded.</p>
            <ol>
              <li>Use a dedicated Supabase project for ForgeOS.</li>
              <li>
                Apply the foundation migration in <code>supabase/migrations</code>.
              </li>
              <li>
                Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> from that project.
              </li>
              <li>Configure the sign-in redirect URL, restart the app, then create your owner account.</li>
            </ol>
            <p className="muted">
              Complete instructions are in the repository README. The app does not need a service-role key.
            </p>
            <p className="alert">
              Waiting for a database connection. Sign-in becomes available when setup is complete.
            </p>
          </div>
        </div>
        <p className="privacy-note">
          <ShieldCheck size={19} />
          Your records stay scoped to your organization and authorized properties.
        </p>
      </div>
    </main>
  );
}
