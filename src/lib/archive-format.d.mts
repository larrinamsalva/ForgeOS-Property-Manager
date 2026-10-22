export const archiveLimit: number;
export function canonical(value: unknown, depth?: number): string;
export interface AccountArchive {
  manifest: Record<string, unknown>;
  payload: Record<string, unknown>;
  checksum_sha256: string;
}
export function createArchive(snapshot: unknown): {
  archive: AccountArchive;
  content: string;
  checksum_sha256: string;
};
export function verifyArchive(
  archive: unknown,
  expectedHash?: string
): {
  organization_id: string;
  export_id: string;
  tables: number;
  rows: number;
  storage_objects: number;
  checksum_sha256: string;
  provenance_checked: boolean;
};
