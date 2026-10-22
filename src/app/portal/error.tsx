'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="portal-shell">
      <h1>Resident portal unavailable</h1>
      <p>Please check the connection and try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
