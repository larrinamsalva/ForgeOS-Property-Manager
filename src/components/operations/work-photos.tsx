'use client';
import { useState } from 'react';
import type { WorkPhoto } from '@/lib/operations-domain';
export function WorkPhotoForm({
  workId,
  existing,
  queue,
  onComplete,
  onCancel,
}: {
  workId: string;
  existing?: WorkPhoto;
  queue: (v: Record<string, unknown>) => Promise<{ id: string }>;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [kind, setKind] = useState(existing?.kind ?? 'request'),
    [caption, setCaption] = useState(existing?.caption ?? ''),
    [photoId, setPhotoId] = useState(existing?.id ?? ''),
    [savedHash, setSavedHash] = useState(existing?.sha256 ?? ''),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !file) return;
    setPending(true);
    setError('');
    try {
      if (
        file.size < 1 ||
        file.size > 5242880 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
        throw new Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
      const bytes = await file.arrayBuffer(),
        hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
          b.toString(16).padStart(2, '0')
        ).join('');
      if (savedHash && savedHash !== hash)
        throw new Error(
          'Choose the same original image for this pending photo. Start a new photo record for a different file.'
        );
      let id = photoId;
      if (!id) {
        id = (
          await queue({
            work_order_id: workId,
            kind,
            caption,
            mime: file.type,
            byte_size: file.size,
            sha256: hash,
            reason: 'Register private maintenance photograph',
          })
        ).id;
        setPhotoId(id);
        setSavedHash(hash);
      }
      const response = await fetch(`/api/operations/photo?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: bytes,
      });
      if (!response.ok) throw new Error((await response.json()).error);
      onComplete();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Upload unavailable. Select the same original file to retry.'
      );
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p>
        Private work evidence. Pending metadata survives an interrupted upload; select the same file to retry.
        Images are not saved offline by this screen.
      </p>
      <fieldset disabled={pending} className="form-grid">
        <div className="field">
          <label htmlFor="photo-kind">Photo stage</label>
          <select
            id="photo-kind"
            value={kind}
            disabled={!!photoId}
            onChange={(e) => setKind(e.target.value as WorkPhoto['kind'])}
          >
            {['request', 'before', 'after'].map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="photo-caption">Caption</label>
          <input
            id="photo-caption"
            value={caption}
            disabled={!!photoId}
            maxLength={500}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <div className="field wide">
          <label htmlFor="work-photo-file">Work photograph</label>\n          <small>Take a picture with your camera or choose an image.</small>
          <input
            id="work-photo-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </fieldset>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={pending || !file}>
          {pending ? 'Uploading…' : 'Upload work photo'}
        </button>
      </div>
    </form>
  );
}
