import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { configured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 5 * 1024 * 1024;
const uuid = z.uuid();
const mimeMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const;
const category = z.enum(['space','car','rv','motorcycle','offroad','boat','inspection','document','other']);
const noStore = { 'Cache-Control': 'private, no-store' };
type Mime = keyof typeof mimeMap;
const errorJson = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: noStore });

function checkType(bytes: Uint8Array): Mime | null {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (b.length >= 12 && b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

export async function GET(request: NextRequest) {
  if (!configured()) return errorJson('Files are not configured yet.', 503);
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return errorJson('Sign in to view files.', 401);
  const fileId = request.nextUrl.searchParams.get('file');
  if (fileId !== null) {
    if (!uuid.safeParse(fileId).success) return errorJson('Invalid file reference.', 400);
    const found = await client.from('record_attachments').select('object_path,status,mime')
      .eq('id',fileId).eq('status','uploaded').maybeSingle();
    if (found.error || !found.data) return errorJson('File unavailable or permission changed.', 404);
    const signed = await client.storage.from('record-attachments').createSignedUrl(found.data.object_path, 60);
    if (signed.error || !signed.data) return errorJson('Unable to open the protected file.', 503);
    return NextResponse.json({ url: signed.data.signedUrl, mime: found.data.mime, expiresIn: 60 }, { headers: noStore });
  }
  const propertyId = request.nextUrl.searchParams.get('property');
  const orgId = request.nextUrl.searchParams.get('organization');
  const targetId = request.nextUrl.searchParams.get('target');
  const kind = request.nextUrl.searchParams.get('kind');
  if (!uuid.safeParse(propertyId).success || !uuid.safeParse(orgId).success ||
      !uuid.safeParse(targetId).success || !['customer','site'].includes(kind ?? '')) {
    return errorJson('Choose a valid customer or space.', 400);
  }
  let query = client.from('record_attachments')
    .select('id,customer_id,site_id,category,title,mime,byte_size,created_at,created_by')
    .eq('organization_id',orgId!).eq('property_id',propertyId!).eq('status','uploaded')
    .order('created_at',{ascending:false}).limit(100);
  query = kind === 'customer' ? query.eq('customer_id',targetId!) : query.eq('site_id',targetId!);
  const files = await query;
  if (files.error) return errorJson('Files could not be loaded. Check access to this property.', 403);
  return NextResponse.json({ files: files.data ?? [] }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return errorJson('Request origin is not allowed.', 403);
  if (!configured()) return errorJson('Files are not configured yet.', 503);
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return errorJson('Sign in to save a file.', 401);
  const organization = request.headers.get('x-forgeos-organization');
  const property = request.headers.get('x-forgeos-property');
  const customer = request.headers.get('x-forgeos-customer') || null;
  const site = request.headers.get('x-forgeos-site') || null;
  let label = '';
  try { label = decodeURIComponent(request.headers.get('x-forgeos-title') ?? '').trim(); }
  catch { return errorJson('Invalid file label.', 400); }
  const checkedCategory = category.safeParse(request.headers.get('x-forgeos-category'));
  if (!uuid.safeParse(organization).success || !uuid.safeParse(property).success ||
      (customer && !uuid.safeParse(customer).success) || (site && !uuid.safeParse(site).success) ||
      (!customer && !site) || !checkedCategory.success || label.length < 1 || label.length > 160) {
    return errorJson('Choose the correct property, customer or space, and a file label.', 400);
  }
  const requestedMime = request.headers.get('content-type')?.split(';')[0] ?? '';
  if (!(requestedMime in mimeMap)) return errorJson('Use JPG, PNG, WebP, or PDF. Some phone HEIC photos need conversion.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return errorJson('File exceeds 5 MB. Please use a smaller scan or photo.', 413);

  // Owner/admin or assigned manager/office only. Record and Storage RLS independently enforce the same boundary.
  const [orgRole, propertyRole, propertyRecord] = await Promise.all([
    client.from('organization_memberships').select('role').eq('organization_id',organization!).eq('user_id',user.id).maybeSingle(),
    client.from('property_memberships').select('role').eq('organization_id',organization!).eq('property_id',property!).eq('user_id',user.id).maybeSingle(),
    client.from('properties').select('id,archived_at,operating_status').eq('organization_id',organization!).eq('id',property!).maybeSingle(),
  ]);
  if (orgRole.error || propertyRole.error || propertyRecord.error ||
    !(orgRole.data && ['owner','admin'].includes(orgRole.data.role) ||
      propertyRole.data && ['manager','office'].includes(propertyRole.data.role)) ||
    !propertyRecord.data || propertyRecord.data.archived_at || propertyRecord.data.operating_status !== 'active') {
    return errorJson('You need owner, manager, or office permission on an active property.', 403);
  }
  const scoped = { organization_id: organization!, property_id: property! };
  const [customerRecord,siteRecord] = await Promise.all([
    customer ? client.from('customers').select('id').match({ ...scoped, id: customer }).is('archived_at',null).maybeSingle() : null,
    site ? client.from('sites_units').select('id').match({ ...scoped, id: site }).is('archived_at',null).maybeSingle() : null,
  ]);
  if (customer && (!customerRecord || customerRecord.error || !customerRecord.data) ||
      site && (!siteRecord || siteRecord.error || !siteRecord.data)) {
    return errorJson('That customer or space is unavailable in this property.', 404);
  }

  if (!request.body) return errorJson('Choose a file or use the camera.', 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return errorJson('File exceeds 5 MB.', 413); }
      chunks.push(value);
    }
  } catch { return errorJson('Photo transfer stopped. Choose the image again to retry.', 400); }
  const bytes = Buffer.concat(chunks), detected = checkType(bytes);
  if (!length || !detected || detected !== requestedMime)
    return errorJson('File content and type do not match. Use a valid JPG, PNG, WebP or PDF.', 415);
  const path = [organization,property,customer ? 'customer' : 'site',customer ?? site,randomUUID() + '.' + mimeMap[detected]].join('/');
  const pending = await client.from('record_attachments').insert({
    ...scoped,customer_id: customer,site_id:site,category:checkedCategory.data,
    title:label,mime:detected,byte_size:length,object_path:path,created_by:user.id,status:'pending',
  }).select('id').single();
  if (pending.error || !pending.data) return errorJson('Cannot create a file record. Check staff access.', 403);
  const uploaded = await client.storage.from('record-attachments')
    .upload(path,bytes,{ contentType:detected,cacheControl:'0',upsert:false });
  if (uploaded.error) return errorJson('Photo not saved yet. Select the same file to retry while online.', 503);
  const finalized = await client.from('record_attachments').update({status:'uploaded'})
    .eq('id',pending.data.id).eq('status','pending').select('id').single();
  if (finalized.error || !finalized.data)
    return errorJson('Photo upload needs review before it appears in the record. Contact the owner.', 503);
  return NextResponse.json({ ok:true,id:pending.data.id,attachedTo:{customer_id:customer,site_id:site} },{headers:noStore});
}


// Two-phase removal keeps an audit tombstone while deleting physical bytes using the Storage API.
// If network access fails after the first phase, authorized staff can retry the same file.
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return errorJson('Request origin is not allowed.', 403);
  if (!configured()) return errorJson('Files are not configured yet.', 503);
  const client = await serverClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return errorJson('Sign in to remove a file.', 401);
  const fileId = request.nextUrl.searchParams.get('file');
  if (!uuid.safeParse(fileId).success) return errorJson('Choose a valid photo to remove.', 400);

  const result = await client.from('record_attachments')
    .select('id,status,object_path,organization_id,property_id,title,mime')
    .eq('id',fileId!).in('status',['uploaded','deleting']).maybeSingle();
  if (result.error || !result.data) return errorJson('File not found or permission denied.', 404);
  const file = result.data;
  const [orgRole, propertyRole, propertyRecord] = await Promise.all([
    client.from('organization_memberships').select('role').eq('organization_id',file.organization_id).eq('user_id',user.id).maybeSingle(),
    client.from('property_memberships').select('role').eq('organization_id',file.organization_id).eq('property_id',file.property_id).eq('user_id',user.id).maybeSingle(),
    client.from('properties').select('id,archived_at,operating_status').eq('organization_id',file.organization_id).eq('id',file.property_id).maybeSingle(),
  ]);
  if (orgRole.error || propertyRole.error || propertyRecord.error ||
      !(orgRole.data && ['owner','admin'].includes(orgRole.data.role) ||
        propertyRole.data && ['manager','office'].includes(propertyRole.data.role)) ||
      !propertyRecord.data || propertyRecord.data.archived_at || propertyRecord.data.operating_status !== 'active') {
    return errorJson('You need owner, manager or office permission to remove this file.', 403);
  }
  if (file.status === 'uploaded') {
    const staged = await client.from('record_attachments')
      .update({status:'deleting'}).eq('id',file.id).eq('status','uploaded').select('id').maybeSingle();
    if (staged.error || !staged.data) return errorJson('Could not begin removal. Refresh and retry.', 409);
  }
  // Never delete directly from storage.objects with SQL: the Storage API removes the actual bytes.
  const removed = await client.storage.from('record-attachments').remove([file.object_path]);
  if (removed.error) {
    return errorJson('Deletion started but storage removal was interrupted. Use Retry deletion on this file.', 503);
  }
  const finalized = await client.from('record_attachments').update({status:'deleted'})
    .eq('id',file.id).eq('status','deleting').select('id,deleted_at').maybeSingle();
  if (finalized.error || !finalized.data) {
    return errorJson('Deletion is not finished yet. Refresh and retry. No other records were changed.', 503);
  }
  return NextResponse.json({ok:true,removed:true,id:file.id},{headers:noStore});
}
