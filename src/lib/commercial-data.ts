import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rows } from './billing-data';
import type { CommercialSnapshot } from './commercial-domain';
export async function loadCommercialSnapshot(
  client: SupabaseClient,
  org: string
): Promise<CommercialSnapshot> {
  const names = [
    'portal_memberships',
    'communication_preferences',
    'message_templates',
    'communications',
    'communication_recipients',
    'communication_notes',
    'portal_contact_requests',
    'account_exports',
  ];
  const [memberships, preferences, templates, messages, recipients, notes, contacts, exports] =
    await Promise.all(names.map((name) => rows(client, name, org)));
  return {
    memberships,
    preferences,
    templates,
    messages,
    recipients,
    notes,
    contacts,
    exports,
  } as unknown as CommercialSnapshot;
}
