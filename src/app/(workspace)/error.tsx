'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="eyebrow">ForgeOS</span>
      <h1>We couldn’t load your workspace.</h1>
      <p>Your records have not been changed. Check the connection and database setup, then try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
