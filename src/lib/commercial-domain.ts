import type { StatementInvoice, StatementRevision, StatementLedger } from './statement-domain';
import type { CollectionAccount } from './collections-domain';
export interface CommercialRow {
  id: string;
  organization_id: string;
  property_id: string;
  created_at: string;
  created_by: string;
}
export interface PortalMembership extends CommercialRow {
  customer_id: string;
  user_id: string;
  starts_on: string;
  expires_on: string | null;
  active: boolean;
  version: number;
}
export interface CommunicationPreference extends CommercialRow {
  customer_id: string;
  language: 'en' | 'es';
  in_app: boolean;
  email_opt_in: boolean;
  sms_opt_in: boolean;
  version: number;
  reason: string;
}
export interface MessageTemplate extends CommercialRow {
  name: string;
  language: 'en' | 'es';
  category: string;
  title: string;
  body: string;
  archived: boolean;
  version: number;
}
export interface Communication extends CommercialRow {
  template_id: string | null;
  language: 'en' | 'es';
  category: string;
  title: string;
  body: string;
  scheduled_for: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'cancelled';
  published_at: string | null;
  decision_reason: string;
  version: number;
}
export interface CommunicationRecipient extends CommercialRow {
  communication_id: string;
  customer_id: string;
  customer_name: string;
  site_label: string;
  title: string;
  body: string;
  status: 'queued' | 'published' | 'skipped' | 'cancelled';
  decision_reason: string;
  published_at: string | null;
  read_at: string | null;
}
export interface CommunicationNote extends CommercialRow {
  communication_id: string;
  body: string;
}
export interface ContactProposal {
  email?: string;
  phone?: string;
  mailing_address?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}
export interface ContactRequest extends CommercialRow {
  customer_id: string;
  membership_id: string;
  proposed: ContactProposal;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  decision_reason: string;
  version: number;
}
export interface AccountExport {
  id: string;
  organization_id: string;
  created_at: string;
  created_by: string;
  status: 'pending' | 'ready' | 'failed';
  sha256: string | null;
  byte_size: number | null;
  reason: string;
  failure_code: string;
}
export interface CommercialSnapshot {
  memberships: PortalMembership[];
  preferences: CommunicationPreference[];
  templates: MessageTemplate[];
  messages: Communication[];
  recipients: CommunicationRecipient[];
  notes: CommunicationNote[];
  contacts: ContactRequest[];
  exports: AccountExport[];
}
export const messageCategories = [
  'general',
  'reservation',
  'arrival',
  'payment',
  'rent',
  'utilities',
  'maintenance',
  'emergency',
  'service',
] as const;
export const messageTokens = ['customer_name', 'property_name', 'site_label', 'today'] as const;
export function renderMessage(
  source: string,
  context: Record<(typeof messageTokens)[number], string>
): string {
  if (!source.trim() || source.length > 4000) throw new Error('Enter a message within 4,000 characters.');
  const rendered = source.replace(/\{\{([\s\S]*?)\}\}/g, (_, token: string) => {
    if (!messageTokens.includes(token as (typeof messageTokens)[number]))
      throw new Error('Use only the listed placeholders.');
    return context[token as (typeof messageTokens)[number]];
  });
  if (source.replace(/\{\{[\s\S]*?\}\}/g, '').includes('{{')) throw new Error('Close each placeholder.');
  return rendered;
}
export interface PortalAccount {
  id: string;
  organization_id: string;
  property_id: string;
  customer_id: string;
  property_name: string;
  customer_name: string;
  expires_on: string | null;
}
export interface PortalMessage {
  id: string;
  title: string;
  body: string;
  language: 'en' | 'es';
  category: string;
  published_at: string;
  read_at: string | null;
}
export interface PortalContact {
  id: string;
  proposed: ContactProposal;
  status: ContactRequest['status'];
  decision_reason: string;
  version: number;
  created_at: string;
}
export interface PortalInvoice {
  id: string;
  number: string;
  starts_on: string;
  ends_on: string;
  issued_on: string;
  due_on: string;
  created_at: string;
  total_cents: string;
  account: CollectionAccount;
}
export interface PortalSnapshot {
  membership_id: string;
  as_of: string;
  page: number;
  read_only: boolean;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string;
    email: string;
    timezone: string;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    mailing_address: string;
    emergency_contact: string;
    emergency_phone: string;
  };
  preferences: {
    version: number | null;
    language: 'en' | 'es';
    in_app: boolean;
    email_opt_in: boolean;
    sms_opt_in: boolean;
  };
  outstanding_cents: string;
  current_stays: {
    id: string;
    site_label: string;
    starts_on: string;
    planned_ends_on: string | null;
    rate_cents: string;
    billing_period: string;
  }[];
  invoices: PortalInvoice[];
  receipts: {
    id: string;
    number: string;
    kind: string;
    amount_cents: string;
    effective_on: string;
    created_at: string;
  }[];
  leases: {
    id: string;
    site_label: string;
    starts_on: string;
    ends_on: string;
    billing_period: string;
    agreed_rate_cents: string;
    deposit_required_cents: string;
    document_reference: string;
    status: string;
  }[];
  requests: {
    id: string;
    work_order_id: string;
    number: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    requested_on: string;
    status: string;
    completed_on: string | null;
    closed_on: string | null;
    site_label: string;
    created_at: string;
  }[];
  messages: PortalMessage[];
  contacts: PortalContact[];
  reservations: {
    id: string;
    site_label: string;
    confirmation_code: string;
    starts_on: string;
    ends_on: string;
    status: string;
    billing_period: string;
    agreed_rate_cents: string;
  }[];
  has_more: Record<
    'invoices' | 'receipts' | 'leases' | 'requests' | 'messages' | 'contacts' | 'reservations',
    boolean
  >;
}
export interface PortalInvoiceDocument {
  invoice: StatementInvoice;
  revision: StatementRevision;
  ledger: StatementLedger[];
  collection: CollectionAccount;
}
export type PortalReceiptDocument = import('./statement-domain').StatementReceipt;
