import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { configured } from '@/lib/supabase/config';
import { sameOrigin } from '@/lib/request-origin';
import {
  mutationSchema,
  propertySchema,
  siteSchema,
  customerSchema,
  staySchema,
  moveoutSchema,
} from '@/lib/validation';
const messages: Record<string, string> = {
  '23P01': 'That site already has an overlapping stay. Choose another site or date.',
  '23505': 'That number already exists at this property.',
  '23503': 'Choose records from the same property and an existing registered staff account.',
  '42501': 'Your role does not allow this action.',
  '23514': 'Check the dates, amounts, and property settings.',
  archive_active: 'Complete active stays before archiving this record.',
  site_unavailable: 'This site is not ready for a new stay.',
  record_inactive: 'Restore the property and customer before creating a stay.',
  history_immutable: 'Completed stays and record ownership cannot be changed.',
  future_stay: 'Use today or an earlier move-in date. Future reservations arrive in Milestone 2.',
  invalid_moveout: 'Use a departure date from the move-in date through today.',
};
export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json'))
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  if (!configured())
    return NextResponse.json({ error: 'Connect the ForgeOS database first.' }, { status: 503 });
  const client = await serverClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  try {
    const input = mutationSchema.parse(await request.json());
    let result;
    if (input.entity === 'organization') {
      result = await client.rpc('create_organization', { organization_name: input.values.name });
    } else if (input.entity === 'access') {
      result = await client.rpc(
        input.action === 'grant' ? 'grant_property_access' : 'revoke_property_access',
        {
          organization: input.organization_id,
          property: input.values.property_id,
          member: input.values.user_id,
          ...(input.action === 'grant' ? { member_role: input.values.role } : {}),
        }
      );
    } else if (input.entity === 'stay') {
      if (input.action === 'moveout') {
        if (!input.id) throw new Error('missing_id');
        result = await client.rpc('complete_stay', {
          stay: input.id,
          departure: moveoutSchema.parse(input.values).ends_on,
        });
      } else {
        result = await client
          .from('occupancy_stays')
          .insert({ ...staySchema.parse(input.values), organization_id: input.organization_id })
          .select('id')
          .single();
      }
    } else {
      const table = { property: 'properties', site: 'sites_units', customer: 'customers' }[input.entity];
      if (input.action === 'archive' || input.action === 'restore') {
        if (!input.id) throw new Error('missing_id');
        result = await client
          .from(table)
          .update({ archived_at: input.action === 'archive' ? new Date().toISOString() : null })
          .eq('organization_id', input.organization_id)
          .eq('id', input.id)
          .select('id')
          .single();
      } else {
        const schema = { property: propertySchema, site: siteSchema, customer: customerSchema }[input.entity];
        const values = schema.parse(input.values);
        if (input.action === 'create')
          result = await client
            .from(table)
            .insert({ ...values, organization_id: input.organization_id })
            .select('id')
            .single();
        else {
          if (!input.id) throw new Error('missing_id');
          result = await client
            .from(table)
            .update(values)
            .eq('organization_id', input.organization_id)
            .eq('id', input.id)
            .select('id')
            .single();
        }
      }
    }
    if (result.error) {
      const error = result.error;
      return NextResponse.json(
        {
          error:
            messages[error.message] ??
            messages[error.code] ??
            'The record could not be saved. Check your access and try again.',
        },
        { status: error.code === '42501' ? 403 : 409 }
      );
    }
    return NextResponse.json(
      { ok: true, data: result.data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Check the form.' }, { status: 400 });
    return NextResponse.json({ error: 'Check your request and try again.' }, { status: 400 });
  }
}
