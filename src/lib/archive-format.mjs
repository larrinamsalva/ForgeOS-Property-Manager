import { createHash, timingSafeEqual } from 'node:crypto';
import registry from './account-export-registry.json' with { type: 'json' };
import migrations from './archive-migrations.json' with { type: 'json' };
export const archiveLimit = 20971520;
export function canonical(value, depth = 0) {
  if (depth > 64) throw new Error('Archive nesting exceeds the supported limit.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => canonical(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k], depth + 1))
        .join(',') +
      '}'
    );
  throw new Error('Archive contains a value outside JSON.');
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');
export function createArchive(snapshot) {
  const {
    organization_id,
    export_id,
    generated_at,
    actor_id,
    required_migrations,
    tables,
    table_counts,
    storage_manifest,
  } = snapshot;
  const manifest = {
    format: 'forgeos.account-archive',
    version: 1,
    organization_id,
    export_id,
    generated_at,
    actor_id,
    required_migrations,
    table_counts,
    storage_objects: String(storage_manifest.length),
    includes_storage_bytes: false,
  };
  const payload = { tables, storage_manifest },
    checksum_sha256 = hash({ manifest, payload }),
    archive = { manifest, payload, checksum_sha256 };
  verifyArchive(archive, checksum_sha256);
  const content = JSON.stringify(archive, null, 2) + '\n';
  if (Buffer.byteLength(content) > archiveLimit) throw new Error('account_export_too_large');
  return { archive, content, checksum_sha256 };
}
export function verifyArchive(archive, expectedHash) {
  if (!archive || Object.keys(archive).sort().join(',') !== 'checksum_sha256,manifest,payload')
    throw new Error('Invalid archive envelope.');
  const { manifest: m, payload: p, checksum_sha256: checksum } = archive;
  if (m?.format !== 'forgeos.account-archive' || m.version !== 1 || m.includes_storage_bytes !== false)
    throw new Error('Unsupported archive format.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    ![m.organization_id, m.export_id, m.actor_id].every((v) => typeof v === 'string' && uuid.test(v)) ||
    !Number.isFinite(Date.parse(m.generated_at))
  )
    throw new Error('Invalid archive identity.');
  if (
    !/^[a-f0-9]{64}$/.test(checksum) ||
    !timingSafeEqual(Buffer.from(hash({ manifest: m, payload: p }), 'hex'), Buffer.from(checksum, 'hex'))
  )
    throw new Error('Checksum mismatch.');
  if (expectedHash && (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== checksum))
    throw new Error('Retained audit checksum does not match.');
  if (JSON.stringify(m.required_migrations) !== JSON.stringify(migrations))
    throw new Error('Required migration registry is invalid.');
  if (
    !p?.tables ||
    Object.keys(p.tables).sort().join(',') !== registry.join(',') ||
    Object.keys(m.table_counts ?? {})
      .sort()
      .join(',') !== registry.join(',')
  )
    throw new Error('Business table registry is incomplete.');
  let count = 0;
  for (const name of registry) {
    const rows = p.tables[name];
    if (!Array.isArray(rows) || rows.length > 20000 || m.table_counts[name] !== String(rows.length))
      throw new Error('Invalid table count: ' + name);
    count += rows.length;
    for (const row of rows)
      if (
        !row ||
        typeof row !== 'object' ||
        (name === 'organizations' ? row.id : row.organization_id) !== m.organization_id
      )
        throw new Error('Organization scope mismatch: ' + name);
  }
  if (count > 100000 || p.tables.organizations.length !== 1) throw new Error('Invalid account row limits.');
  const properties = new Set(p.tables.properties.map((r) => r.id));
  for (const rows of Object.values(p.tables))
    for (const row of rows)
      if (row.property_id && !properties.has(row.property_id)) throw new Error('Property scope mismatch.');
  if (!Array.isArray(p.storage_manifest) || m.storage_objects !== String(p.storage_manifest.length))
    throw new Error('Invalid Storage manifest count.');
  for (const object of p.storage_manifest)
    if (
      !['meter-photos', 'work-photos'].includes(object.bucket) ||
      object.organization_id !== m.organization_id ||
      !properties.has(object.property_id) ||
      typeof object.object_path !== 'string' ||
      !object.object_path.startsWith(m.organization_id + '/' + object.property_id + '/') ||
      object.object_path.includes('..') ||
      !/^[a-f0-9]{64}$/.test(object.sha256) ||
      !Number.isSafeInteger(object.byte_size) ||
      object.byte_size < 1 ||
      object.byte_size > 5242880 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(object.mime) ||
      !['pending', 'uploaded', 'voided'].includes(object.status)
    )
      throw new Error('Invalid scoped Storage object.');
  return {
    organization_id: m.organization_id,
    export_id: m.export_id,
    tables: registry.length,
    rows: count,
    storage_objects: p.storage_manifest.length,
    checksum_sha256: checksum,
    provenance_checked: !!expectedHash,
  };
}
