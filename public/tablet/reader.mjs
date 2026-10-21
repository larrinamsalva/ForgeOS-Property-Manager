import {
  listVaults,
  createVault,
  unlockVault,
  readVault,
  saveSnapshot,
  saveOperation,
  exportVault,
  importVault,
  forgetVault,
  saveDraft,
  base64,
  unbase64,
} from './vault.mjs';
const $ = (id) => document.getElementById(id);
let vault = null,
  snapshot = null,
  operations = [],
  routeId = '',
  index = 0,
  photo = null,
  busy = false,
  dirty = false,
  lastActivity = Date.now(),
  lockTimer,
  savedDraft = null;
const orgQuery = new URL(location.href).searchParams.get('organization') || '';
function element(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function message(text, error = false) {
  $('message').hidden = !text;
  $('message').textContent = text;
  $('message').className = `message${error ? ' error' : ''}`;
}
function currentItems() {
  return (snapshot?.items ?? [])
    .filter((i) => i.route_id === routeId)
    .sort((a, b) => a.position - b.position);
}
function current() {
  const items = currentItems();
  const item = items[index];
  const assignment = snapshot?.assignments.find((a) => a.id === item?.assignment_id);
  const meter = snapshot?.meters.find((m) => m.id === assignment?.meter_id);
  const route = snapshot?.routes.find((r) => r.id === routeId);
  return { items, item, assignment, meter, route };
}
function review(id) {
  return snapshot.reviews
    .filter((r) => r.reading_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
function last(assignment) {
  return snapshot.readings
    .filter((r) => r.assignment_id === assignment)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
function operationFor(item) {
  return operations.find((o) => o.payload.route_item_id === item);
}
function collected(item) {
  return operationFor(item) || snapshot?.readings.find((r) => r.route_item_id === item);
}
function pending() {
  return operations.filter((o) => !['synced', 'resolved'].includes(o.state));
}
function stale() {
  return !snapshot || Date.now() - Date.parse(snapshot.downloadedAt) > 7 * 86400000;
}
function setConnection() {
  $('connection').textContent = navigator.onLine ? 'Online' : 'Offline · saving on device';
  $('connection').className = navigator.onLine ? '' : 'offline';
}
async function run(fn) {
  if (busy) return;
  busy = true;
  renderDisabled();
  try {
    await fn();
  } catch (e) {
    message(
      e?.name === 'QuotaExceededError'
        ? 'Device storage is full. This reading was not saved. Keep this screen open, export the existing queue and free storage before retrying.'
        : e.message || 'The operation failed. Saved records remain on this device.',
      true
    );
  } finally {
    busy = false;
    renderDisabled();
  }
}
function renderDisabled() {
  for (const el of document.querySelectorAll('button,select,input,textarea')) el.disabled = busy;
  if (vault) {
    const { item } = current();
    $('capture-fields').disabled = busy || !item || !!collected(item.id) || stale();
    $('previous').disabled = busy || index === 0;
    $('next').disabled = busy || index >= currentItems().length - 1;
    $('sync').disabled = busy || !navigator.onLine || pending().length === 0;
  }
}
async function refreshVaultList() {
  const metas = await listVaults();
  $('vault-choice').replaceChildren(element('option', 'New queue from signed-in account'));
  $('vault-choice').firstChild.value = '';
  for (const meta of metas) {
    const option = element(
      'option',
      `Account ${meta.userId.slice(0, 8)} · organization ${meta.organizationId.slice(0, 8)}`
    );
    option.value = meta.scope;
    $('vault-choice').append(option);
  }
  const preferred = metas.find((m) => !orgQuery || m.organizationId === orgQuery);
  if (preferred) $('vault-choice').value = preferred.scope;
}
async function fetchSnapshot(org) {
  if (!navigator.onLine)
    throw new Error(
      'Connect to the internet to prepare or refresh routes. Existing queues can be unlocked offline.'
    );
  const response = await fetch(`/api/meters?organization=${encodeURIComponent(org)}&reader=1`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error);
  return json;
}
async function loadLocal() {
  const saved = await readVault(vault);
  snapshot = saved.snapshot;
  savedDraft = saved.draft;
  operations = saved.operations.sort((a, b) => a.payload.captured_at.localeCompare(b.payload.captured_at));
}
async function prepare(event) {
  event.preventDefault();
  await run(async () => {
    const passphrase = $('passphrase').value;
    const scope = $('vault-choice').value;
    let nextVault;
    if (scope) {
      const meta = (await listVaults()).find((m) => m.scope === scope);
      if (!meta) throw new Error('Saved queue could not be found.');
      nextVault = await unlockVault(meta, passphrase);
      if (navigator.onLine) {
        const server = await fetchSnapshot(meta.organizationId);
        if (server.userId !== meta.userId)
          throw new Error(
            'The signed-in account differs from this queue. Sign in with the original account. Saved records are preserved.'
          );
        await saveSnapshot(nextVault, server);
      }
    } else {
      if (!orgQuery)
        throw new Error('Open the reader from Meters & reader in your workspace to choose an organization.');
      const server = await fetchSnapshot(orgQuery);
      if (!server.routes.length)
        throw new Error('No open routes are assigned to this account. Ask a supervisor to assign a route.');
      const existing = (await listVaults()).find(
        (m) => m.userId === server.userId && m.organizationId === server.organizationId
      );
      nextVault = existing
        ? await unlockVault(existing, passphrase)
        : await createVault(server.userId, server.organizationId, passphrase);
      await saveSnapshot(nextVault, server);
    }
    vault = nextVault;
    await loadLocal();
    if (!snapshot) {
      const server = await fetchSnapshot(vault.meta.organizationId);
      await saveSnapshot(vault, server);
      await loadLocal();
    }
    $('passphrase').value = '';
    routeId = snapshot.routes[0]?.id ?? '';
    index = 0;
    $('setup').hidden = true;
    $('reader').hidden = false;
    $('lock').hidden = false;
    lastActivity = Date.now();
    render();
    if (savedDraft) {
      const position = snapshot.items.find((i) => i.id === savedDraft.itemId);
      if (position && !collected(position.id)) {
        routeId = position.route_id;
        index = currentItems().findIndex((i) => i.id === position.id);
        render();
        $('register').value = savedDraft.value;
        $('flag').value = savedDraft.flag;
        $('kind').value = savedDraft.kind;
        $('notes').value = savedDraft.notes;
        photo = savedDraft.photo;
        if (photo) {
          $('photo-preview').src = `data:image/jpeg;base64,${photo.data}`;
          $('photo-preview').hidden = false;
          $('photo-description').textContent = 'Unfinished photo restored';
          $('remove-photo').hidden = false;
        }
        dirty = true;
      }
    }
    await storageInfo();
    message(
      stale()
        ? 'Refresh routes online before collecting. Your existing queue is preserved.'
        : savedDraft
          ? 'Unfinished form restored. Save it to add a reading to the route.'
          : `Reader unlocked. ${pending().length} entries or photos await sync.`
    );
  });
}
function render() {
  if (!vault || !snapshot) return;
  const choice = $('route-choice');
  choice.replaceChildren();
  for (const route of snapshot.routes) {
    const opt = element('option', route.label);
    opt.value = route.id;
    choice.append(opt);
  }
  choice.value = routeId;
  const { items, item, assignment, meter, route } = current();
  const done = items.filter((i) => collected(i.id)).length;
  const property = snapshot.properties.find((p) => p.id === route?.property_id);
  $('route-property').textContent = property?.name ?? 'Assigned properties';
  $('route-title').textContent = route?.label ?? 'No open routes assigned';
  $('route-window').textContent = route
    ? `${route.starts_on} → ${route.ends_on} (exclusive) · ${property?.timezone ?? ''} · ${route.cadence}`
    : 'Connect online and ask a supervisor to assign a route.';
  $('progress-text').textContent = `${done} / ${items.length}`;
  $('progress').max = items.length || 1;
  $('progress').value = done;
  $('site-label').textContent = assignment?.site_label ?? '—';
  $('meter-name').textContent = meter?.label ?? 'No assigned meter';
  $('utility-label').textContent = meter?.utility ?? '';
  $('meter-details').textContent = meter
    ? `${meter.serial_number} · ${meter.register_digits} digits · multiplier ${meter.multiplier} · ${meter.location || 'Location not specified'}`
    : '';
  $('unit-label').textContent = meter ? `(${meter.unit})` : '';
  const previous = item ? last(item.assignment_id) : null;
  const validated = snapshot.readings
    .filter((r) => r.assignment_id === item?.assignment_id && review(r.id)?.decision === 'accepted')
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
  $('last-value').textContent = previous?.value ?? 'First reading';
  $('validated-value').textContent = validated
    ? (review(validated.id)?.corrected_value ?? validated.value)
    : 'None yet';
  $('kind').querySelector('option[value=estimated]').hidden = !(snapshot.supervisorProperties ?? []).includes(
    route?.property_id
  );
  if (!(snapshot.supervisorProperties ?? []).includes(route?.property_id)) $('kind').value = 'actual';
  const saved = item ? operationFor(item.id) : null;
  const submitted = item ? snapshot.readings.find((r) => r.route_item_id === item.id) : null;
  $('stop-state').textContent = saved
    ? `Saved on device · ${saved.state.replaceAll('_', ' ')} · ${saved.payload.value ?? saved.payload.flag}`
    : submitted
      ? `Submitted · ${submitted.value ?? submitted.flag} · supervisor review pending`
      : stale()
        ? 'Routes are more than 7 days old. Refresh online before collecting.'
        : 'Ready for a new observation';
  renderStops();
  renderQueue();
  renderDisabled();
}
function renderStops() {
  const query = $('stop-search').value.toLowerCase();
  const nav = $('stops');
  nav.replaceChildren();
  currentItems().forEach((item, position) => {
    const a = snapshot.assignments.find((a) => a.id === item.assignment_id);
    const m = snapshot.meters.find((m) => m.id === a?.meter_id);
    if (!`${a?.site_label} ${m?.label} ${m?.serial_number}`.toLowerCase().includes(query)) return;
    const button = element(
      'button',
      `${position + 1}. ${a?.site_label ?? 'Site'}`,
      `stop-button${position === index ? ' active' : ''}${collected(item.id) ? ' done' : ''}`
    );
    button.type = 'button';
    button.setAttribute('aria-current', position === index ? 'step' : 'false');
    button.append(element('small', `${m?.label ?? 'Meter'} · ${m?.utility ?? ''}`));
    button.addEventListener('click', () => navigate(position));
    nav.append(button);
  });
}
function renderQueue() {
  const count = pending().length;
  $('queue-count').textContent = String(count);
  const history = $('queue-history');
  history.replaceChildren();
  if (!operations.length) {
    history.append(element('p', 'No readings saved on this device yet.', 'muted'));
    return;
  }
  for (const operation of [...operations].reverse()) {
    const row = element('article', undefined, 'queue-item');
    row.append(
      element('span', operation.state.replaceAll('_', ' '), 'state'),
      element('strong', ` · ${operation.siteLabel} · ${operation.meterLabel}`),
      element(
        'p',
        `${new Date(operation.payload.captured_at).toLocaleString()} · register ${operation.payload.value ?? operation.payload.flag} · ${operation.payload.photo ? 'Photo retained' : 'No photo'}`
      )
    );
    if (operation.error) row.append(element('p', operation.error));
    if (operation.receipt) row.append(element('p', `Server receipt: ${operation.receipt}`, 'muted'));
    history.append(row);
  }
}
function clearDraft() {
  if (vault) saveDraft(vault, null).catch((e) => message(e.message, true));
  savedDraft = null;
  dirty = false;
  photo = null;
  $('capture-form').reset();
  $('photo-description').textContent = 'Optional · JPEG, PNG or WebP';
  $('photo-preview').removeAttribute('src');
  $('photo-preview').hidden = true;
  $('remove-photo').hidden = true;
}
function navigate(next) {
  if (busy) return;
  if (dirty && !confirm('This observation has not been saved. Discard the unsaved form and change meters?'))
    return;
  clearDraft();
  index = Math.max(0, Math.min(currentItems().length - 1, next));
  render();
}
function scaled(value) {
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(decimal.padEnd(6, '0'));
}
async function save(event) {
  event.preventDefault();
  await run(async () => {
    if (!vault) throw new Error('Unlock the device queue first.');
    const { item, assignment, meter, route } = current();
    if (!item || collected(item.id))
      throw new Error('This route stop already has an entry. Supervisor corrections retain its history.');
    if (stale()) throw new Error('Refresh routes online before collecting.');
    const value = $('register').value.trim() || null;
    const flag = $('flag').value,
      kind = $('kind').value,
      notes = $('notes').value.trim();
    if (value !== null && !/^\d{1,12}(\.\d{1,6})?$/.test(value))
      throw new Error('Use digits and up to six decimal places.');
    if (value === null && !['missing', 'damaged', 'problem'].includes(flag))
      throw new Error('Enter a register value, or choose missing, damaged or problem.');
    if ((flag !== 'none' || kind === 'estimated') && notes.length < 3)
      throw new Error('Add a reason for the exception or estimate.');
    const previous = last(assignment.id);
    const previousReview = previous ? review(previous.id) : null;
    const numericPrior = snapshot.readings
      .filter(
        (r) =>
          r.assignment_id === assignment.id &&
          (r.value !== null || review(r.id)?.corrected_value != null) &&
          review(r.id)?.decision !== 'rejected'
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    const numericReview = numericPrior ? review(numericPrior.id) : null;
    const comparison =
      numericReview?.decision === 'accepted'
        ? (numericReview.corrected_value ?? numericPrior.value)
        : numericPrior?.value;
    if (value !== null) {
      if (scaled(value) >= 10n ** BigInt(meter.register_digits) * 1000000n)
        throw new Error('The register value exceeds this meter’s configured digits.');
      if (comparison && scaled(value) < scaled(comparison) && !['rollover', 'reset'].includes(flag))
        throw new Error('A lower register needs an explicit rollover or reset flag and a reason.');
    }
    const payload = {
      id: crypto.randomUUID(),
      organization_id: vault.meta.organizationId,
      property_id: route.property_id,
      route_item_id: item.id,
      assignment_id: assignment.id,
      captured_at: new Date().toISOString(),
      device_id: vault.meta.deviceId,
      previous_reading_id: previous?.id ?? null,
      previous_review_id: previousReview?.id ?? null,
      value,
      kind,
      flag,
      notes,
      photo: photo ? { mime: photo.mime, byte_size: photo.byte_size, sha256: photo.sha256 } : null,
    };
    const operation = {
      payload,
      photo: photo?.data ?? null,
      state: 'queued',
      attempts: 0,
      error: '',
      siteLabel: assignment.site_label,
      meterLabel: meter.label,
      history: [{ at: new Date().toISOString(), state: 'queued' }],
    };
    await saveOperation(vault, operation, true);
    operations.push(operation);
    clearDraft();
    index = Math.min(index + 1, currentItems().length - 1);
    render();
    await storageInfo();
    message(`Saved on this device. ${pending().length} entries or photos await sync.`);
  });
}
async function attachPhoto(file) {
  if (!file) return;
  await run(async () => {
    if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Choose JPEG, PNG or WebP. Use the camera’s most compatible format for HEIC photos.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size > 5242880) throw new Error('Photo could not be prepared within the 5 MB limit.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    photo = {
      data: base64(bytes),
      mime: 'image/jpeg',
      byte_size: bytes.length,
      sha256: Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join(''),
    };
    $('photo-description').textContent =
      `Photo ready · ${Math.ceil(bytes.length / 1024)} KB · location metadata removed`;
    $('photo-preview').src = `data:image/jpeg;base64,${photo.data}`;
    $('photo-preview').hidden = false;
    $('remove-photo').hidden = false;
    dirty = true;
  });
}
async function changeOperation(operation, state, error = '', receipt) {
  const next = {
    ...operation,
    state,
    error,
    attempts: operation.attempts + 1,
    history: [...(operation.history ?? []), { at: new Date().toISOString(), state, error }],
    ...(receipt ? { receipt } : {}),
  };
  await saveOperation(vault, next);
  operations = operations.map((o) => (o.payload.id === next.payload.id ? next : o));
  renderQueue();
  return next;
}
async function sync() {
  await run(async () => {
    if (!vault) throw new Error('Unlock your device queue first.');
    const perform = async () => {
      const server = await fetchSnapshot(vault.meta.organizationId);
      if (server.userId !== vault.meta.userId || server.organizationId !== vault.meta.organizationId)
        throw new Error(
          'Signed-in account differs from this queue. Sign in with the original account; the queue is preserved.'
        );
      await loadLocal();
      await saveSnapshot(vault, server);
      snapshot = server;
      for (const op of operations.filter((o) => o.state === 'conflict')) {
        const resolution = server.resolutions.find((r) => r.conflict_id === op.payload.id);
        if (resolution)
          await changeOperation(
            op,
            'resolved',
            `Supervisor ${resolution.decision}: ${resolution.reason}`,
            resolution.id
          );
      }
      for (let operation of [...pending()]) {
        if (operation.state === 'conflict' && operation.conflictId) continue;
        message(`Syncing ${operation.siteLabel} · ${operation.meterLabel}…`);
        let response;
        try {
          response = await fetch('/api/meters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'capture', payload: operation.payload }),
          });
        } catch {
          await changeOperation(operation, 'queued', 'Connection interrupted. Retry when online.');
          break;
        }
        const result = await response.json();
        if (!response.ok) {
          operation = { ...operation, conflictId: result.conflictId ?? operation.conflictId };
          operation = await changeOperation(
            operation,
            response.status === 409 ? 'conflict' : 'queued',
            result.error +
              (result.conflictId
                ? ' · Sent to the supervisor conflict inbox.'
                : ' · Export recovery for a supervisor if access is unavailable.')
          );
          if ([401, 403].includes(response.status)) throw new Error(result.error);
          continue;
        }
        operation = await changeOperation(
          operation,
          operation.photo ? 'photo_pending' : 'synced',
          '',
          result.id
        );
        if (operation.photo) {
          try {
            const uploaded = await fetch(`/api/meters/photo?id=${operation.payload.id}`, {
              method: 'POST',
              headers: { 'Content-Type': operation.payload.photo.mime },
              body: unbase64(operation.photo),
            });
            const status = await uploaded.json();
            if (!uploaded.ok) {
              await changeOperation(operation, 'photo_pending', status.error, result.id);
              if ([401, 403].includes(uploaded.status)) throw new Error(status.error);
            } else await changeOperation(operation, 'synced', '', result.id);
          } catch (e) {
            await changeOperation(
              operation,
              'photo_pending',
              e.message || 'Photo upload interrupted. Retry sync.',
              result.id
            );
          }
        }
      }
      const updated = await fetchSnapshot(vault.meta.organizationId);
      if (updated.userId !== vault.meta.userId)
        throw new Error('Account changed during sync. Queue retained.');
      await saveSnapshot(vault, updated);
      await loadLocal();
      if (!snapshot.routes.some((r) => r.id === routeId)) {
        routeId = snapshot.routes[0]?.id ?? '';
        index = 0;
      }
      render();
      await storageInfo();
      message(
        pending().length
          ? `${pending().length} entries or photos still need attention. See Sync & recovery.`
          : 'All device entries and photos are synced. Readings await supervisor review.'
      );
    };
    if (navigator.locks) await navigator.locks.request(`forgeos-sync:${vault.meta.scope}`, perform);
    else await perform();
  });
}
async function refresh() {
  await run(async () => {
    const server = await fetchSnapshot(vault.meta.organizationId);
    if (server.userId !== vault.meta.userId)
      throw new Error('Signed-in account differs from this queue. Sign in with the original account.');
    await saveSnapshot(vault, server);
    await loadLocal();
    if (!snapshot.routes.some((r) => r.id === routeId)) routeId = snapshot.routes[0]?.id ?? '';
    index = 0;
    clearDraft();
    render();
    message(
      'Assigned routes refreshed. Queued captures keep their original meter history for conflict checks.'
    );
  });
}
async function storageInfo() {
  if (!navigator.storage?.estimate) {
    $('storage-info').textContent =
      'Storage estimates are unavailable. Export an encrypted recovery copy before leaving coverage.';
    return;
  }
  const estimate = await navigator.storage.estimate();
  const persistent = await navigator.storage.persisted?.();
  $('storage-info').textContent =
    `Device storage: ${Math.ceil((estimate.usage ?? 0) / 1048576)} MB used of ${Math.floor((estimate.quota ?? 0) / 1048576)} MB · ${persistent ? 'Durable storage granted' : 'Browser may clear data; keep a recovery export'}`;
  if (estimate.quota && estimate.usage / estimate.quota > 0.85)
    message('Device storage is nearly full. Export the queue and sync before collecting more photos.', true);
}
async function autoLock() {
  if (!vault || busy) return;
  await run(async () => {
    if (dirty) {
      const { item } = current();
      await saveDraft(vault, {
        itemId: item?.id,
        value: $('register').value,
        flag: $('flag').value,
        kind: $('kind').value,
        notes: $('notes').value,
        photo,
      });
    }
    lock();
  });
}
function lock() {
  vault = null;
  snapshot = null;
  operations = [];
  savedDraft = null;
  photo = null;
  dirty = false;
  $('capture-form').reset();
  $('photo-preview').removeAttribute('src');
  $('stops').replaceChildren();
  $('queue-history').replaceChildren();
  $('route-choice').replaceChildren();
  for (const id of [
    'site-label',
    'meter-name',
    'meter-details',
    'route-title',
    'route-property',
    'route-window',
    'last-value',
    'validated-value',
    'stop-state',
    'utility-label',
    'unit-label',
    'photo-description',
  ])
    $(id).textContent = '';
  $('progress-text').textContent = '0 / 0';
  $('progress').value = 0;
  $('photo-preview').hidden = true;
  $('reader').hidden = true;
  $('setup').hidden = false;
  $('lock').hidden = true;
  message('Reader locked. Saved entries remain encrypted on this device.');
  refreshVaultList().catch((e) => message(e.message, true));
}
$('unlock-form').addEventListener('submit', prepare);
$('capture-form').addEventListener('submit', save);
$('capture-form').addEventListener('input', () => {
  dirty = true;
});
$('camera-button').addEventListener('click', () => $('camera').click());
$('camera').addEventListener('change', (event) => attachPhoto(event.target.files[0]));
$('remove-photo').addEventListener('click', () => {
  photo = null;
  $('camera').value = '';
  $('photo-preview').removeAttribute('src');
  $('photo-preview').hidden = true;
  $('remove-photo').hidden = true;
  $('photo-description').textContent = 'Optional · JPEG, PNG or WebP';
  dirty = true;
});
$('previous').addEventListener('click', () => navigate(index - 1));
$('next').addEventListener('click', () => navigate(index + 1));
$('stop-search').addEventListener('input', renderStops);
$('route-choice').addEventListener('change', () => {
  if (dirty && !confirm('Discard the unsaved observation and change routes?')) {
    $('route-choice').value = routeId;
    return;
  }
  routeId = $('route-choice').value;
  index = 0;
  clearDraft();
  render();
});
$('download').addEventListener('click', () => {
  if (dirty && !confirm('Discard the unsaved form and refresh routes?')) return;
  refresh();
});
$('sync').addEventListener('click', () => {
  if (dirty) {
    message('Save the current observation before syncing.', true);
    return;
  }
  sync();
});
$('lock').addEventListener('click', () => {
  if (dirty && !confirm('Discard the unsaved form and lock? Saved entries stay encrypted.')) return;
  if (vault) saveDraft(vault, null).catch((e) => message(e.message, true));
  lock();
});
$('contrast').addEventListener('click', () => {
  const enabled = document.documentElement.classList.toggle('outdoor');
  $('contrast').textContent = enabled ? 'Standard mode' : 'Outdoor mode';
  $('contrast').setAttribute('aria-pressed', String(enabled));
});
$('export').addEventListener('click', () =>
  run(async () => {
    const bundle = await exportVault(vault);
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
    const link = element('a');
    link.href = url;
    link.download = `ForgeOS-meter-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message('Encrypted recovery exported. Keep this file and the device passphrase together securely.');
  })
);
$('recovery-file').addEventListener('change', (event) =>
  run(async () => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1048576) throw new Error('Recovery file exceeds the 200 MB import limit.');
    await importVault(JSON.parse(await file.text()));
    await refreshVaultList();
    message('Recovery queue imported. Unlock it with its original device passphrase.');
  })
);
$('persist').addEventListener('click', () =>
  run(async () => {
    const granted = await navigator.storage?.persist?.();
    await storageInfo();
    message(
      granted
        ? 'Durable storage granted. Keep regular encrypted recovery exports.'
        : 'Durable storage was not granted by this browser. Export a recovery copy and sync regularly.'
    );
  })
);
$('forget').addEventListener('click', () =>
  run(async () => {
    if (pending().length) throw new Error('Pending entries cannot be removed. Sync or reconcile them first.');
    if (
      !confirm(
        'Remove this completed device queue? Export a recovery copy first if you need a local archive.'
      )
    )
      return;
    await forgetVault(vault);
    lock();
  })
);
window.addEventListener('offline', () => {
  setConnection();
  renderDisabled();
});
window.addEventListener('online', () => {
  setConnection();
  renderDisabled();
  if (vault && !busy && !dirty && pending().some((o) => o.state !== 'conflict' || !o.conflictId)) sync();
});
window.addEventListener('beforeunload', (event) => {
  if (dirty || (vault && pending().length)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
for (const event of ['pointerdown', 'keydown'])
  window.addEventListener(event, () => {
    lastActivity = Date.now();
  });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (vault && !busy) autoLock();
    }, 60000);
  } else {
    clearTimeout(lockTimer);
    if (vault && Date.now() - lastActivity > 600000 && !busy) autoLock();
  }
});
setInterval(() => {
  if (vault && !busy && Date.now() - lastActivity > 600000) autoLock();
}, 30000);
setConnection();
refreshVaultList().catch((e) =>
  message(`Local storage unavailable: ${e.message}. Do not start collection on this browser.`, true)
);
if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/tablet/sw.js', { scope: '/tablet/', updateViaCache: 'none' })
    .catch(() =>
      message('Offline shell preparation failed. Stay online and reload before leaving coverage.', true)
    );
else message('Offline installation is unavailable in this browser. Use a supported secure browser.', true);
