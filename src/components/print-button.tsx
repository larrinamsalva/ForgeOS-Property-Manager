'use client';
export function PrintButton() {
  return (
    <button className="button primary print-hidden" onClick={() => window.print()}>
      Print statement
    </button>
  );
}
