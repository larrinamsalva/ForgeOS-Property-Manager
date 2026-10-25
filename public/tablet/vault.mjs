// Local records are encrypted with a device passphrase. Authentication cookies/tokens
// never enter IndexedDB. The server reauthorizes every sync operation.
export const DB_NAME = 'forgeos-meter-v1';
const encoder = new TextEncoder();
export function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 16384)
    result += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(result);
}
export function unbase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('vaults', { keyPath: 'scope' });
      const records = db.createObjectStore('records', { keyPath: 'id' });
      records.createIndex('stopKey', 'stopKey', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other ForgeOS tabs and try local storage again.'));
  });
}
async function transaction(store, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    try {
      result = callback(tx.objectStore(store));
    } catch (e) {
      db.close();
      reject(e);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result?.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Local storage failed.'));
    };
  });
}
export const listVaults = () => transaction('vaults', 'readonly', (s) => s.getAll());
export const rawRecords = () => transaction('records', 'readonly', (s) => s.getAll());
async function derive(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unbase64(salt), iterations: 600000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function seal(key, id, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(id) },
    key,
    data
  );
  return { iv: base64(iv), data: base64(new Uint8Array(cipher)) };
}
async function unseal(key, id, cipher) {
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unbase64(cipher.iv), additionalData: encoder.encode(id) },
    key,
    unbase64(cipher.data)
  );
  return JSON.parse(new TextDecoder().decode(clear));
}
export async function createVault(userId, organizationId, passphrase) {
  if (passphrase.length < 10)
    throw new Error('Use a device passphrase with at least 10 characters. Keep it for recovery.');
  const scope = `${organizationId}:${userId}`;
  const salt = base64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derive(passphrase, salt);
  const meta = { scope, userId, organizationId, salt, deviceId: crypto.randomUUID(), version: 1 };
  meta.check = await seal(key, scope, { check: 'ForgeOS meter vault v1' });
  await transaction('vaults', 'readwrite', (s) => s.add(meta));
  return { meta, key };
}
export async function unlockVault(meta, passphrase) {
  try {
    const key = await derive(passphrase, meta.salt);
    const clear = await unseal(key, meta.scope, meta.check);
    if (clear.check !== 'ForgeOS meter vault v1') throw new Error();
    return { meta, key };
  } catch {
    throw new Error('Device passphrase did not unlock this queue. Saved records are unchanged.');
  }
}
export async function readVault(vault) {
  const records = (await rawRecords()).filter((r) => r.scope === vault.meta.scope);
  const decoded = await Promise.all(
    records.map(async (r) => ({ record: r, value: await unseal(vault.key, r.id, r.cipher) }))
  );
  return {
    snapshot: decoded.find((r) => r.record.kind === 'snapshot')?.value ?? null,
    draft: decoded.find((r) => r.record.kind === 'draft')?.value ?? null,
    operations: decoded.filter((r) => r.record.kind === 'operation').map((r) => r.value),
  };
}
async function writeVaultRecord(vault, record, isNew = false) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['vaults', 'records'], 'readwrite');
    let failure;
    const check = tx.objectStore('vaults').get(vault.meta.scope);
    check.onsuccess = () => {
      try {
        if (!check.result || check.result.salt !== vault.meta.salt)
          throw new Error(
            'This device queue was removed or replaced in another tab. Your form is unchanged; reopen the reader.'
          );
        const records = tx.objectStore('records');
        if (isNew) records.add(record);
        else records.put(record);
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(failure || tx.error);
    };
  });
}
export async function saveSnapshot(vault, snapshot) {
  if (snapshot.userId !== vault.meta.userId || snapshot.organizationId !== vault.meta.organizationId)
    throw new Error('Account mismatch. The existing offline queue is preserved.');
  const id = `${vault.meta.scope}:snapshot`;
  const record = {
    id,
    scope: vault.meta.scope,
    kind: 'snapshot',
    pending: false,
    cipher: await seal(vault.key, id, snapshot),
  };
  await writeVaultRecord(vault, record);
}
export async function saveOperation(vault, operation, isNew = false) {
  const id = `${vault.meta.scope}:${operation.payload.id}`;
  const record = {
    id,
    scope: vault.meta.scope,
    kind: 'operation',
    stopKey: `${vault.meta.scope}:${operation.payload.route_item_id}`,
    pending: operation.state !== 'synced' && operation.state !== 'resolved',
    cipher: await seal(vault.key, id, operation),
  };
  await writeVaultRecord(vault, record, isNew);
}
export async function exportVault(vault) {
  return {
    format: 'ForgeOS encrypted meter recovery',
    version: 1,
    vault: vault.meta,
    records: (await rawRecords()).filter((r) => r.scope === vault.meta.scope),
  };
}
// Reject corrupted or cross-account recovery metadata before IndexedDB writes.
// Check duplicate IDs/route stops to avoid partially importing an unsyncable queue.
export function validateRecoveryBundle(bundle) {
  if (
    bundle?.format !== 'ForgeOS encrypted meter recovery' ||
    bundle.version !== 1 ||
    typeof bundle.vault?.scope !== 'string' ||
    !bundle.vault.scope ||
    !Array.isArray(bundle.records)
  ) throw new Error('Choose a ForgeOS encrypted recovery file.');
  const ids = new Set(), stops = new Set();
  for (const r of bundle.records) {
    if (r?.scope !== bundle.vault.scope ||
      typeof r.id !== 'string' ||
      !r.id.startsWith(`${bundle.vault.scope}:`) ||
      typeof r.cipher?.data !== 'string' || !r.cipher.data ||
      typeof r.cipher?.iv !== 'string' || !r.cipher.iv ||
      !['snapshot', 'operation', 'draft'].includes(r.kind) ||
      typeof r.pending !== 'boolean' || ids.has(r.id))
      throw new Error('Recovery file is invalid.');
    ids.add(r.id);
    if (r.kind === 'operation') {
      if (typeof r.stopKey !== 'string' || !r.stopKey.startsWith(`${bundle.vault.scope}:`) ||
        stops.has(r.stopKey)) throw new Error('Recovery file is invalid.');
      stops.add(r.stopKey);
    }
  }
  return true;
}
export async function importVault(bundle) {
  validateRecoveryBundle(bundle);
  const existing = (await listVaults()).find((v) => v.scope === bundle.vault.scope);
  if (existing)
    throw new Error(
      'This queue already exists on this browser. Unlock the existing queue; import never overwrites local records.'
    );
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['vaults', 'records'], 'readwrite');
    tx.objectStore('vaults').add(bundle.vault);
    for (const record of bundle.records) tx.objectStore('records').add(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function forgetVault(vault) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['vaults', 'records'], 'readwrite');
    let failure;
    const read = tx.objectStore('records').getAll();
    read.onsuccess = () => {
      const records = read.result.filter((r) => r.scope === vault.meta.scope);
      if (records.some((r) => r.pending)) {
        failure = new Error('Sync or explicitly reconcile all entries before removing this queue.');
        tx.abort();
        return;
      }
      for (const r of records) tx.objectStore('records').delete(r.id);
      tx.objectStore('vaults').delete(vault.meta.scope);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(failure || tx.error);
    };
  });
}
// Preserve an unfinished form before an automatic privacy lock. It is not a reading.
export async function saveDraft(vault, draft) {
  const id = `${vault.meta.scope}:draft`;
  if (draft === null) {
    await transaction('records', 'readwrite', (s) => s.delete(id));
    return;
  }
  const cipher = await seal(vault.key, id, draft);
  await writeVaultRecord(vault, { id, scope: vault.meta.scope, kind: 'draft', pending: true, cipher });
}
