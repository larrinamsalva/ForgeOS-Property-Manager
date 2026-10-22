import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { apiSession, apiFailure, rpcFailure, noStore } from '@/lib/api-session';
import { sameOrigin } from '@/lib/request-origin';
import { readJson } from '@/lib/request-body';
import { createArchive } from '@/lib/archive-format.mjs';
export const dynamic = 'force-dynamic';
const schema = z.object({ organization_id: z.uuid(), reason: z.string().trim().min(3).max(2000) }).strict();
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  try {
    const { client } = await apiSession();
    const { organization_id, reason } = schema.parse(await readJson(request));
    const begin = await client.rpc('commercial_command', {
      command: 'begin_export',
      payload: { organization_id, reason, request_id: randomUUID() },
    });
    if (begin.error) return rpcFailure(begin.error);
    const id = String(begin.data.id);
    async function fail(code: string) {
      await client.rpc('commercial_command', {
        command: 'finish_export',
        payload: {
          organization_id,
          request_id: randomUUID(),
          id,
          reason,
          status: 'failed',
          sha256: null,
          byte_size: null,
          manifest: {},
          failure_code: code,
        },
      });
    }
    try {
      const snapshot = await client.rpc('account_export_snapshot', { org: organization_id, export_id: id });
      if (snapshot.error) {
        await fail(
          snapshot.error.message === 'account_export_too_large'
            ? 'account_export_too_large'
            : 'snapshot_unavailable'
        );
        return rpcFailure(snapshot.error);
      }
      const { archive, content, checksum_sha256 } = createArchive(snapshot.data);
      const finish = await client.rpc('commercial_command', {
        command: 'finish_export',
        payload: {
          organization_id,
          request_id: randomUUID(),
          id,
          reason,
          status: 'ready',
          sha256: checksum_sha256,
          byte_size: Buffer.byteLength(content),
          manifest: archive.manifest,
          failure_code: '',
        },
      });
      if (finish.error) return rpcFailure(finish.error);
      return new Response(content, {
        headers: {
          ...noStore,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ForgeOS-account-' + id + '.json"',
          'X-ForgeOS-Archive-SHA256': checksum_sha256,
        },
      });
    } catch (error) {
      await fail(
        error instanceof Error && error.message === 'account_export_too_large'
          ? 'account_export_too_large'
          : 'generation_failed'
      );
      if (error instanceof Error && error.message === 'account_export_too_large')
        return rpcFailure({ code: 'P0001', message: 'account_export_too_large' });
      return apiFailure(error);
    }
  } catch (error) {
    return apiFailure(error);
  }
}
