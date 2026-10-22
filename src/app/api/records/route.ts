import { readJson, BodyError } from '@/lib/request-body';
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
  reservationSchema,
  leaseSchema,
  reasonSchema,
  checkinSchema,
  planSchema,
  transferSchema,
} from '@/lib/validation';
const messages: Record<string, string> = {
  '23P01': 'That site has an overlapping reservation, stay, or lease term. Choose another site or date.',
  '23505': 'That record or reference already exists.',
  '23503': 'Choose records from the same property and an existing registered staff account.',
  '42501': 'Your role does not allow this action.',
  '23514': 'Check the dates, amounts, and property settings.',
  archive_active:
    'Complete active stays and cancel or relocate confirmed bookings before archiving this record.',
  site_unavailable: 'This site is not ready for a new stay.',
  record_inactive: 'Restore the property and customer before creating a stay.',
  history_immutable: 'Completed stays and record ownership cannot be changed.',
  future_stay: 'Use today or an earlier move-in date. Use Reservations for future arrivals.',
  invalid_moveout: 'Use a departure date from the move-in date through today.',
  invalid_departure_plan: 'Use today or a later planned departure after the move-in date.',
  invalid_transition: 'That status change is not available. Check the dates and record history.',
  booking_in_past: 'Use today or a future arrival date for a booking.',
  incompatible_site: 'Choose a compatible site type and RV length.',
  overdue_departure:
    'The current occupant is overdue for departure. Complete move-out before booking this site.',
  site_occupied: 'That site already has an overlapping active stay. Complete its departure first.',
  invalid_checkin: 'Check-in needs a confirmed booking with arrival due and departure still ahead.',
  invalid_transfer: 'Choose a different compatible site at the same property and provide a reason.',
  invalid_renewal: 'A renewal must follow the prior recorded term at the same stay.',
  invalid_lease_term: 'Check the lease dates and the linked stay.',
  void_renewal_first: 'Void later renewals before voiding their earlier term.',
  reason_required: 'Provide a reason for this change.',
  PGRST116: 'The record changed or is unavailable. Reload and try again.',
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
    const input = mutationSchema.parse(await readJson(request));
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
    } else if (input.entity === 'reservation') {
      if (input.action === 'create') {
        result = await client
          .from('reservations')
          .insert({ ...reservationSchema.parse(input.values), organization_id: input.organization_id })
          .select('id')
          .single();
      } else if (input.action === 'checkin') {
        if (!input.id) throw new Error('missing_id');
        const { starts_on, ...details } = checkinSchema.parse(input.values);
        result = await client.rpc('check_in_reservation', { booking: input.id, arrival: starts_on, details });
      } else {
        if (!input.id || !input.version) throw new Error('missing_version');
        const values =
          input.action === 'update'
            ? reservationSchema.parse(input.values)
            : input.action === 'confirm'
              ? { status: 'confirmed' }
              : {
                  status: input.action === 'cancel' ? 'cancelled' : 'no_show',
                  cancellation_reason: reasonSchema.parse(input.values).reason,
                };
        result = await client
          .from('reservations')
          .update(values)
          .eq('organization_id', input.organization_id)
          .eq('id', input.id)
          .eq('updated_at', input.version)
          .select('id')
          .single();
      }
    } else if (input.entity === 'lease') {
      if (input.action === 'create') {
        const values = leaseSchema.parse(input.values);
        const lookup = await client
          .from('occupancy_stays')
          .select('id,property_id,customer_id,site_id')
          .eq('organization_id', input.organization_id)
          .eq('id', values.stay_id)
          .single();
        if (lookup.error) result = lookup;
        else
          result = await client
            .from('lease_terms')
            .insert({
              ...values,
              organization_id: input.organization_id,
              property_id: lookup.data.property_id,
              customer_id: lookup.data.customer_id,
              site_id: lookup.data.site_id,
            })
            .select('id')
            .single();
      } else {
        if (!input.id || !input.version) throw new Error('missing_version');
        result = await client
          .from('lease_terms')
          .update({ status: 'voided', void_reason: reasonSchema.parse(input.values).reason })
          .eq('organization_id', input.organization_id)
          .eq('id', input.id)
          .eq('updated_at', input.version)
          .select('id')
          .single();
      }
    } else if (input.entity === 'stay') {
      if (input.action === 'moveout') {
        if (!input.id) throw new Error('missing_id');
        const { ends_on, ...details } = moveoutSchema.parse(input.values);
        result = await client.rpc('complete_stay_checklist', {
          stay: input.id,
          departure: ends_on,
          details,
        });
      } else if (input.action === 'plan') {
        if (!input.id) throw new Error('missing_id');
        const values = planSchema.parse(input.values);
        result = await client.rpc('change_stay_plan', {
          stay: input.id,
          departure: values.planned_ends_on,
          reason: values.reason,
        });
      } else if (input.action === 'transfer') {
        if (!input.id) throw new Error('missing_id');
        const { agreed_rate, ...values } = transferSchema.parse(input.values);
        result = await client.rpc('transfer_stay', { stay: input.id, rate_cents: agreed_rate, ...values });
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
    if (error instanceof BodyError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Check the form.' }, { status: 400 });
    return NextResponse.json({ error: 'Check your request and try again.' }, { status: 400 });
  }
}
