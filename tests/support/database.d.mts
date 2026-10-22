import type { PGlite, Transaction } from '@electric-sql/pglite';
export const identities: Record<
  'owner' | 'other' | 'office' | 'technician' | 'manager' | 'maintenance' | 'resident' | 'resident2',
  string
>;
export function database(): Promise<PGlite>;
export function asUser<T>(db: PGlite, id: string, fn: (tx: Transaction) => Promise<T>): Promise<T>;
export function foundation(db: PGlite, user?: string): Promise<{ org: string; property: string }>;
