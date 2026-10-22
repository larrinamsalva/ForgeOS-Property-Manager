import { readFile, stat } from 'node:fs/promises';
import { archiveLimit, verifyArchive } from '../src/lib/archive-format.mjs';
const args = process.argv.slice(2),
  path = args[0];
try {
  if (!path || (args.length !== 1 && !(args.length === 3 && args[1] === '--expected-sha256')))
    throw new Error('Usage: node scripts/verify-export.mjs FILE [--expected-sha256 RETAINED_AUDIT_HASH]');
  if ((await stat(path)).size > archiveLimit) throw new Error('Archive exceeds 20 MB.');
  const result = verifyArchive(JSON.parse(await readFile(path, 'utf8')), args[2]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(
    'Business data and manifest verified. Storage bytes and full database recovery require the recovery runbook.\n'
  );
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : 'Invalid archive') + '\n');
  process.exitCode = 1;
}
