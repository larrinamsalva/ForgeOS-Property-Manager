import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { meterError } from '@/lib/meter-domain';
export const dynamic = 'force-dynamic';
function imageType(bytes: Uint8Array): string | null {
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (
    bytes.length > 8 &&
    Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.length > 12 &&
    Buffer.from(bytes.slice(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.slice(8, 12)).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
}
export async function GET(request: NextRequest) {
  const parsed = z.uuid().safeParse(request.nextUrl.searchParams.get('id'));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid photo.' }, { status: 400 });
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view photos.' }, { status: 401 });
  const { data: photo, error } = await client
    .from('meter_photos')
    .select('object_path,status')
    .eq('id', parsed.data)
    .single();
  if (error || photo?.status !== 'uploaded')
    return NextResponse.json({ error: 'Photo unavailable.' }, { status: 404 });
  const signed = await client.storage.from('meter-photos').createSignedUrl(photo.object_path, 60);
  if (signed.error) return NextResponse.json({ error: 'Photo access failed.' }, { status: 503 });
  return NextResponse.json(
    { url: signed.data.signedUrl, expiresIn: 60 },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  const parsed = z.uuid().safeParse(request.nextUrl.searchParams.get('id'));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid photo.' }, { status: 400 });
  if (Number(request.headers.get('content-length') ?? 0) > 5242880)
    return NextResponse.json({ error: 'Photo must be 5 MB or smaller.' }, { status: 413 });
  try {
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: 'Sign in again to sync the photo. It is saved on this device.' },
        { status: 401 }
      );
    const { data: photo, error } = await client
      .from('meter_photos')
      .select('*')
      .eq('id', parsed.data)
      .single();
    if (error || !photo || photo.created_by !== user.id)
      return NextResponse.json({ error: 'Photo access or route assignment changed.' }, { status: 403 });
    // Bound memory even when Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Photo is empty.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 5242880) {
        await reader.cancel();
        return NextResponse.json({ error: 'Photo must be 5 MB or smaller.' }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== photo.byte_size || digest !== photo.sha256 || imageType(bytes) !== photo.mime)
      return NextResponse.json(
        { error: 'Photo does not match the queued image. Preserve the queue for recovery.' },
        { status: 409 }
      );
    const bucket = client.storage.from('meter-photos');
    const upload = await bucket.upload(photo.object_path, bytes, {
      contentType: photo.mime,
      upsert: false,
      cacheControl: '0',
    });
    if (upload.error) {
      const existing = await bucket.download(photo.object_path);
      if (
        existing.error ||
        createHash('sha256')
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest('hex') !== digest
      )
        return NextResponse.json(
          { error: 'Photo upload failed. The local photo is preserved; retry sync.' },
          { status: 503 }
        );
    }
    const finish = await client.rpc('complete_meter_photo', { photo: photo.id });
    if (finish.error) {
      const mapped = meterError(finish.error.code, finish.error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Photo sync was interrupted. The local photo is preserved; retry sync.' },
      { status: 503 }
    );
  }
}
